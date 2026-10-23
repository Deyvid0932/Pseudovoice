import { useEffect, useCallback } from "react";
import { useConversations } from "../../hooks/useConversations";
import type { NotifyInput } from "../../hooks/useToasts";
import { SessionList } from "../history/SessionList";
import { SessionDetail } from "../history/SessionDetail";
import { DownloadIcon, TrashIcon, XIcon } from "../ui/icons";
import type { VoiceProfile } from "../../types/voice";
import { TelemetryFooter } from "../TelemetryFooter";

export interface SessionLogsDrawerProps {
  userId: number;
  open: boolean;
  onClose: () => void;
  onNotify?: (input: NotifyInput) => void;
  profiles: VoiceProfile[];
  sessionId: string;
  build: string;
}

export function SessionLogsDrawer({
  userId,
  open,
  onClose,
  onNotify,
  profiles,
  sessionId,
  build,
}: SessionLogsDrawerProps) {
  const history = useConversations(userId, profiles);
  const { selectedConversation, selectedId, messages } = history;

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const handleExport = useCallback(() => {
    if (!selectedConversation) return;
    history.exportLogs();
    onNotify?.({
      title: "Log exportado",
      description: `Sesión «${selectedConversation.title}» descargada como JSON.`,
      variant: "success",
    });
  }, [history, selectedConversation, onNotify]);

  const handleDelete = useCallback(() => {
    if (!selectedConversation) return;
    const confirmed = window.confirm(
      `¿Eliminar la sesión «${selectedConversation.title}»? Esta acción no se puede deshacer.`,
    );
    if (!confirmed) return;
    void history.deleteSession(selectedConversation.id).then(() => onNotify?.({
      title: "Conversación eliminada",
      description: `«${selectedConversation.title}» se eliminó del historial.`,
      variant: "success",
    })).catch(() => onNotify?.({ title: "No se pudo eliminar", description: "Comprueba la conexión e inténtalo de nuevo.", variant: "error" }));
  }, [history, selectedConversation, onNotify]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Historial y Telemetría"
      className="fixed inset-0 z-50 flex justify-end"
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        className="fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity"
      />

      {/* Drawer content */}
      <div className="relative z-10 flex h-full w-full max-w-4xl flex-col border-l border-zinc-800 bg-zinc-950/95 p-6 shadow-2xl shadow-black backdrop-blur-xl animate-pv-rise">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-zinc-800/80 pb-5">
          <div>
            <p className="pv-kicker text-zinc-500">
              <span className="text-teal-400">Observabilidad</span>
              <span className="px-1.5 text-zinc-700">/</span>
              <span>Historial &amp; Telemetría</span>
            </p>
            <h2 className="mt-1 flex items-center gap-2.5 text-xl font-bold tracking-tight text-zinc-100">
              Session Logs
              <span className="pv-mono rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-zinc-400">
                {history.source === "api" ? "API LIVE" : "CACHE"}
              </span>
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleExport}
              disabled={!selectedConversation}
              className="flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900/80 px-3 py-2 text-xs font-semibold text-zinc-300 transition-all hover:border-teal-500/50 hover:text-teal-200 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <DownloadIcon size={14} />
              <span className="pv-kicker">Exportar</span>
            </button>
            <button
              type="button"
              onClick={handleDelete}
              disabled={!selectedConversation}
              className="flex items-center gap-2 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-xs font-semibold text-rose-300 transition-all hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <TrashIcon size={14} />
              <span className="pv-kicker">Eliminar</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Cerrar panel de logs"
              className="rounded-lg border border-zinc-800 p-2 text-zinc-500 transition-all hover:bg-zinc-800 hover:text-zinc-200"
            >
              <XIcon size={18} />
            </button>
          </div>
        </div>

        {/* Body Split Grid */}
        <div className="mt-5 grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden lg:grid-cols-[minmax(0,1fr)_minmax(0,1.8fr)]">
          <SessionList
            conversations={history.conversations}
            previews={history.previews}
            selectedId={selectedId}
            loading={history.loadingConversations}
            onSelect={history.selectConversation}
          />
          <SessionDetail
            conversation={selectedConversation}
            messages={messages}
            loading={history.loadingMessages}
            showTelemetry
          />
        </div>
        <TelemetryFooter sessionId={sessionId} build={build} />
      </div>
    </div>
  );
}
