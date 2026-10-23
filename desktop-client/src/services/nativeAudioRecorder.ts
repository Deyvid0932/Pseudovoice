import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import { inferenceSocketService } from "./inferenceSocketService";
import { tauriBridge } from "./tauriBridge";
import { voiceCaptureGate } from "./voiceCaptureGate";

class NativeAudioRecorder {
  private unlisten: UnlistenFn | null = null;
  private isRecording = false;
  private speechDetected = false;
  private silenceFrames = 0;
  private preRoll: Int16Array[] = [];
  private unsubscribeGate: (() => void) | null = null;
  private mode: "conversation" | "wake" = "conversation";
  private operation: Promise<unknown> = Promise.resolve();

  private enqueue<T>(action: () => Promise<T>): Promise<T> {
    const next = this.operation.then(action);
    this.operation = next.catch(() => undefined);
    return next;
  }

  start(onLevels?: (levels: number[]) => void, autoEnd = true): Promise<boolean> {
    return this.enqueue(() => this.startRecording("conversation", onLevels, undefined, autoEnd));
  }

  startWake(onAudio: (samples: Int16Array) => void): Promise<boolean> {
    return this.enqueue(() => this.startRecording("wake", undefined, onAudio));
  }

  stopWake(): Promise<void> {
    return this.enqueue(async () => { if (this.mode === "wake") await this.stopRecording(); });
  }

  private async startRecording(mode: "conversation" | "wake", onLevels?: (levels: number[]) => void, onAudio?: (samples: Int16Array) => void, autoEnd = true): Promise<boolean> {
    if (this.isRecording && this.mode === mode) return true;
    if (this.isRecording) await this.stopRecording();
    this.mode = mode;
    if (!tauriBridge.isTauri()) return false;

    this.unsubscribeGate = voiceCaptureGate.subscribe(() => {
      this.speechDetected = false;
      this.silenceFrames = 0;
      this.preRoll = [];
    });

    this.unlisten = await listen<number[]>("voice-pcm", ({ payload }) => {
      if (!this.isRecording || payload.length === 0) return;
      if (voiceCaptureGate.isBlocked()) {
        onLevels?.(Array(40).fill(0.06));
        return;
      }
      const samples = Int16Array.from(payload);
      if (mode === "wake") { onAudio?.(samples); return; }
      if (inferenceSocketService.usesServerVad()) {
        this.speechDetected = true; // Server owns speech validation and the 300 ms ring.
        inferenceSocketService.sendAudioChunk(samples.buffer);
        onLevels?.(this.levelsFromPcm(samples));
        return;
      }
      let energy = 0;
      for (const sample of samples) {
        const normalized = sample / 32768;
        energy += normalized * normalized;
      }
      const rms = Math.sqrt(energy / samples.length);
      let endSpeech = false;
      if (rms >= 0.014) {
        if (!this.speechDetected) {
          for (const previous of this.preRoll) inferenceSocketService.sendAudioChunk(new Uint8Array(previous.buffer, previous.byteOffset, previous.byteLength));
          this.preRoll = [];
        }
        this.speechDetected = true;
        this.silenceFrames = 0;
      } else if (this.speechDetected && ++this.silenceFrames >= 16 && autoEnd) {
        endSpeech = true;
        this.speechDetected = false;
        this.silenceFrames = 0;
      } else if (!this.speechDetected) {
        this.preRoll.push(samples);
        if (this.preRoll.length > 2) this.preRoll.shift();
        onLevels?.(this.levelsFromPcm(samples));
        return;
      }

      inferenceSocketService.sendAudioChunk(samples.buffer);
      if (endSpeech) inferenceSocketService.sendEndOfSpeech();
      onLevels?.(this.levelsFromPcm(samples));
    });

    try {
      await tauriBridge.startVoiceCapture();
      this.speechDetected = false;
      this.silenceFrames = 0;
      this.isRecording = true;
      if (mode === "conversation") inferenceSocketService.startCapture(autoEnd);
      return true;
    } catch (error) {
      this.unlisten();
      this.unlisten = null;
      this.unsubscribeGate?.();
      this.unsubscribeGate = null;
      throw error;
    }
  }

  stop(): Promise<void> {
    return this.enqueue(() => this.stopRecording());
  }
  hasSpeech(): boolean { return this.speechDetected; }

  private async stopRecording(): Promise<void> {
    if (!this.isRecording) return;
    const submitSpeech = this.mode === "conversation" && this.speechDetected;
    try {
      await tauriBridge.stopVoiceCapture();
    } finally {
      this.isRecording = false;
      this.unlisten?.();
      this.unlisten = null;
      this.unsubscribeGate?.();
      this.unsubscribeGate = null;
      this.speechDetected = false;
      this.silenceFrames = 0;
      if (this.mode === "conversation") {
        if (submitSpeech || inferenceSocketService.usesServerVad()) inferenceSocketService.sendEndOfSpeech();
        else inferenceSocketService.discardCapturedAudio();
      }
    }
  }

  private levelsFromPcm(samples: Int16Array): number[] {
    const bars = 40;
    return Array.from({ length: bars }, (_, index) => {
      const start = Math.floor((index * samples.length) / bars);
      const end = Math.max(start + 1, Math.floor(((index + 1) * samples.length) / bars));
      let energy = 0;
      for (let sampleIndex = start; sampleIndex < Math.min(end, samples.length); sampleIndex++) {
        const normalized = samples[sampleIndex] / 32768;
        energy += normalized * normalized;
      }
      return Math.min(1, Math.max(0.06, Math.sqrt(energy / Math.max(1, end - start)) * 5));
    });
  }
}

export const nativeAudioRecorder = new NativeAudioRecorder();
