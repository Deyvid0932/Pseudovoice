export class VoiceCaptureGate {
  private owners = new Set<string | object>();
  private listeners = new Set<(blocked: boolean) => void>();
  private blocked = false;
  private releaseTimer: ReturnType<typeof setTimeout> | null = null;
  private guardMs = 200;

  setGuardMs(value: number): void {
    if (Number.isFinite(value)) this.guardMs = Math.max(0, Math.min(2000, value));
  }

  isBlocked(): boolean {
    return this.blocked;
  }

  block(owner: string | object): void {
    if (this.releaseTimer !== null) clearTimeout(this.releaseTimer);
    this.releaseTimer = null;
    this.owners.add(owner);
    this.publish(true);
  }

  release(owner: string | object): void {
    if (!this.owners.delete(owner) || this.owners.size || !this.blocked) return;
    this.releaseTimer = setTimeout(() => {
      this.releaseTimer = null;
      if (!this.owners.size) this.publish(false);
    }, this.guardMs);
  }

  subscribe(listener: (blocked: boolean) => void): () => void {
    this.listeners.add(listener);
    listener(this.blocked);
    return () => { this.listeners.delete(listener); };
  }

  private publish(blocked: boolean): void {
    if (this.blocked === blocked) return;
    this.blocked = blocked;
    for (const listener of this.listeners) listener(blocked);
  }
}

export const voiceCaptureGate = new VoiceCaptureGate();
