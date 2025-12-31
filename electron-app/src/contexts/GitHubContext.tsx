import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type {
  GitHubDailySummary,
  GitHubStatus,
} from "@/shared/electron-api";
import { getElectronAPI } from "@/lib/electron";

type GitHubContextValue = {
  status: GitHubStatus | null;
  summary: GitHubDailySummary | null;
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  refreshSummary: (date?: string) => Promise<void>;
};

const GitHubContext = createContext<GitHubContextValue | null>(null);

export function GitHubProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [summary, setSummary] = useState<GitHubDailySummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const electronAPI = useMemo(() => getElectronAPI(), []);

  const refresh = useCallback(async () => {
    if (!electronAPI) {
      setError("electronAPI unavailable");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const newStatus = await electronAPI.getGitHubStatus();
      setStatus(newStatus);

      if (!newStatus.cli.found) {
        setError("GitHub CLI not installed");
        return;
      }

      if (!newStatus.auth.authenticated) {
        setError(newStatus.auth.error || "Not authenticated");
        return;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to get GitHub status");
    } finally {
      setLoading(false);
    }
  }, [electronAPI]);

  const refreshSummary = useCallback(
    async (date?: string) => {
      if (!electronAPI) {
        return;
      }

      setLoading(true);

      try {
        const newSummary = await electronAPI.getGitHubDailySummary(date);
        setSummary(newSummary);
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to get daily summary"
        );
      } finally {
        setLoading(false);
      }
    },
    [electronAPI]
  );

  useEffect(() => {
    refresh();
  }, [refresh]);

  const value = useMemo(
    () => ({
      status,
      summary,
      loading,
      error,
      refresh,
      refreshSummary,
    }),
    [status, summary, loading, error, refresh, refreshSummary]
  );

  return (
    <GitHubContext.Provider value={value}>{children}</GitHubContext.Provider>
  );
}

export function useGitHub() {
  const context = useContext(GitHubContext);
  if (!context) {
    throw new Error("useGitHub must be used within GitHubProvider");
  }
  return context;
}
