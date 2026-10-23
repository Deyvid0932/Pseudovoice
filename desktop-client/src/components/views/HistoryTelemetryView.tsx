import { useState } from "react";
import type { UseConversationsResult } from "../../hooks/useConversations";
import { SessionList } from "../history/SessionList";
import { SessionDetail } from "../history/SessionDetail";

export interface HistoryTelemetryViewProps {
  history: UseConversationsResult;
  onContinue: (conversationId: number) => Promise<void>;
  busy: boolean;
  onRenameConversation: (conversationId: number, title: string) => Promise<void>;
  onDeleteConversation: (conversationId: number) => Promise<void>;
}

export function HistoryTelemetryView({ history, onContinue, busy, onRenameConversation, onDeleteConversation }: HistoryTelemetryViewProps) {
  const { selectedConversation, selectedId, messages } = history;
  const [opening, setOpening] = useState(false);
  const handleContinue = async () => {
    if (!selectedConversation) return;
    setOpening(true);
    try { await onContinue(selectedConversation.id); }
    catch { /* El dashboard muestra el aviso persistente y permite reintentar. */ }
    finally { setOpening(false); }
  };

  return <section aria-label="Historial de conversaciones" className="pv-history-page">
    <header className="pv-history-page-header"><div><p className="pv-eyebrow">Tus conversaciones</p><h1>Vuelve a cualquier momento</h1><p>Abre un chat para continuar exactamente donde lo dejaste.</p></div>{selectedConversation && <button className="pv-primary" type="button" disabled={opening || busy} onClick={() => void handleContinue()}>{opening ? "Abriendo…" : "Abrir conversación"}</button>}</header>
    {history.error && <div className="pv-inline-error" role="alert"><span>{history.error}</span></div>}
    <div className="pv-history-layout"><SessionList conversations={history.conversations} previews={history.previews} selectedId={selectedId} loading={history.loadingConversations} onSelect={history.selectConversation} onRename={onRenameConversation} onDeleteConversation={onDeleteConversation} busy={busy} /><div className="pv-history-detail-wrap"><SessionDetail conversation={selectedConversation} messages={messages} loading={history.loadingMessages} /><p className="pv-history-detail-note">Los detalles técnicos y las métricas se encuentran en Diagnóstico avanzado.</p></div></div>
  </section>;
}
