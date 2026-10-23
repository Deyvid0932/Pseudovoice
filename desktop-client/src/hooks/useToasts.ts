import { useCallback, useEffect, useRef, useState } from "react";
import type { ToastNotification, ToastVariant } from "../types/voice";

export interface NotifyInput {
  title: string;
  description?: string;
  variant?: ToastVariant;
}

export interface UseToastsResult {
  notification: ToastNotification | null;
  notify: (input: NotifyInput) => void;
  dismiss: () => void;
}

export function useToasts(durationMs = 3400): UseToastsResult {
  const [notification, setNotification] = useState<ToastNotification | null>(
    null,
  );
  const counterRef = useRef(0);

  const notify = useCallback((input: NotifyInput) => {
    counterRef.current += 1;
    setNotification({
      id: `toast-${Date.now().toString(36)}-${counterRef.current}`,
      title: input.title,
      description: input.description,
      variant: input.variant ?? "success",
    });
  }, []);

  const dismiss = useCallback(() => setNotification(null), []);

  useEffect(() => {
    if (!notification || notification.variant === "warning" || notification.variant === "error") {
      return;
    }
    const timeout = window.setTimeout(() => setNotification(null), durationMs);
    return () => window.clearTimeout(timeout);
  }, [notification, durationMs]);

  return { notification, notify, dismiss };
}
