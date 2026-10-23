import { useState } from "react";
import type { ConversationMessage } from "../../types/voice";
import { cn } from "../../lib/format";

export interface MessageBubbleProps {
  message: ConversationMessage;
  speakerName?: string;
  showTelemetry?: boolean;
}

export function MessageBubble({ message, speakerName, showTelemetry = false }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const [copied, setCopied] = useState(false);
  const copyMessage = async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div
      className={cn(
        "flex w-full",
        isUser ? "justify-end" : "justify-start",
      )}
    >
      <div
        className={cn(
          "max-w-[82%] rounded-xl border px-4 py-3",
          isUser
            ? "border-zinc-800 bg-zinc-800/40"
            : "border-rose-500/25 bg-zinc-900/70",
        )}
      >
        <p
          className={cn(
            "pv-kicker mb-2",
            isUser ? "text-sky-400" : "text-rose-400",
          )}
        >
          {isUser ? "Tú" : (speakerName ?? "Personaje no disponible")} · {message.createdAt}
        </p>

        <p className="text-sm leading-relaxed text-zinc-100">
          {message.content}
        </p>

        <button className="pv-message-copy" type="button" aria-label="Copiar mensaje" title="Copiar mensaje" onClick={() => { void copyMessage(); }}>{copied ? "Copiado" : "Copiar"}</button>

        {showTelemetry && message.telemetry ? (
          <div className="mt-3 border-t border-zinc-800/80 pt-2.5">
            <p className="pv-mono flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-zinc-500">
              <span>
                STT:{" "}
                <span className="text-zinc-400">
                  {message.telemetry.sttMs}ms
                </span>
              </span>
              <span>
                Decisión:{" "}
                <span className="text-zinc-400">
                  {message.telemetry.jevMs}ms
                </span>
              </span>
              <span>
                LLM:{" "}
                <span className="text-zinc-400">
                  {message.telemetry.llmMs}ms
                </span>
              </span>
              <span>
                TTS:{" "}
                <span className="text-zinc-400">
                  {message.telemetry.ttsMs}ms
                </span>
              </span>
            </p>
            {message.telemetry.generatedAudioPath ? (
              <p className="pv-mono mt-1.5 text-[10px] text-rose-400/80">
                generated_audio_path:{" "}
                <span className="text-rose-300/90">
                  {message.telemetry.generatedAudioPath}
                </span>
              </p>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}
