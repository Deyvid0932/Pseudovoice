import { LockIcon } from "./ui/icons";

export interface TelemetryFooterProps {
  sessionId: string;
  build: string;
  systemState?: string;
}

export function TelemetryFooter({
  sessionId,
  build,
  systemState = "STATE-OK",
}: TelemetryFooterProps) {
  return (
    <footer className="shrink-0 flex flex-wrap items-center justify-center gap-x-7 gap-y-2 border-t border-zinc-900 bg-zinc-950/90 px-6 py-3.5 backdrop-blur">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_2px_rgba(52,211,153,0.55)]" />
        <span className="pv-kicker text-zinc-600">System</span>
        <span className="text-zinc-700">/</span>
        <span className="pv-kicker text-emerald-400">{systemState}</span>
      </div>
      <span className="pv-kicker text-zinc-600">
        Session <span className="text-zinc-400">{sessionId}</span>
      </span>
      <span className="pv-kicker text-zinc-600">
        Build <span className="text-zinc-400">{build}</span>
      </span>
      <span className="flex items-center gap-2">
        <LockIcon size={12} className="text-teal-500" />
        <span className="pv-kicker text-zinc-400">Encryption Active</span>
      </span>
    </footer>
  );
}
