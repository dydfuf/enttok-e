import { useCallback, useEffect, useRef, useState } from "react";

export type StatusBarMessageTone = "info" | "warning" | "error" | "success";

export type StatusBarMessage = {
  text: string;
  tone?: StatusBarMessageTone;
};

type StatusBarMessageEvent = {
  text: string;
  tone?: StatusBarMessageTone;
  timeoutMs?: number;
};

const DEFAULT_TIMEOUT_MS = 4000;

export function useStatusBarMessage() {
  const [message, setMessage] = useState<StatusBarMessage | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearMessage = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    setMessage(null);
  }, []);

  const pushMessage = useCallback(
    (next: StatusBarMessage, timeoutMs = DEFAULT_TIMEOUT_MS) => {
      setMessage(next);
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (timeoutMs > 0) {
        timeoutRef.current = setTimeout(() => {
          setMessage(null);
          timeoutRef.current = null;
        }, timeoutMs);
      }
    },
    []
  );

  useEffect(() => {
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<StatusBarMessageEvent>).detail;
      if (!detail?.text) {
        return;
      }
      pushMessage(
        { text: detail.text, tone: detail.tone },
        detail.timeoutMs ?? DEFAULT_TIMEOUT_MS
      );
    };

    window.addEventListener("statusbar:message", handler as EventListener);
    return () => {
      window.removeEventListener("statusbar:message", handler as EventListener);
    };
  }, [pushMessage]);

  return { message, pushMessage, clearMessage };
}
