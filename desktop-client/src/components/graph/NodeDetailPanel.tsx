import type { RuleGraphNode } from "../../types/voice";
import { SATELLITE_META } from "../../hooks/useRuleGraph";
import { cn } from "../../lib/format";
import { PlayIcon, UnlinkIcon, XIcon, CheckIcon } from "../ui/icons";

export interface NodeDetailPanelProps {
  node: RuleGraphNode | null;
  priority: number;
  connected: boolean;
  onPriorityChange: (value: number) => void;
  onToggleConnected?: () => void;
  onTestVoice: () => void;
  onUnlink: () => void;
  onClose?: () => void;
}

export function NodeDetailPanel({
  node,
  priority,
  connected,
  onPriorityChange,
  onToggleConnected,
  onTestVoice,
  onUnlink,
  onClose,
}: NodeDetailPanelProps) {
  if (!node) {
    return (
      <div className="flex h-12 items-center justify-center rounded-xl border border-zinc-800/60 bg-zinc-950/40 px-5">
        <p className="pv-kicker text-zinc-500">
          Selecciona un punto del grafo para inspeccionar la regla
        </p>
      </div>
    );
  }

  const meta = SATELLITE_META[node.category];

  return (
    <div className="relative animate-pv-rise flex flex-col gap-4 rounded-2xl border border-zinc-800 bg-zinc-900/90 p-5 shadow-2xl backdrop-blur-xl lg:flex-row lg:items-center lg:justify-between">
      {/* Close button */}
      {onClose ? (
        <button
          type="button"
          onClick={onClose}
          aria-label="Cerrar inspector"
          className="absolute right-3.5 top-3.5 rounded-lg p-1.5 text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-zinc-200"
        >
          <XIcon size={16} />
        </button>
      ) : null}

      <div className="min-w-0 pr-8">
        <p className="pv-kicker">
          <span className={meta.accent}>{node.code}</span>
          <span className="px-1.5 text-zinc-700">/</span>
          <span className="text-zinc-500">{node.category}</span>
          <span className="px-1.5 text-zinc-700">·</span>
          <span
            className={cn(
              "font-bold",
              connected ? "text-emerald-400" : "text-amber-400",
            )}
          >
            {connected ? "CONNECTED" : "OFFLINE"}
          </span>
        </p>
        <h3 className="mt-1 text-lg font-bold tracking-wide text-zinc-100">
          {node.name}
        </h3>
        <p className="mt-1 max-w-xl text-xs text-zinc-400 leading-relaxed">
          {node.description}
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
        {/* Priority Slider */}
        <div className="min-w-[200px]">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="pv-kicker text-zinc-400">Prioridad</span>
            <span className="pv-mono text-xs font-bold text-teal-300">
              P{priority}
            </span>
          </div>
          <input
            type="range"
            min={1}
            max={10}
            value={priority}
            disabled={!connected}
            onChange={(event) => onPriorityChange(Number(event.target.value))}
            aria-label={`Prioridad de ${node.name}`}
            className="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-teal-400 outline-none focus-visible:ring-2 focus-visible:ring-teal-400 disabled:cursor-not-allowed disabled:opacity-40 [&::-webkit-slider-thumb]:h-3.5 [&::-webkit-slider-thumb]:w-3.5 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-teal-400"
          />
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-2">
          {onToggleConnected ? (
            <button
              type="button"
              onClick={onToggleConnected}
              className={cn(
                "flex items-center gap-1.5 rounded-lg border px-3 py-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 active:scale-95",
                connected
                  ? "border-emerald-500/40 bg-emerald-500/10 text-emerald-300"
                  : "border-amber-500/40 bg-amber-500/10 text-amber-300",
              )}
            >
              <CheckIcon size={13} />
              <span className="pv-kicker">
                {connected ? "Conectado" : "Offline"}
              </span>
            </button>
          ) : null}

          <button
            type="button"
            onClick={onTestVoice}
            className="flex items-center gap-1.5 rounded-lg border border-zinc-700 bg-zinc-950/70 px-3 py-2 text-zinc-300 transition-all duration-200 hover:border-teal-500/50 hover:text-teal-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 active:scale-95"
          >
            <PlayIcon size={13} />
            <span className="pv-kicker">Probar voz</span>
          </button>

          <button
            type="button"
            onClick={onUnlink}
            disabled={!connected}
            className={cn(
              "flex items-center gap-1.5 rounded-lg border px-3 py-2 transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 active:scale-95",
              connected
                ? "border-rose-500/40 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20"
                : "cursor-not-allowed border-zinc-800 text-zinc-600",
            )}
          >
            <UnlinkIcon size={13} />
            <span className="pv-kicker">Desconectar</span>
          </button>
        </div>
      </div>
    </div>
  );
}
