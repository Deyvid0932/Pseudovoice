import { useId, useMemo } from "react";
import type { AvatarStatus, Palette } from "../../types/voice";
import { cn } from "../../lib/format";

export interface AvatarProps {
  seed: string;
  label: string;
  palette?: Palette;
  size?: number;
  status?: AvatarStatus;
  decorative?: boolean;
  roundedClassName?: string;
  className?: string;
  imageUrl?: string | null;
}

const STATUS_STYLES: Record<Exclude<AvatarStatus, "none">, string> = {
  online: "bg-emerald-400 shadow-[0_0_0_3px_rgba(16,185,129,0.18)]",
  busy: "bg-amber-400 shadow-[0_0_0_3px_rgba(251,191,36,0.18)]",
  offline: "bg-zinc-500",
};

const CELLS = 5;

function hashSeed(seed: string): number {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let value = seed;
  return () => {
    value |= 0;
    value = (value + 0x6d2b79f5) | 0;
    let result = Math.imul(value ^ (value >>> 15), 1 | value);
    result = (result + Math.imul(result ^ (result >>> 7), 61 | result)) ^ result;
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

function paletteFromHash(hash: number): Palette {
  const hue = hash % 360;
  const partner = (hue + 70 + ((hash >>> 8) % 120)) % 360;
  return [`hsl(${hue} 88% 64%)`, `hsl(${partner} 82% 46%)`];
}

function buildCells(seed: string): boolean[] {
  const random = mulberry32(hashSeed(seed));
  const cells = new Array<boolean>(CELLS * CELLS).fill(false);
  const half = Math.ceil(CELLS / 2);
  for (let row = 0; row < CELLS; row += 1) {
    for (let column = 0; column < half; column += 1) {
      const filled = random() > 0.42;
      cells[row * CELLS + column] = filled;
      cells[row * CELLS + (CELLS - 1 - column)] = filled;
    }
  }
  return cells;
}

export function Avatar({
  seed,
  label,
  palette,
  size = 40,
  status = "none",
  decorative = false,
  roundedClassName = "rounded-xl",
  className,
  imageUrl,
}: AvatarProps) {
  const gradientId = useId().replace(/[:]/g, "");
  const [primary, secondary] = useMemo(
    () => palette ?? paletteFromHash(hashSeed(seed)),
    [palette, seed],
  );
  const cells = useMemo(() => buildCells(seed), [seed]);

  const labelProps = decorative
    ? { "aria-hidden": true as const }
    : { role: "img" as const, "aria-label": `Avatar de ${label}` };

  return (
    <span
      className={cn("relative inline-flex shrink-0", className)}
      style={{ width: size, height: size }}
      {...labelProps}
    >
      {imageUrl ? (
        <img
          src={imageUrl}
          alt={decorative ? "" : `Avatar de ${label}`}
          referrerPolicy="no-referrer"
          className={cn("pv-avatar-image h-full w-full object-contain ring-1 ring-white/10", roundedClassName)}
          onError={(event) => {
            event.currentTarget.style.display = "none";
            event.currentTarget.nextElementSibling?.classList.remove("hidden");
          }}
        />
      ) : null}
      <svg
        viewBox="0 0 100 100"
        className={cn(
          "h-full w-full overflow-hidden ring-1 ring-white/10",
          imageUrl ? "hidden" : "",
          roundedClassName,
        )}
      >
        <defs>
          <linearGradient id={gradientId} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={primary} />
            <stop offset="100%" stopColor={secondary} />
          </linearGradient>
        </defs>
        <rect width="100" height="100" fill={`url(#${gradientId})`} />
        <rect width="100" height="100" fill="#09090b" opacity="0.28" />
        {cells.map((filled, index) =>
          filled ? (
            <rect
              key={index}
              x={(index % CELLS) * 20 + 2}
              y={Math.floor(index / CELLS) * 20 + 2}
              width="16"
              height="16"
              rx="3.5"
              fill="#f4f4f5"
              opacity="0.82"
            />
          ) : null,
        )}
        <rect
          x="0"
          y="0"
          width="100"
          height="50"
          fill="#ffffff"
          opacity="0.08"
        />
      </svg>
      {status !== "none" ? (
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-zinc-950",
            size >= 40 ? "h-2.5 w-2.5" : "h-2 w-2",
            STATUS_STYLES[status],
          )}
        />
      ) : null}
    </span>
  );
}
