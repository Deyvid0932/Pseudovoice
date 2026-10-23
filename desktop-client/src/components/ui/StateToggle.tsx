import { cn } from "../../lib/format";

export interface StateToggleProps {
  active: boolean;
  onToggle: () => void;
  ariaLabel: string;
  activeLabel?: string;
  inactiveLabel?: string;
  size?: "sm" | "md";
}

export function StateToggle({
  active,
  onToggle,
  ariaLabel,
  activeLabel = "ACTIVA",
  inactiveLabel = "INACTIVA",
  size = "sm",
}: StateToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={active}
      aria-label={ariaLabel}
      onClick={onToggle}
      className={cn(
        "group inline-flex shrink-0 items-center gap-2 rounded-md border transition-all duration-200",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950",
        "active:scale-[0.97]",
        size === "sm" ? "px-2.5 py-1.5" : "px-3 py-2",
        active
          ? "border-teal-500/40 bg-teal-500/10 text-teal-300 hover:border-teal-400/70 hover:bg-teal-500/20"
          : "border-zinc-700/80 bg-zinc-900/60 text-zinc-500 hover:border-zinc-600 hover:text-zinc-300",
      )}
    >
      <span
        className={cn(
          "relative rounded-full transition-colors duration-200",
          size === "sm" ? "h-3 w-6" : "h-3.5 w-7",
          active ? "bg-teal-500/70" : "bg-zinc-700",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-2 w-2 rounded-full bg-white transition-all duration-200",
            active ? "left-3.5" : "left-0.5",
          )}
        />
      </span>
      <span className="pv-mono text-[10px] font-semibold tracking-[0.16em]">
        {active ? activeLabel : inactiveLabel}
      </span>
    </button>
  );
}
