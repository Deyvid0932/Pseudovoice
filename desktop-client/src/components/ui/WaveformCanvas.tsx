import { useEffect, useRef, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "../../lib/format";

export interface WaveformCanvasProps {
  levels: number[];
  live: boolean;
  onPulse?: (strength: number) => void;
  height?: number;
  className?: string;
}

function paintRoundedBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  barHeight: number,
  radius: number,
): void {
  const safeRadius = Math.min(radius, width / 2, barHeight / 2);
  ctx.beginPath();
  ctx.moveTo(x + safeRadius, y);
  ctx.lineTo(x + width - safeRadius, y);
  ctx.arcTo(x + width, y, x + width, y + safeRadius, safeRadius);
  ctx.lineTo(x + width, y + barHeight - safeRadius);
  ctx.arcTo(x + width, y + barHeight, x + width - safeRadius, y + barHeight, safeRadius);
  ctx.lineTo(x + safeRadius, y + barHeight);
  ctx.arcTo(x, y + barHeight, x, y + barHeight - safeRadius, safeRadius);
  ctx.lineTo(x, y + safeRadius);
  ctx.arcTo(x, y, x + safeRadius, y, safeRadius);
  ctx.closePath();
}

export function WaveformCanvas({
  levels,
  live,
  onPulse,
  height = 96,
  className,
}: WaveformCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const targetRef = useRef<number[]>(levels);
  const currentRef = useRef<number[]>([]);
  const liveRef = useRef(live);
  const frameRef = useRef(0);
  const lastPulseRef = useRef(0);

  useEffect(() => {
    targetRef.current = levels;
  }, [levels]);

  useEffect(() => {
    liveRef.current = live;
  }, [live]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) {
      return;
    }
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    let width = 0;
    let canvasHeight = 0;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      width = container.clientWidth;
      canvasHeight = container.clientHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(canvasHeight * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${canvasHeight}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(container);

    const render = () => {
      const target = targetRef.current;
      const count = Math.max(1, target.length);
      if (currentRef.current.length !== count) {
        currentRef.current = new Array<number>(count).fill(0.08);
      }
      const current = currentRef.current;

      ctx.clearRect(0, 0, width, canvasHeight);

      const gap = 2;
      const barWidth = Math.max(1.5, (width - gap * (count - 1)) / count);
      const centerY = canvasHeight / 2;
      const maxBar = canvasHeight - 6;

      for (let index = 0; index < count; index += 1) {
        const goal = liveRef.current
          ? Math.max(0.05, target[index] ?? 0.05)
          : 0.04;
        current[index] += (goal - current[index]) * 0.24;
        const amplitude = Math.max(2, current[index] * maxBar);
        const x = index * (barWidth + gap);
        const y = centerY - amplitude / 2;

        const gradient = ctx.createLinearGradient(0, y, 0, y + amplitude);
        gradient.addColorStop(0, "rgba(45, 212, 191, 0.95)");
        gradient.addColorStop(0.5, "rgba(56, 189, 248, 0.82)");
        gradient.addColorStop(1, "rgba(20, 184, 166, 0.3)");

        ctx.fillStyle = gradient;
        paintRoundedBar(ctx, x, y, barWidth, amplitude, barWidth / 2);
        ctx.fill();
      }

      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);

    return () => {
      cancelAnimationFrame(frameRef.current);
      observer.disconnect();
    };
  }, []);

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!onPulse) {
      return;
    }
    const now = performance.now();
    if (now - lastPulseRef.current < 55) {
      return;
    }
    lastPulseRef.current = now;
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (event.clientX - rect.left) / rect.width));
    onPulse(0.35 + ratio * 0.9);
  };

  return (
    <div
      ref={containerRef}
      className={cn("relative w-full", className)}
      style={{ height }}
      onPointerMove={handlePointerMove}
    >
      <canvas ref={canvasRef} className="block h-full w-full" aria-hidden="true" />
    </div>
  );
}
