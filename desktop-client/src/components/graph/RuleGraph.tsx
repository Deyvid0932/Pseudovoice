import { memo, useCallback, useRef, useState, type CSSProperties } from "react";
import type { RuleGraphNode } from "../../types/voice";
import { sessionConfigStore } from "../../lib/sessionConfigStore";
import {
  SATELLITE_META,
  useNodeConnected,
  useNodePriority,
  useNodeSelected,
} from "../../hooks/useRuleGraph";
import { cn } from "../../lib/format";
import { PlusIcon, SlidersIcon } from "../ui/icons";

const VIEWBOX_WIDTH = 1200;
const VIEWBOX_HEIGHT = 520;
const CENTER = { x: 600, y: 260 };
const CORE_LINKS = ["voice-texture", "tsundere-guard", "safe-boundary", "anime-cadence"];
const RULE_LINKS = [
  ["voice-texture", "breath-control"],
  ["tsundere-guard", "close-mode"],
  ["safe-boundary", "consent-check"],
  ["anime-cadence", "nickname"],
  ["voice-texture", "anime-cadence"],
  ["tsundere-guard", "safe-boundary"],
  ["close-mode", "consent-check"],
] as const;

interface NodeCoords {
  x: number;
  y: number;
}

/**
 * Calculates a smooth yFiles-style organic bezier curve from center to target node.
 */
function createOrganicCurve(x1: number, y1: number, x2: number, y2: number): string {
  // Gentle organic arc control point
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  // Perpendicular offset for subtle organic bend
  const bendFactor = 0.08;
  const cx = mx - dy * bendFactor;
  const cy = my + dx * bendFactor;
  return `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`;
}

