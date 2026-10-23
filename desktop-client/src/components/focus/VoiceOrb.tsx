import type { FocusStatus } from "../../types/voice";
import { cn } from "../../lib/format";

export interface VoiceOrbProps {
  status: FocusStatus;
  levels: number[];
  pressed: boolean;
  onToggle: () => void;
  onPulse: (strength?: number) => void;
  avatarSrc?: string;
  characterName?: string;
}

const STATUS_CORONA: Record<FocusStatus, string> = {
  listening: "#2dd4bf", // vibrant teal/cyan
  speaking: "#c084fc",  // bright purple/violet
  idle: "#52525b",      // muted zinc
};

export function VoiceOrb({
  status,
  levels,
  pressed,
  onToggle,
  onPulse,
  avatarSrc,
  characterName = "Jev",
}: VoiceOrbProps) {
  const average =
    levels.length > 0
      ? levels.reduce((sum, value) => sum + value, 0) / levels.length
      : 0;

  // 48 high-density sunburst corona equalizer lines matching Image 2
  const coronaBars = 48;
  const strokeColor = STATUS_CORONA[status];

  return (
    <div className="relative flex h-64 w-64 shrink-0 items-center justify-center">
      {/* Outer ambient blur glow behind avatar */}
      <div
        className={cn(
          "pointer-events-none absolute h-64 w-64 rounded-full blur-3xl transition-opacity duration-300",
          status === "listening" && "bg-teal-500/25",
          status === "speaking" && "bg-purple-500/25",
          status === "idle" && "bg-zinc-800/10",
        )}
        style={{ opacity: 0.4 + average * 0.6 }}
      />

      {/* Sunburst Radial Waveform Corona matching the user's design image */}
      <svg
        className="pointer-events-none absolute h-64 w-64 -rotate-90"
        viewBox="0 0 240 240"
        aria-hidden="true"
      >
        {Array.from({ length: coronaBars }, (_, i) => {
          const angle = (i * 360) / coronaBars;
          const rad = (angle * Math.PI) / 180;
          const levelVal = levels[i % levels.length] ?? 0.1;
          const innerR = 56;
          // React to volume / speaking
          const barLen =
            status === "idle"
              ? 8 + (i % 3 === 0 ? 5 : 2)
              : 8 + levelVal * 32 + (i % 2 === 0 ? 4 : 0);
          const outerR = innerR + barLen;

          const x1 = 120 + innerR * Math.cos(rad);
          const y1 = 120 + innerR * Math.sin(rad);
          const x2 = 120 + outerR * Math.cos(rad);
          const y2 = 120 + outerR * Math.sin(rad);

          return (
            <line
              key={i}
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke={strokeColor}
              strokeWidth={i % 4 === 0 ? 3 : 2}
              strokeLinecap="round"
              opacity={status === "idle" ? 0.35 : 0.6 + levelVal * 0.4}
              className="transition-all duration-75"
            />
          );
        })}
      </svg>

      {/* Interactive voice control */}
      <button
        type="button"
        onClick={onToggle}
        onPointerMove={() => onPulse(0.2)}
        aria-pressed={pressed}
        aria-label={pressed ? "Silenciar micrófono" : "Activar micrófono"}
        className="group relative flex h-32 w-32 items-center justify-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400 focus-visible:ring-offset-4 focus-visible:ring-offset-zinc-950 active:scale-95"
      >
        {/* Active outer pulse ring */}
        {status === "listening" && (
          <span className="animate-pv-ping absolute inset-0 rounded-full border border-teal-400/60" />
        )}
        {status === "speaking" && (
          <span className="animate-pv-ping absolute inset-0 rounded-full border border-purple-400/60" />
        )}

        {/* Circular Frame with Neon Halo */}
        <span
          className={cn(
            "relative flex h-28 w-28 items-center justify-center overflow-hidden rounded-full border-2 bg-zinc-950 transition-all duration-150 shadow-[0_0_30px_rgba(45,212,191,0.45)]",
            status === "listening"
              ? "border-teal-400 shadow-[0_0_35px_rgba(45,212,191,0.65)]"
              : status === "speaking"
                ? "border-purple-400 shadow-[0_0_35px_rgba(168,85,247,0.65)]"
                : "border-zinc-700/80 shadow-[0_0_15px_rgba(0,0,0,0.8)]",
          )}
          style={{ transform: `scale(${1 + average * 0.1})` }}
        >
          {/* Character avatar or initial fallback */}
          <span className="select-none text-3xl font-semibold text-teal-200" aria-hidden="true">
            {characterName.slice(0, 1).toUpperCase()}
          </span>
          {avatarSrc ? (
            <img
              src={avatarSrc}
              alt={characterName}
              className="absolute inset-0 h-full w-full object-cover select-none pointer-events-none transition-transform duration-200 group-hover:scale-105"
              onError={(e) => { e.currentTarget.style.display = "none"; }}
            />
          ) : null}
        </span>
      </button>
    </div>
  );
}
