import type { ReactNode } from "react";
import { cn } from "../../lib/format";

export interface PanelShellProps {
  children: ReactNode;
  className?: string;
  ariaLabel: string;
}

export function PanelShell({ children, className, ariaLabel }: PanelShellProps) {
  return (
    <section
      aria-label={ariaLabel}
      className={cn(
        "flex min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60 shadow-xl shadow-black/30 backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </section>
  );
}

export interface PanelHeaderProps {
  index: string;
  section: string;
  title: string;
  accessory?: ReactNode;
  description?: string;
}

export function PanelHeader({
  index,
  section,
  title,
  accessory,
  description,
}: PanelHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-zinc-800/80 px-5 py-4">
      <div className="min-w-0">
        <p className="pv-kicker text-zinc-500">
          <span className="text-zinc-600">{index}</span>
          <span className="px-1.5 text-zinc-700">/</span>
          <span className="text-zinc-400">{section}</span>
        </p>
        <h2 className="mt-1 truncate text-base font-bold tracking-wide text-zinc-100">
          {title}
        </h2>
        {description ? (
          <p className="mt-1 text-xs text-zinc-500">{description}</p>
        ) : null}
      </div>
      {accessory ? <div className="shrink-0">{accessory}</div> : null}
    </div>
  );
}
