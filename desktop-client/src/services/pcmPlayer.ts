/**
 * Reproductor de streaming de audio PCM crudo (16-bit, 24000 Hz, mono) para Web Audio API.
 * Evita AudioContext.decodeAudioData() (el cual falla con PCM sin cabecera WAV/RIFF).
 * Incorpora cursor temporal sincronizado contra lag de red y pausas.
 */

import { voiceCaptureGate } from "./voiceCaptureGate";

class PcmStreamingPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private nextStartTime: number = 0;
  private muted: boolean = false;
  private readonly sampleRate: number = 24000;
  private sources = new Set<AudioBufferSourceNode>();

  private initContext(): AudioContext {
    if (!this.audioContext) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioCtx({ sampleRate: this.sampleRate });
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = this.muted ? 0 : 1;
      this.gainNode.connect(this.audioContext.destination);
      this.nextStartTime = this.audioContext.currentTime;
    }
    if (this.audioContext.state === "suspended") {
      this.audioContext.resume();
    }
    return this.audioContext;
  }

  /**
   * Recibe el ArrayBuffer binario directo del WebSocket (PCM 16-bit mono),
   * lo convierte a Float32Array normalizado (-1.0 a 1.0) y lo encola secuencialmente.
   */
  public feedBinaryChunk(arrayBuffer: ArrayBuffer): void {
    const int16 = new Int16Array(arrayBuffer);
    if (int16.length === 0) return;

    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    this.playChunk(float32);
  }

  /**
   * Programa la reproducción en AudioBufferSourceNode con guarda contra lag de red.
   */
  public playChunk(float32Data: Float32Array): void {
    const ctx = this.initContext();
    const audioBuffer = ctx.createBuffer(1, float32Data.length, this.sampleRate);
    audioBuffer.copyToChannel(float32Data as any, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.gainNode ?? ctx.destination);

    // Guarda temporal: Si hubo silencio o lag de red, sincroniza con el tiempo actual
    const now = ctx.currentTime;
    if (this.nextStartTime < now) {
      this.nextStartTime = now;
    }

    this.sources.add(source);
    voiceCaptureGate.block("pcm-playback");
    source.onended = () => {
      this.sources.delete(source);
      source.disconnect();
      if (!this.sources.size) voiceCaptureGate.release("pcm-playback");
    };
    try {
      source.start(this.nextStartTime);
      this.nextStartTime += audioBuffer.duration;
    } catch (error) {
      this.sources.delete(source);
      source.disconnect();
      if (!this.sources.size) voiceCaptureGate.release("pcm-playback");
      throw error;
    }
  }

  /**
   * Detiene y resetea el cursor de reproducción.
   */
  public reset(): void {
    for (const source of this.sources) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
    this.sources.clear();
    voiceCaptureGate.release("pcm-playback");
    if (this.audioContext) {
      this.nextStartTime = this.audioContext.currentTime;
    }
  }

  public async resume(): Promise<void> {
    if (this.audioContext && this.audioContext.state === "suspended") {
      await this.audioContext.resume();
    }
  }

  /** Mutes/unmutes playback without interrupting the scheduling cursor. */
  public setMuted(muted: boolean): void {
    this.muted = muted;
    if (this.audioContext && this.gainNode) {
      this.gainNode.gain.setTargetAtTime(
        muted ? 0 : 1,
        this.audioContext.currentTime,
        0.02,
      );
    }
  }

  public isMuted(): boolean {
    return this.muted;
  }
}

export const pcmPlayer = new PcmStreamingPlayer();
