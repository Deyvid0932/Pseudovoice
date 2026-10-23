import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { sessionConfigStore } from "../lib/sessionConfigStore";
import { inferenceSocketService, type SessionConfigPayload } from "../services/inferenceSocketService";
import { rulesService } from "../services/rulesService";
import type {
  RuleGraphNode,
  SatelliteCategory,
  SatelliteCategoryMeta,
  SessionConfigSnapshot,
} from "../types/voice";

export const SATELLITE_META: Record<SatelliteCategory, SatelliteCategoryMeta> = {
  ACOUSTIC: {
    id: "ACOUSTIC",
    label: "ACOUSTIC",
    accent: "text-cyan-400",
    edge: "#22d3ee",
  },
  BEHAVIOR: {
    id: "BEHAVIOR",
    label: "BEHAVIOR",
    accent: "text-violet-400",
    edge: "#8b5cf6",
  },
  SAFETY: {
    id: "SAFETY",
    label: "SAFETY",
    accent: "text-amber-400",
    edge: "#f59e0b",
  },
  STYLE: {
    id: "STYLE",
    label: "STYLE",
    accent: "text-rose-400",
    edge: "#f43f5e",
  },
};

/** Fixed logical coordinates inside a 1200 x 520 viewBox (memoized layout). */
export const RULE_GRAPH_NODES: RuleGraphNode[] = [
  {
    id: "voice-texture",
    code: "AC-01",
    name: "VOICE_TEXTURE",
    category: "ACOUSTIC",
    priority: 9,
    description:
      "Mantén una voz cercana, cristalina y con respiración natural.",
    x: 600,
    y: 92,
  },
  {
    id: "tsundere-guard",
    code: "BE-02",
    name: "TSUNDERE_GUARD",
    category: "BEHAVIOR",
    priority: 10,
    description:
      "Oculta la vulnerabilidad con humor, pero demuestra preocupación.",
    x: 900,
    y: 138,
  },
  {
    id: "safe-boundary",
    code: "SA-03",
    name: "SAFE_BOUNDARY",
    category: "SAFETY",
    priority: 10,
    description:
      "Rechaza solicitudes peligrosas con claridad y ofrece una alternativa.",
    x: 1035,
    y: 250,
  },
  {
    id: "anime-cadence",
    code: "ST-04",
    name: "ANIME_CADENCE",
    category: "STYLE",
    priority: 7,
    description:
      "Habla como una compañera de anime: cálida, expresiva y con pausas dramáticas.",
    x: 815,
    y: 372,
  },
  {
    id: "nickname",
    code: "ST-05",
    name: "NICKNAME",
    category: "STYLE",
    priority: 5,
    description: "Usa el apelativo «Deyvi» de forma natural.",
    x: 610,
    y: 430,
  },
  {
    id: "breath-control",
    code: "AC-05",
    name: "BREATH_CONTROL",
    category: "ACOUSTIC",
    priority: 6,
    description: "Respira antes de las frases largas para sonar natural.",
    x: 330,
    y: 372,
  },
  {
    id: "close-mode",
    code: "BE-06",
    name: "CLOSE_MODE",
    category: "BEHAVIOR",
    priority: 8,
    description: "Prioriza la cercanía emocional sobre la formalidad.",
    x: 168,
    y: 268,
  },
  {
    id: "consent-check",
    code: "SA-07",
    name: "CONSENT_CHECK",
    category: "SAFETY",
    priority: 3,
    description: "Confirma antes de ejecutar acciones sensibles.",
    x: 300,
    y: 140,
  },
];

/** Nodes that start disconnected (offline), matching the lab baseline. */
const OFFLINE_DEFAULTS = new Set(["consent-check"]);

export function defaultGraphState(): Array<{
  id: string;
  priority: number;
  connected: boolean;
}> {
  return RULE_GRAPH_NODES.map((node) => ({
    id: node.id,
    priority: node.priority,
    connected: !OFFLINE_DEFAULTS.has(node.id),
  }));
}

function buildPrompt(
  nodes: RuleGraphNode[],
  snapshot: SessionConfigSnapshot,
): string {
  return nodes
    .filter((node) => snapshot.connected[node.id])
    .sort(
      (a, b) =>
        (snapshot.priorities[a.id] ?? a.priority) -
        (snapshot.priorities[b.id] ?? b.priority),
    )
    .map((node) => `[${node.category}] ${node.description}`)
    .join(" ");
}

export interface SessionConfigBridgeOptions {
  characterId: number | null;
  referenceAudioName: string;
  conversationId: number | null;
  userId?: number;
  responseLength?: "short" | "normal" | "long";
  saveResponseAudio?: boolean;
}

/**
 * Installs the `session_config` bridge at the app shell level so the graph
 * connectivity always reaches the Python engine, regardless of the active
 * view. Mutating a node only produces a WebSocket payload — never a canvas
 * re-render.
 */
