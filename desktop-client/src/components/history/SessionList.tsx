import { useMemo, useState } from "react";
import type { ConversationSummary } from "../../types/voice";
import { cn } from "../../lib/format";
import { Avatar } from "../ui/Avatar";
import { Skeleton } from "../ui/Skeleton";
import { TrashIcon } from "../ui/icons";
import { ConversationActionsMenu } from "./ConversationActionsMenu";

export interface SessionListProps {
  conversations: ConversationSummary[];
  previews?: Record<number, string>;
  selectedId: number | null;
  loading: boolean;
  onSelect: (conversationId: number) => void;
  onDelete?: (conversationId: number, title: string) => void;
  onRename?: (conversationId: number, title: string) => Promise<void>;
  onDeleteConversation?: (conversationId: number) => Promise<void>;
  busy?: boolean;
}

function dateGroup(value: string): string {
  const date = Date.parse(value);
  if (!Number.isFinite(date)) return "Anteriores";
  const startToday = new Date(); startToday.setHours(0, 0, 0, 0);
  const startYesterday = new Date(startToday); startYesterday.setDate(startToday.getDate() - 1);
  const startWeek = new Date(startToday); startWeek.setDate(startToday.getDate() - 7);
  if (date >= startToday.getTime()) return "Hoy";
  if (date >= startYesterday.getTime()) return "Ayer";
  if (date >= startWeek.getTime()) return "Últimos 7 días";
  return "Anteriores";
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const GROUPS = ["Hoy", "Ayer", "Últimos 7 días", "Anteriores"];

export function SessionList({ conversations, previews = {}, selectedId, loading, onSelect, onDelete, onRename, onDeleteConversation, busy = false }: SessionListProps) {
  const [query, setQuery] = useState("");
  const grouped = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const filtered = conversations.filter(item => [item.title, item.characterName, previews[item.id] ?? ""]
      .some(value => value.toLocaleLowerCase().includes(needle)));
    return GROUPS.map(group => [group, filtered.filter(item => dateGroup(item.startedAt) === group)] as const)
      .filter(([, items]) => items.length > 0);
  }, [conversations, previews, query]);

  return (
    <section className="pv-history-list">
      <div className="pv-history-list-heading">
        <div><p className="pv-eyebrow">Tus chats</p><h2>Conversaciones</h2></div>
        <span className="pv-history-count">{conversations.length}</span>
      </div>
      <label className="pv-history-search"><span aria-hidden="true">⌕</span><input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Buscar por título, personaje o mensaje" aria-label="Buscar conversaciones" /></label>
      <div className="pv-history-items" aria-live="polite">
        {loading ? Array.from({ length: 4 }, (_, index) => <Skeleton key={index} className="h-[72px] w-full rounded-2xl" />) : grouped.map(([group, items]) => (
          <section key={group} className="pv-history-group" aria-label={group}>
            <h3>{group}</h3>
            {items.map(conversation => <article className={cn("pv-history-item", conversation.id === selectedId && "is-active")} key={conversation.id}>
              <button type="button" className="pv-history-open" disabled={busy} onClick={() => onSelect(conversation.id)} aria-current={conversation.id === selectedId ? "true" : undefined}>
                <Avatar seed={conversation.avatarSeed} label={conversation.characterName} imageUrl={conversation.avatarUrl} palette={conversation.palette} size={44} roundedClassName="rounded-full" decorative />
                <span className="pv-history-copy"><strong>{conversation.title}</strong><small>{conversation.characterName}{formatTime(conversation.startedAt) ? ` · ${formatTime(conversation.startedAt)}` : ""}</small><span>{previews[conversation.id] || "Abre para ver esta conversación"}</span></span>
              </button>
              {onRename && onDeleteConversation ? <ConversationActionsMenu conversation={conversation} disabled={busy} onRename={onRename} onDelete={onDeleteConversation} /> : onDelete && <button className="pv-history-delete" type="button" disabled={busy} aria-label={`Eliminar conversación de ${conversation.characterName}`} title="Eliminar conversación" onClick={() => onDelete(conversation.id, conversation.title)}><TrashIcon size={16} /></button>}
            </article>)}
          </section>
        ))}
        {!loading && grouped.length === 0 && <div className="pv-history-empty"><span aria-hidden="true">⌕</span><strong>{query ? "No encontramos conversaciones" : "Aún no hay conversaciones"}</strong><p>{query ? "Prueba con otro nombre o una palabra del chat." : "Cuando converses con tus personajes, tus chats aparecerán aquí."}</p></div>}
      </div>
    </section>
  );
}
