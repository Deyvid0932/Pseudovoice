import type {
  SessionConfigMutation,
  SessionConfigSnapshot,
} from "../types/voice";

type Listener = () => void;

const EMPTY_SNAPSHOT: SessionConfigSnapshot = {
  connected: {},
  priorities: {},
  selectedId: null,
};

/**
 * Fine-grained observable store for the Neural Lab graph.
 *
 * Every satellite node subscribes to its own slice, so toggling
 * CONNECTED / OFFLINE only notifies the affected node (plus the global
 * payload preview). The canvas is never fully re-rendered by design.
 *
 * Every mutation is pushed through {@link setBridge} which the lab wires to
 * `inferenceSocketService.sendSessionConfig`, so the active node + rule
 * connectivity mutate only the `session_config` WebSocket payload.
 */
class SessionConfigStore {
  private connected = new Map<string, boolean>();
  private priorities = new Map<string, number>();
  private selectedId: string | null = null;
  private nodeListeners = new Map<string, Set<Listener>>();
  private globalListeners = new Set<Listener>();
  private bridge: ((mutation: SessionConfigMutation) => void) | null = null;
  private initialized = false;
  private snapshot: SessionConfigSnapshot = EMPTY_SNAPSHOT;

  initialize(
    nodes: Array<{ id: string; priority: number; connected: boolean }>,
  ): void {
    if (this.initialized) {
      return;
    }
    for (const node of nodes) {
      this.connected.set(node.id, node.connected);
      this.priorities.set(node.id, node.priority);
    }
    this.initialized = true;
    this.commit();
  }

  setBridge(bridge: ((mutation: SessionConfigMutation) => void) | null): void {
    this.bridge = bridge;
    this.push();
  }

  subscribeNode(id: string, listener: Listener): () => void {
    let listeners = this.nodeListeners.get(id);
    if (!listeners) {
      listeners = new Set();
      this.nodeListeners.set(id, listeners);
    }
    listeners.add(listener);
    return () => {
      listeners?.delete(listener);
      if (listeners && listeners.size === 0) {
        this.nodeListeners.delete(id);
      }
    };
  }

  subscribeGlobal = (listener: Listener): (() => void) => {
    this.globalListeners.add(listener);
    return () => {
      this.globalListeners.delete(listener);
    };
  };

  isConnected(id: string): boolean {
    return this.connected.get(id) ?? false;
  }

  getPriority(id: string): number {
    return this.priorities.get(id) ?? 0;
  }

  getSelectedId(): string | null {
    return this.selectedId;
  }

  /** Stable snapshot reference; a new object is only minted on mutation. */
  getSnapshot = (): SessionConfigSnapshot => {
    return this.snapshot;
  };

  toggleConnected(id: string): void {
    this.setConnected(id, !this.isConnected(id));
  }

  setConnected(id: string, value: boolean): void {
    if (this.isConnected(id) === value) {
      return;
    }
    this.connected.set(id, value);
    this.notifyNode(id);
    this.commit();
  }

  setPriority(id: string, value: number): void {
    const clamped = Math.min(10, Math.max(1, Math.round(value)));
    if (this.getPriority(id) === clamped) {
      return;
    }
    this.priorities.set(id, clamped);
    this.notifyNode(id);
    this.commit();
  }

  select(id: string | null): void {
    if (this.selectedId === id) {
      return;
    }
    const previous = this.selectedId;
    this.selectedId = id;
    if (previous) {
      this.notifyNode(previous);
    }
    if (id) {
      this.notifyNode(id);
    }
    this.commit();
  }

  toggleSelected(id: string): void {
    this.select(this.selectedId === id ? null : id);
  }

  reset(nodes: Array<{ id: string; priority: number; connected: boolean }>): void {
    this.connected.clear();
    this.priorities.clear();
    for (const node of nodes) {
      this.connected.set(node.id, node.connected);
      this.priorities.set(node.id, node.priority);
    }
    this.commit();
  }

  buildMutation(): SessionConfigMutation {
    return {
      connected: Object.fromEntries(this.connected),
      priorities: Object.fromEntries(this.priorities),
    };
  }

  private notifyNode(id: string): void {
    this.nodeListeners.get(id)?.forEach((listener) => listener());
  }

  private recomputeSnapshot(): void {
    this.snapshot = {
      connected: Object.fromEntries(this.connected),
      priorities: Object.fromEntries(this.priorities),
      selectedId: this.selectedId,
    };
  }

  private commit(): void {
    this.recomputeSnapshot();
    this.globalListeners.forEach((listener) => listener());
    this.push();
  }

  private push(): void {
    this.bridge?.(this.buildMutation());
  }
}

export const sessionConfigStore = new SessionConfigStore();
