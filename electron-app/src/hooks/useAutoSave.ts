import { useEffect, useRef, useCallback } from "react";

interface UseAutoSaveOptions {
  content: string;
  filePath: string | null;
  isDirty: boolean;
  onSave: () => Promise<boolean>;
  debounceMs?: number;
  enabled?: boolean;
}

export function useAutoSave({
  content,
  filePath,
  isDirty,
  onSave,
  debounceMs = 2000,
  enabled = true,
}: UseAutoSaveOptions): void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isSavingRef = useRef(false);

  const debouncedSave = useCallback(async () => {
    if (isSavingRef.current) return;

    if (isDirty && filePath && enabled) {
      isSavingRef.current = true;
      try {
        await onSave();
      } finally {
        isSavingRef.current = false;
      }
    }
  }, [isDirty, filePath, enabled, onSave]);

  useEffect(() => {
    if (!isDirty || !filePath || !enabled) {
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      debouncedSave();
    }, debounceMs);

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [content, isDirty, filePath, enabled, debounceMs, debouncedSave]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);
}
