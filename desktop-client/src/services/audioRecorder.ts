import pcmCaptureProcessorUrl from "./pcmCaptureProcessor.js?url&no-inline";
import { inferenceSocketService } from "./inferenceSocketService";
import { voiceCaptureGate } from "./voiceCaptureGate";

/**
 * Captura de micrófono en tiempo real mediante AudioWorklet.
 * El worklet agrupa y convierte PCM en su hilo de audio; este servicio solo
 * reenvía cada bloque al WebSocket y actualiza el visualizador.
 */
class AudioRecorderService {
  private mediaStream: MediaStream | null = null;
  private audioContext: AudioContext | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private analyser: AnalyserNode | null = null;
  private processor: AudioWorkletNode | null = null;
  private silentOutput: GainNode | null = null;
  private visualizationFrame: number | null = null;
  private isRecording = false;
  private onLevelsCallback: ((levels: number[]) => void) | null = null;
  private pendingFlushResolver: (() => void) | null = null;
  private stopPromise: Promise<boolean> | null = null;
  private currentSegmentHasAudio = false;
  private submittedSpeechDuringCapture = false;
  private unsubscribeGate: (() => void) | null = null;

  public async start(onLevels?: (levels: number[]) => void, autoEnd = true): Promise<boolean> {
    // A disconnect can still be draining the previous worklet when the user
    // immediately tries to start capture again. Wait for its resources to be
    // released instead of reporting success for a recorder about to stop.
    if (this.stopPromise) await this.stopPromise;
    if (this.isRecording) return true;

    try {
      this.onLevelsCallback = onLevels || null;
      this.currentSegmentHasAudio = false;
      this.submittedSpeechDuringCapture = false;
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });

      const AudioContextConstructor = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) throw new Error("Este navegador no admite captura de audio moderna.");

      this.audioContext = new AudioContextConstructor({ sampleRate: 16000 });
      if (!this.audioContext.audioWorklet) throw new Error("AudioWorklet no está disponible. Actualiza el WebView o el navegador.");
      await this.audioContext.audioWorklet.addModule(pcmCaptureProcessorUrl);

      this.source = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.analyser = this.audioContext.createAnalyser();
      this.analyser.fftSize = 128;
      this.analyser.smoothingTimeConstant = 0.6;

      this.processor = new AudioWorkletNode(this.audioContext, "pseudovoice-pcm-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
        processorOptions: {
          chunkSize: 2048,
          silenceFrameLimit: 16,
          autoEnd,
          serverVad: inferenceSocketService.usesServerVad(),
          // Keep quiet voices from being classified as silence. Whisper still
          // validates the submitted audio, so this does not force a transcript.
          speechThreshold: 0.004,
        },
      });
      this.unsubscribeGate = voiceCaptureGate.subscribe(blocked => {
        this.currentSegmentHasAudio = false;
        this.processor?.port.postMessage({ type: "capture-suppressed", suppressed: blocked });
      });
      this.processor.port.onmessage = (event: MessageEvent<{ type: string; pcm?: ArrayBuffer }>) => {
        if (event.data.type === "flush-complete") {
          this.pendingFlushResolver?.();
          this.pendingFlushResolver = null;
          return;
        }
        if (!this.isRecording) return;
        if (voiceCaptureGate.isBlocked()) return;
        if (event.data.type === "audio" && event.data.pcm) {
          this.currentSegmentHasAudio = true;
          inferenceSocketService.sendAudioChunk(event.data.pcm);
        } else if (event.data.type === "speech-end") {
          inferenceSocketService.sendEndOfSpeech();
          this.currentSegmentHasAudio = false;
          this.submittedSpeechDuringCapture = true;
        }
      };

      // El nodo necesita una salida conectada para procesar audio; se silencia
      // explícitamente para no monitorizar el micrófono por los altavoces.
      this.silentOutput = this.audioContext.createGain();
      this.silentOutput.gain.value = 0;
      this.source.connect(this.analyser);
      this.source.connect(this.processor);
      this.processor.connect(this.silentOutput);
      this.silentOutput.connect(this.audioContext.destination);

      this.isRecording = true;
      inferenceSocketService.startCapture(autoEnd);
      await this.audioContext.resume();
      this.updateVisualization();
      return true;
    } catch (error) {
      console.error("No se pudo iniciar la captura de micrófono:", error);
      this.isRecording = false;
      this.releaseAudioResources();
      return false;
    }
  }

  public stop(): Promise<boolean> {
    if (!this.stopPromise) {
      this.stopPromise = this.stopRecording().finally(() => {
        this.stopPromise = null;
      });
    }
    return this.stopPromise;
  }

  private async stopRecording(): Promise<boolean> {
    const wasRecording = this.isRecording;
    if (wasRecording && this.processor) {
      // Drain the final partial PCM block before closing the worklet port.
      await new Promise<void>(resolve => {
        const timeout = window.setTimeout(resolve, 500);
        this.pendingFlushResolver = () => {
          window.clearTimeout(timeout);
          resolve();
        };
        this.processor?.port.postMessage({ type: "flush" });
      });
      this.pendingFlushResolver = null;
    }
    const shouldSubmitCurrentSegment = this.currentSegmentHasAudio;
    this.isRecording = false;
    this.onLevelsCallback = null;
    this.releaseAudioResources();

    if (wasRecording && (shouldSubmitCurrentSegment || inferenceSocketService.usesServerVad())) {
      inferenceSocketService.sendEndOfSpeech();
      this.submittedSpeechDuringCapture = true;
    }
    this.currentSegmentHasAudio = false;
    return this.submittedSpeechDuringCapture;
  }

  private updateVisualization = (): void => {
    if (!this.isRecording || !this.analyser || !this.onLevelsCallback) return;

    const freqData = new Uint8Array(this.analyser.frequencyBinCount);
    if (!voiceCaptureGate.isBlocked()) this.analyser.getByteFrequencyData(freqData);
    const barCount = 40;
    const step = Math.max(1, Math.floor(freqData.length / barCount));
    const levels = Array.from({ length: barCount }, (_, index) => {
      const raw = freqData[Math.min(index * step, freqData.length - 1)] / 255;
      return Math.min(1, Math.max(0.06, raw * 1.3));
    });
    this.onLevelsCallback(levels);
    this.visualizationFrame = window.requestAnimationFrame(this.updateVisualization);
  };

  private releaseAudioResources(): void {
    this.unsubscribeGate?.();
    this.unsubscribeGate = null;
    if (this.visualizationFrame !== null) {
      window.cancelAnimationFrame(this.visualizationFrame);
      this.visualizationFrame = null;
    }

    if (this.processor) {
      this.processor.port.onmessage = null;
      this.processor.port.close();
      this.processor.disconnect();
      this.processor = null;
    }
    this.source?.disconnect();
    this.source = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.silentOutput?.disconnect();
    this.silentOutput = null;

    this.mediaStream?.getTracks().forEach(track => track.stop());
    this.mediaStream = null;

    if (this.audioContext) {
      const context = this.audioContext;
      this.audioContext = null;
      if (context.state !== "closed") void context.close().catch(() => undefined);
    }
  }

  public getIsRecording(): boolean {
    return this.isRecording;
  }
}

export const audioRecorder = new AudioRecorderService();
