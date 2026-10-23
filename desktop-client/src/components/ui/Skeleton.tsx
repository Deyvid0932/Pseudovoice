import { cn } from "../../lib/format";

export interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        "animate-pv-shimmer rounded-md bg-gradient-to-r from-zinc-800/50 via-zinc-700/50 to-zinc-800/50",
        className,
      )}
    />
  );
}