const GraphEdge = memo(function GraphEdge({
  node,
  sourceCoords,
  targetCoords,
  highlighted,
  sourceId,
  core = false,
}: {
  node: RuleGraphNode;
  sourceCoords: NodeCoords;
  targetCoords: NodeCoords;
  highlighted: boolean;
  sourceId?: string;
  core?: boolean;
}) {
  const sourceConnected = useNodeConnected(sourceId ?? node.id);
  const targetConnected = useNodeConnected(node.id);
  const active = core || (sourceConnected && targetConnected);
  const selected = useNodeSelected(node.id);
  const meta = SATELLITE_META[node.category];
  const color = active ? meta.edge : "#52525b";

  const pathD = createOrganicCurve(sourceCoords.x, sourceCoords.y, targetCoords.x, targetCoords.y);
  const isHighlighted = selected || highlighted;

  return (
    <g>
      {/* Outer ambient glow path */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={isHighlighted ? 7 : 4}
        strokeLinecap="round"
        opacity={isHighlighted ? 0.34 : active ? 0.09 : 0.018}
      />
      {/* Core line path */}
      <path
        d={pathD}
        fill="none"
        stroke={color}
        strokeWidth={isHighlighted ? 2.5 : 1.5}
        strokeLinecap="round"
        strokeDasharray={active ? undefined : "3 8"}
        opacity={isHighlighted ? 0.95 : active ? 0.55 : 0.18}
        className="transition-opacity duration-200"
      />
    </g>
  );
});

interface ObsidianRuleDotProps {
  node: RuleGraphNode;
  coords: NodeCoords;
  onDragStart: (e: React.PointerEvent, nodeId: string) => void;
  onHoverChange: (nodeId: string, hovered: boolean) => void;
}

const ObsidianRuleDot = memo(function ObsidianRuleDot({
  node,
  coords,
  onDragStart,
  onHoverChange,
}: ObsidianRuleDotProps) {
  const connected = useNodeConnected(node.id);
  const selected = useNodeSelected(node.id);
  const priority = useNodePriority(node.id, node.priority);
  const meta = SATELLITE_META[node.category];

  const posStyle: CSSProperties = {
    left: `${(coords.x / VIEWBOX_WIDTH) * 100}%`,
    top: `${(coords.y / VIEWBOX_HEIGHT) * 100}%`,
  };

  return (
    <div
      className="group pointer-events-auto absolute z-10 -translate-x-1/2 -translate-y-1/2 touch-none select-none cursor-grab active:cursor-grabbing"
      style={posStyle}
      onPointerDown={(e) => onDragStart(e, node.id)}
      onPointerEnter={() => onHoverChange(node.id, true)}
      onPointerLeave={() => onHoverChange(node.id, false)}
    >
      <div className="relative flex items-center gap-2.5">
        {/* Obsidian Glowing Point */}
        <span className="relative flex h-8 w-8 items-center justify-center">
          {/* Active selection pulse ring */}
          {selected && (
            <span
              className="absolute inset-0 rounded-full animate-ping opacity-60"
              style={{ backgroundColor: meta.edge }}
            />
          )}

          {/* Diffuse blur halo */}
          <span
            className={cn(
              "absolute inset-0 rounded-full blur-md transition-all duration-300",
              selected
                ? "scale-150 opacity-95"
                : "opacity-25 group-hover:scale-135 group-hover:opacity-85",
            )}
            style={{ backgroundColor: meta.edge }}
          />

          {/* Outer circle ring */}
          <span
            className={cn(
              "relative flex h-5 w-5 items-center justify-center rounded-full border-2 transition-transform duration-200",
              selected
                ? "scale-125 border-white bg-zinc-950 shadow-[0_0_15px_rgba(255,255,255,0.7)]"
                : "border-zinc-800 bg-zinc-950/90 group-hover:scale-115",
            )}
            style={{
              borderColor: selected
                ? "#ffffff"
                : connected
                  ? meta.edge
                  : "#71717a",
            }}
          >
            {/* Core center dot */}
            <span
              className="h-2 w-2 rounded-full transition-all duration-200"
              style={{
                backgroundColor: connected ? meta.edge : "#52525b",
              }}
            />
          </span>
        </span>

        {/* Minimalist Typographic Tag like Obsidian Graph */}
        <span
          className={cn(
            "rounded-md px-2.5 py-1 text-left backdrop-blur-md transition-all duration-200",
            selected
              ? "bg-zinc-900/95 border border-teal-400 text-teal-200 shadow-xl shadow-teal-500/10 translate-x-1"
              : "border border-zinc-800/40 bg-zinc-950/60 text-zinc-400 group-hover:text-zinc-100 group-hover:border-zinc-700/80 group-hover:bg-zinc-900/80",
          )}
        >
          <span className="pv-kicker block text-[9px] text-zinc-500">
            {node.code} · P{priority}
          </span>
          <span
            className={cn(
              "block text-xs font-semibold tracking-wide",
              selected ? "text-white" : meta.accent,
            )}
          >
            {node.name}
          </span>
        </span>
      </div>
    </div>
  );
});

const CenterCoreNode = memo(function CenterCoreNode() {
  const centerStyle: CSSProperties = {
    left: `${(CENTER.x / VIEWBOX_WIDTH) * 100}%`,
    top: `${(CENTER.y / VIEWBOX_HEIGHT) * 100}%`,
  };

  return (
    <div
      className="absolute z-10 -translate-x-1/2 -translate-y-1/2 pointer-events-none select-none"
      style={centerStyle}
    >
      <div className="flex flex-col items-center">
        {/* Ambient Core Aura */}
        <span className="absolute -inset-8 rounded-full bg-teal-500/15 blur-3xl animate-pulse" />

        <span className="relative flex h-20 w-20 items-center justify-center rounded-full border border-teal-500/50 bg-zinc-950/90 text-2xl font-light text-teal-300 shadow-[0_0_42px_-8px_rgba(45,212,191,0.6)] backdrop-blur">
          ✳
        </span>

        <span className="mt-2.5 rounded-full border border-teal-500/40 bg-zinc-950/90 px-3.5 py-1 text-center backdrop-blur shadow-lg shadow-black/80">
          <span className="pv-kicker text-teal-300 font-bold">NÚCLEO DE REGLAS</span>
        </span>
      </div>
    </div>
  );
});

export interface RuleGraphProps {
  nodes: RuleGraphNode[];
  onAddRule: () => void;
}

export function RuleGraph({ nodes, onAddRule }: RuleGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // yFiles-style interactive node positions map
  const [positions, setPositions] = useState<Record<string, NodeCoords>>(() => {
    const initial: Record<string, NodeCoords> = {};
    for (const node of nodes) {
      initial[node.id] = { x: node.x, y: node.y };
    }
    return initial;
  });

  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const panStateRef = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  // Dragging state refs to ensure 60fps tracking without lag
  const dragStateRef = useRef<{
    nodeId: string | null;
    startX: number;
    startY: number;
    initialNodeX: number;
    initialNodeY: number;
    hasMoved: boolean;
  }>({
    nodeId: null,
    startX: 0,
    startY: 0,
    initialNodeX: 0,
    initialNodeY: 0,
    hasMoved: false,
  });

  const handleDragStart = useCallback(
    (e: React.PointerEvent, nodeId: string) => {
      e.stopPropagation();
      const currentPos = positions[nodeId] ?? { x: 0, y: 0 };
      dragStateRef.current = {
        nodeId,
        startX: e.clientX,
        startY: e.clientY,
        initialNodeX: currentPos.x,
        initialNodeY: currentPos.y,
        hasMoved: false,
      };

      const handlePointerMove = (moveEvent: PointerEvent) => {
        if (!dragStateRef.current.nodeId || !containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const scaleX = VIEWBOX_WIDTH / (rect.width * zoom);
        const scaleY = VIEWBOX_HEIGHT / (rect.height * zoom);

        const deltaX = (moveEvent.clientX - dragStateRef.current.startX) * scaleX;
        const deltaY = (moveEvent.clientY - dragStateRef.current.startY) * scaleY;

        if (Math.hypot(deltaX, deltaY) > 4) {
          dragStateRef.current.hasMoved = true;
        }

        const newX = Math.max(50, Math.min(VIEWBOX_WIDTH - 50, dragStateRef.current.initialNodeX + deltaX));
        const newY = Math.max(40, Math.min(VIEWBOX_HEIGHT - 40, dragStateRef.current.initialNodeY + deltaY));

        setPositions((prev) => ({
          ...prev,
          [nodeId]: { x: Math.round(newX), y: Math.round(newY) },
        }));
      };

      const handlePointerUp = () => {
        if (!dragStateRef.current.hasMoved) {
          // If click without dragging, toggle node selection
          const currentSelected = sessionConfigStore.getSnapshot().selectedId;
          sessionConfigStore.select(currentSelected === nodeId ? null : nodeId);
        }
        dragStateRef.current.nodeId = null;
        window.removeEventListener("pointermove", handlePointerMove);
        window.removeEventListener("pointerup", handlePointerUp);
      };

      window.addEventListener("pointermove", handlePointerMove);
      window.addEventListener("pointerup", handlePointerUp);
    },
    [positions, zoom],
  );

  const handlePanStart = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    panStateRef.current = { x: pan.x, y: pan.y, startX: e.clientX, startY: e.clientY };
    const move = (event: PointerEvent) => {
      const current = panStateRef.current;
      if (!current) return;
      setPan({ x: current.x + event.clientX - current.startX, y: current.y + event.clientY - current.startY });
    };
    const up = () => {
      panStateRef.current = null;
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  }, [pan]);

  const handleZoom = useCallback((delta: number) => {
    setZoom((current) => Math.max(0.65, Math.min(1.7, Math.round((current + delta) * 100) / 100)));
  }, []);

  const handleResetLayout = useCallback(() => {
    const reset: Record<string, NodeCoords> = {};
    for (const node of nodes) {
      reset[node.id] = { x: node.x, y: node.y };
    }
    setPositions(reset);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  }, [nodes]);

  const handleHoverChange = useCallback((nodeId: string, hovered: boolean) => {
    setHoveredNodeId(hovered ? nodeId : null);
  }, []);

  return (
    <div
      ref={containerRef}
      className="relative h-full min-h-[520px] w-full overflow-hidden rounded-2xl border border-zinc-800/80 bg-zinc-950/80 shadow-2xl shadow-black/60 select-none"
      onPointerDown={handlePanStart}
      onWheel={(event) => { event.preventDefault(); handleZoom(event.deltaY < 0 ? 0.08 : -0.08); }}
    >
      <div className="pv-obsidian-grid absolute inset-0 opacity-90" />
      {/* Radial vignette */}
      <div className="absolute inset-0 bg-[radial-gradient(60%_60%_at_50%_50%,transparent_0%,rgba(5,5,6,0.75)_100%)] pointer-events-none" />

      <div className="pointer-events-none absolute inset-0" style={{ transform: "translate(" + pan.x + "px, " + pan.y + "px) scale(" + zoom + ")", transformOrigin: "center" }}>
        <svg className="absolute inset-0 h-full w-full pointer-events-none" viewBox="0 0 1200 520" preserveAspectRatio="none" aria-hidden="true">
          {CORE_LINKS.map((id) => {
            const node = nodes.find((item) => item.id === id);
            return node ? <GraphEdge key={"core-" + id} node={node} sourceCoords={CENTER} targetCoords={positions[id] ?? node} highlighted={hoveredNodeId === id} core /> : null;
          })}
          {RULE_LINKS.map(([sourceId, targetId]) => {
            const source = nodes.find((item) => item.id === sourceId);
            const target = nodes.find((item) => item.id === targetId);
            return source && target ? <GraphEdge key={sourceId + "-" + targetId} node={target} sourceId={sourceId} sourceCoords={positions[sourceId] ?? source} targetCoords={positions[targetId] ?? target} highlighted={hoveredNodeId === sourceId || hoveredNodeId === targetId} /> : null;
          })}
        </svg>
        <CenterCoreNode />
        {nodes.map((node) => <ObsidianRuleDot key={node.id} node={node} coords={positions[node.id] ?? { x: node.x, y: node.y }} onDragStart={handleDragStart} onHoverChange={handleHoverChange} />)}
      </div>
      <div className="absolute bottom-5 left-5 z-20 flex items-center gap-1 rounded-xl border border-zinc-800 bg-zinc-950/90 p-1.5 shadow-xl backdrop-blur">
        <button type="button" onClick={() => handleZoom(-0.1)} aria-label="Alejar" className="h-8 w-8 rounded-lg text-zinc-300 hover:bg-zinc-800">−</button>
        <span className="w-12 text-center font-mono text-xs text-zinc-400">{Math.round(zoom * 100)}%</span>
        <button type="button" onClick={() => handleZoom(0.1)} aria-label="Acercar" className="h-8 w-8 rounded-lg text-zinc-300 hover:bg-zinc-800">+</button>
      </div>

      {/* Bottom Floating Control Buttons */}
      <div className="absolute bottom-5 right-5 z-20 flex items-center gap-2">
        <button
          type="button"
          onClick={handleResetLayout}
          title="Restablecer disposición del grafo"
          className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950/80 px-3 py-2 text-xs text-zinc-400 backdrop-blur transition-all duration-200 hover:border-zinc-700 hover:text-zinc-200"
        >
          <SlidersIcon size={14} />
          <span className="pv-kicker">Reorganizar</span>
        </button>

        <button
          type="button"
          onClick={onAddRule}
          className="flex items-center gap-2 rounded-lg border border-teal-500/40 bg-zinc-950/90 px-4 py-2 text-teal-200 backdrop-blur transition-all duration-200 hover:-translate-y-0.5 hover:border-teal-400 hover:bg-teal-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 active:translate-y-0"
        >
          <PlusIcon size={14} strokeWidth={2} />
          <span className="pv-kicker">Agregar regla al catálogo</span>
        </button>
      </div>
    </div>
  );
}
