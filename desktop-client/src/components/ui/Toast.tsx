import type { ToastNotification, ToastVariant } from "../../types/voice";
import { cn } from "../../lib/format";
import { CheckIcon, InfoIcon, XIcon } from "./icons";

export interface ToastViewportProps {
  notification: ToastNotification | null;
  onDismiss: () => void;
}

const VARIANT_STYLES: Record<
  ToastVariant,
  { ring: string; accent: string; icon: string }
> = {
  success: {
    ring: "border-teal-500/40",
    accent: "text-teal-300",
    icon: "bg-teal-500/15",
  },
  info: {
    ring: "border-sky-500/40",
    accent: "text-sky-300",
    icon: "bg-sky-500/15",
  },
  warning: {
    ring: "border-amber-500/40",
    accent: "text-amber-300",
    icon: "bg-amber-500/15",
  },
  error: {
    ring: "border-rose-500/40",
    accent: "text-rose-300",
    icon: "bg-rose-500/15",
  },
};

export function ToastViewport({
  notification,
  onDismiss,
}: ToastViewportProps) {
  return (
    <div
      aria-live={notification?.variant === "warning" || notification?.variant === "error" ? "assertive" : "polite"}
      aria-atomic="true"
      className="pv-toast-viewport pointer-events-none fixed bottom-16 right-6 z-50 flex w-full max-w-sm flex-col items-end"
    >
      {notification ? (
        <div
          className={cn(
            "pv-toast animate-pv-rise pointer-events-auto flex w-full items-start gap-3 rounded-2xl border bg-zinc-900/95 p-4 shadow-2xl shadow-black/60 backdrop-blur",
            VARIANT_STYLES[notification.variant].ring,
          )}
        >
          <span
            className={cn(
              "mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg",
              VARIANT_STYLES[notification.variant].icon,
              VARIANT_STYLES[notification.variant].accent,
            )}
          >
            {notification.variant === "success" ? (
              <CheckIcon size={15} />
            ) : (
              <InfoIcon size={15} />
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-zinc-100">
              {notification.title}
            </p>
            {notification.description ? (
              <p className="mt-0.5 text-xs leading-relaxed text-zinc-400">
                {notification.description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onDismiss}
            aria-label="Cerrar notificación"
            className="rounded-md p-1 text-zinc-500 transition-colors duration-200 hover:bg-zinc-800 hover:text-zinc-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400"
          >
            <XIcon size={14} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
