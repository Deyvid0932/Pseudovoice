import type { TranscriptLine } from "../../types/voice";
import { cn } from "../../lib/format";

export interface TranscriptPanelProps {
  lines: TranscriptLine[];
  speaking: boolean;
  level: number;
}

export function TranscriptPanel({ lines, speaking, level }: TranscriptPanelProps) {
  const visible = lines.slice(-2);

  return (
    <div className="w-full overflow-hidden rounded-xl border border-zinc-800/80 bg-zinc-950/80 shadow-2xl shadow-black/50 backdrop-blur-md">
      <div className="flex items-center justify-between border-b border-zinc-800/70 px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="pv-kicker text-zinc-500">Live Transcript</span>
          <span className="flex items-center gap-[3px]" aria-hidden="true">
            {Array.from({ length: 5 }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "w-[3px] rounded-full transition-all duration-150",
                  speaking ? "bg-rose-400" : "bg-teal-400",
                )}
                style={{
                  height: `${4 + Math.round(level * 10 * (0.6 + index * 0.1))}px`,
                }}
              />
            ))}
          </span>
        </div>
        <span className="pv-kicker text-zinc-600">Up / Down</span>
      </div>

      <div className="flex flex-col gap-2.5 px-4 py-3.5">
        {visible.length === 0 ? (
          <p className="text-xs text-zinc-600">
            Sin actividad de voz todavía.
          </p>
        ) : (
          visible.map((line) => (
            <div key={line.id} className="flex items-start gap-3">
              <span
                className={cn(
                  "pv-kicker mt-0.5 shrink-0 font-bold",
                  line.role === "user" ? "text-sky-400" : "text-rose-400",
                )}
              >
                {line.role === "user" ? "YOU" : line.speaker.toUpperCase()}
              </span>
              <p className="min-w-0 flex-1 text-xs leading-relaxed text-zinc-200">
                {line.text}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
