import { aiInferenceService } from "./aiInferenceService";
import { nativeAudioRecorder } from "./nativeAudioRecorder";
import { voiceCaptureGate } from "./voiceCaptureGate";

interface WakeOptions {
  phrase: string;
  characters: Array<{ id: number; name: string }>;
  onDetected: (id: number, text: string) => Promise<void>;
  onStatus: (status: string) => void;
  onError: (message: string) => void;
}

class WakeListener {
  private generation = 0;
  private chunks: Int16Array[] = [];
  private preRoll: Int16Array[] = [];
  private samples = 0;
  private silence = 0;
  private busy = false;
  private controller: AbortController | null = null;
  private unsubscribeGate: (() => void) | null = null;

  private reset(): void { this.chunks = []; this.preRoll = []; this.samples = 0; this.silence = 0; }

  async start(options: WakeOptions): Promise<void> {
    const generation = ++this.generation;
    this.reset();
    this.busy = false;
    this.unsubscribeGate?.();
    this.unsubscribeGate = voiceCaptureGate.subscribe(() => this.reset());
    const started = await nativeAudioRecorder.startWake(samples => {
      if (generation !== this.generation || this.busy || voiceCaptureGate.isBlocked()) return;
      let energy = 0;
      for (const sample of samples) energy += (sample / 32768) ** 2;
      const voiced = Math.sqrt(energy / samples.length) >= 0.014;
      if (!voiced && !this.samples) {
        this.preRoll.push(samples);
        if (this.preRoll.length > 2) this.preRoll.shift();
        return;
      }
      if (!this.samples) {
        this.chunks.push(...this.preRoll);
        this.samples = this.preRoll.reduce((count, chunk) => count + chunk.length, 0);
        this.preRoll = [];
      }
      this.chunks.push(samples);
      this.samples += samples.length;
      this.silence = voiced ? 0 : this.silence + 1;
      if (this.samples >= 96000 || this.silence >= 6) {
        if (this.samples < 4800) { this.reset(); return; }
        const pcm = new Int16Array(Math.min(this.samples, 96000));
        let offset = 0;
        for (const chunk of this.chunks) {
          const tail = chunk.subarray(0, pcm.length - offset);
          pcm.set(tail, offset);
          offset += tail.length;
          if (offset === pcm.length) break;
        }
        this.reset();
        this.busy = true;
        this.controller = new AbortController();
        options.onStatus("Detectando frase…");
        void aiInferenceService.detectWake(pcm, options.phrase, options.characters, this.controller.signal)
          .then(async result => {
            if (generation !== this.generation || voiceCaptureGate.isBlocked()) return;
            if (result.character_id !== null) {
              await this.stop();
              options.onStatus("Activando personaje…");
              await options.onDetected(result.character_id, result.remaining_text);
            } else options.onStatus("Escuchando activación");
          })
          .catch(error => {
            if (generation === this.generation && !this.controller?.signal.aborted) options.onError(String(error));
          })
          .finally(() => { if (generation === this.generation) this.busy = false; });
      }
    });
    if (!started) throw new Error("La activación por voz requiere la aplicación de escritorio y acceso al micrófono.");
    if (generation === this.generation) options.onStatus("Escuchando activación");
  }

  async stop(): Promise<void> {
    this.generation++;
    this.controller?.abort();
    this.controller = null;
    this.unsubscribeGate?.();
    this.unsubscribeGate = null;
    this.reset();
    await nativeAudioRecorder.stopWake();
  }
}

export const wakeListener = new WakeListener();