export function useSessionConfigBridge({
  characterId,
  referenceAudioName,
  conversationId,
  responseLength = "normal",
  saveResponseAudio = false,
  userId = 1,
}: SessionConfigBridgeOptions): void {
  const [savedRules, setSavedRules] = useState<SessionConfigPayload["character_rules"]>([]);

  useEffect(() => {
    sessionConfigStore.initialize(defaultGraphState());
  }, []);

  useEffect(() => {
    let active = true;
    setSavedRules([]);
    if (characterId === null) return () => { active = false; };
    Promise.all([
      rulesService.getCharacterRules(characterId),
      rulesService.getGlobalRules(),
      rulesService.getUserRules(userId),
    ]).then(([assignments, globalRules, userRules]) => {
      if (!active) return;
      const catalog = new Map([...globalRules, ...userRules].map((rule) => [rule.id, rule]));
      setSavedRules(assignments.flatMap((assignment) => {
        const rule = catalog.get(assignment.ruleId);
        return rule ? [{
          id: assignment.id + 100000,
          category: rule.category,
          code: rule.ruleCode,
          shortLabel: rule.ruleCode,
          description: rule.promptDescription,
          priority: assignment.priority,
          isActive: true,
        }] : [];
      }));
    }).catch((error) => {
      if (active) console.warn("No se pudieron cargar las reglas del personaje:", error);
    });
    return () => { active = false; };
  }, [characterId, userId]);

  useEffect(() => {
    if (conversationId === null || characterId === null) {
      inferenceSocketService.clearSessionConfig();
      sessionConfigStore.setBridge(null);
      return;
    }
    sessionConfigStore.setBridge((mutation) => {
      inferenceSocketService.sendSessionConfig(
        {
          character_id: characterId,
          reference_audio_name: referenceAudioName,
          response_length: responseLength,
          save_response_audio: saveResponseAudio,
          character_rules: [...savedRules, ...RULE_GRAPH_NODES.map((node, index) => ({
            id: index + 1,
            category: node.category,
            code: node.name,
            shortLabel: node.name,
            description: node.description,
            priority: mutation.priorities[node.id] ?? node.priority,
            isActive: mutation.connected[node.id] ?? false,
          }))],
        },
        conversationId,
      );
    });
    return () => sessionConfigStore.setBridge(null);
  }, [characterId, referenceAudioName, conversationId, savedRules, responseLength, saveResponseAudio]);
}

export interface UseRuleGraphResult {
  nodes: RuleGraphNode[];
  snapshot: SessionConfigSnapshot;
  selectedNode: RuleGraphNode | null;
  connectedCount: number;
  promptPreview: string;
  toggleNode: (nodeId: string) => void;
  setNodeConnected: (nodeId: string, value: boolean) => void;
  setNodePriority: (nodeId: string, value: number) => void;
  selectNode: (nodeId: string | null) => void;
  resetGraph: () => void;
}

export function useRuleGraph(): UseRuleGraphResult {
  const snapshot = useSyncExternalStore(
    sessionConfigStore.subscribeGlobal,
    sessionConfigStore.getSnapshot,
    sessionConfigStore.getSnapshot,
  );

  useEffect(() => {
    sessionConfigStore.initialize(defaultGraphState());
  }, []);

  const selectedNode = useMemo(
    () =>
      RULE_GRAPH_NODES.find((node) => node.id === snapshot.selectedId) ?? null,
    [snapshot.selectedId],
  );

  const connectedCount = useMemo(
    () =>
      RULE_GRAPH_NODES.filter((node) => snapshot.connected[node.id]).length,
    [snapshot.connected],
  );

  const promptPreview = useMemo(
    () => buildPrompt(RULE_GRAPH_NODES, snapshot),
    [snapshot],
  );

  const toggleNode = useCallback((nodeId: string) => {
    sessionConfigStore.toggleConnected(nodeId);
  }, []);

  const setNodeConnected = useCallback((nodeId: string, value: boolean) => {
    sessionConfigStore.setConnected(nodeId, value);
  }, []);

  const setNodePriority = useCallback((nodeId: string, value: number) => {
    sessionConfigStore.setPriority(nodeId, value);
  }, []);

  const selectNode = useCallback((nodeId: string | null) => {
    sessionConfigStore.select(nodeId);
  }, []);

  const resetGraph = useCallback(() => {
    sessionConfigStore.reset(defaultGraphState());
    sessionConfigStore.select(null);
  }, []);

  return {
    nodes: RULE_GRAPH_NODES,
    snapshot,
    selectedNode,
    connectedCount,
    promptPreview,
    toggleNode,
    setNodeConnected,
    setNodePriority,
    selectNode,
    resetGraph,
  };
}

/* ------------------------------------------------------------------ *
 * Per-node subscriptions. Each node only re-renders when its own slice
 * changes — the rest of the graph (and canvas) stays untouched.
 * ------------------------------------------------------------------ */
export function useNodeConnected(nodeId: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => sessionConfigStore.subscribeNode(nodeId, listener),
    [nodeId],
  );
  const getSnapshot = useCallback(
    () => sessionConfigStore.isConnected(nodeId),
    [nodeId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useNodeSelected(nodeId: string): boolean {
  const subscribe = useCallback(
    (listener: () => void) => sessionConfigStore.subscribeNode(nodeId, listener),
    [nodeId],
  );
  const getSnapshot = useCallback(
    () => sessionConfigStore.getSelectedId() === nodeId,
    [nodeId],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

export function useNodePriority(nodeId: string, fallback: number): number {
  const subscribe = useCallback(
    (listener: () => void) => sessionConfigStore.subscribeNode(nodeId, listener),
    [nodeId],
  );
  const getSnapshot = useCallback(
    () => sessionConfigStore.getPriority(nodeId) || fallback,
    [nodeId, fallback],
  );
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
