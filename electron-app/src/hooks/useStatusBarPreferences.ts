import { useCallback, useEffect, useMemo, useState } from "react";
import { getElectronAPI } from "@/lib/electron";
import type { StatusBarPreferences } from "@/shared/electron-api";

const DEFAULT_STATUS_BAR_PREFERENCES: StatusBarPreferences = {
  showBackendStatus: true,
  showSaveStatus: true,
  showGitHubStatus: true,
  showActivity: true,
  showStatusMessage: true,
  showNoteInfo: true,
  showVaultInfo: true,
  showSelection: true,
  showCursor: true,
  showWordCount: true,
  showCharCount: true,
};

export function useStatusBarPreferences() {
  const api = useMemo(() => getElectronAPI(), []);
  const [preferences, setPreferences] = useState<StatusBarPreferences>(
    DEFAULT_STATUS_BAR_PREFERENCES
  );

  useEffect(() => {
    if (!api) {
      return;
    }
    api
      .getStatusBarPreferences()
      .then((stored) => {
        setPreferences({ ...DEFAULT_STATUS_BAR_PREFERENCES, ...stored });
      })
      .catch(() => undefined);
  }, [api]);

  const persistPreferences = useCallback(
    (next: StatusBarPreferences) => {
      setPreferences(next);
      api?.setStatusBarPreferences(next).catch(() => undefined);
    },
    [api]
  );

  const setPreference = useCallback(
    (key: keyof StatusBarPreferences, value: boolean) => {
      setPreferences((prev) => {
        const next = { ...prev, [key]: value };
        api?.setStatusBarPreferences(next).catch(() => undefined);
        return next;
      });
    },
    [api]
  );

  const resetPreferences = useCallback(() => {
    setPreferences(DEFAULT_STATUS_BAR_PREFERENCES);
    api
      ?.resetStatusBarPreferences()
      .then((next) => setPreferences({ ...DEFAULT_STATUS_BAR_PREFERENCES, ...next }))
      .catch(() => undefined);
  }, [api]);

  return {
    preferences,
    persistPreferences,
    setPreference,
    resetPreferences,
    defaults: DEFAULT_STATUS_BAR_PREFERENCES,
  };
}
