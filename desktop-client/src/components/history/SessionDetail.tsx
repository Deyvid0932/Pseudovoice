import type {
  ConversationMessage,
  ConversationSummary,
} from "../../types/voice";
import { Skeleton } from "../ui/Skeleton";
import { MessageBubble } from "./MessageBubble";

export interface SessionDetailProps {
  conversation: ConversationSummary | null;
  messages: ConversationMessage[];
  loading: boolean;
  showTelemetry?: boolean;
}

export function SessionDetail({
  conversation,
  messages,
  loading,
  showTelemetry = false,
}: SessionDetailProps) {
  return (
    <div className="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex items-center justify-between gap-4 border-b border-zinc-800/80 px-5 py-4">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-teal-400 shadow-[0_0_8px_2px_rgba(45,212,191,0.5)]" />
          <span className="pv-kicker shrink-0 text-zinc-500">
            Detalle
          </span>
          <span className="text-zinc-700">/</span>
          <span className="truncate text-sm font-semibold text-zinc-100">
            {conversation?.title ?? "—"}
          </span>
        </div>
        <span className="pv-kicker shrink-0 text-zinc-600">
          {conversation?.characterName ?? "Elige una conversación"}
        </span>
      </div>

      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto p-5 pv-scroll">
        {loading ? (
          <>
            <Skeleton className="h-20 w-2/3 self-end rounded-xl" />
            <Skeleton className="h-28 w-3/4 rounded-xl" />
            <Skeleton className="h-16 w-1/2 self-end rounded-xl" />
          </>
        ) : messages.length === 0 ? (
          <div className="flex flex-1 items-center justify-center">
            <p className="pv-kicker text-zinc-600">
              Esta conversación aún no tiene mensajes.
            </p>
          </div>
        ) : (
          messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              speakerName={conversation?.characterName}
              showTelemetry={showTelemetry}
            />
          ))
        )}
      </div>
    </div>
  );
}
