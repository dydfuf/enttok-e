import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type BackendStatus = "stopped" | "starting" | "running" | "stopping" | "error";

export type BackendState = {
  status: BackendStatus;
  pid: number | null;
  port: number | null;
  token: string | null;
  startedAt: number | null;
  lastExitCode: number | null;
  lastSignal: string | null;
  lastError: string | null;
};

export type BackendLog = {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
};

type BackendHealth = {
  healthy: boolean;
};

type BackendAPI = {
  startBackend: () => Promise<BackendState>;
  stopBackend: () => Promise<BackendState>;
  getBackendStatus: () => Promise<BackendState>;
  checkBackendHealth: () => Promise<BackendHealth>;
  onBackendLog: (handler: (payload: BackendLog) => void) => () => void;
  onBackendStatus: (handler: (payload: BackendState) => void) => () => void;
};

type BackendContextValue = {
  state: BackendState | null;
  logs: BackendLog[];
  health: BackendHealth | null;
  start: () => Promise<void>;
  stop: () => Promise<void>;
};

const BackendContext = createContext<BackendContextValue | null>(null);

const LOG_LIMIT = 200;

function getElectronAPI(): BackendAPI | null {
  if (typeof window === "undefined") {
    return null;
  }
  const api = (window as unknown as { electronAPI?: BackendAPI }).electronAPI;
  return api ?? null;
}

export function BackendProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<BackendState | null>(null);
  const [logs, setLogs] = useState<BackendLog[]>([]);
  const [health, setHealth] = useState<BackendHealth | null>(null);

  const electronAPI = useMemo(() => getElectronAPI(), []);

  const start = useCallback(async () => {
    if (!electronAPI) {
      return;
    }
    await electronAPI.startBackend();
  }, [electronAPI]);

  const stop = useCallback(async () => {
    if (!electronAPI) {
      return;
    }
    await electronAPI.stopBackend();
  }, [electronAPI]);

  useEffect(() => {
    if (!electronAPI) {
      setState({
        status: "error",
        pid: null,
        port: null,
        token: null,
        startedAt: null,
        lastExitCode: null,
        lastSignal: null,
        lastError: "electronAPI unavailable",
      });
      return;
    }

    const offLog = electronAPI.onBackendLog((payload) => {
      setLogs((prev) => {
        const next = [...prev, payload];
        if (next.length > LOG_LIMIT) {
          return next.slice(-LOG_LIMIT);
        }
        return next;
      });
    });

    const offStatus = electronAPI.onBackendStatus((payload) => {
      setState(payload);
    });

    electronAPI.getBackendStatus().then(setState).catch(() => {
      setState((prev) =>
        prev
          ? { ...prev, status: "error", lastError: "status fetch failed" }
          : null
      );
    });

    electronAPI.startBackend().catch(() => {
      setState((prev) =>
        prev
          ? { ...prev, status: "error", lastError: "start failed" }
          : null
      );
    });

    return () => {
      offLog();
      offStatus();
    };
  }, [electronAPI]);

  useEffect(() => {
    if (!electronAPI || state?.status !== "running") {
      return;
    }
    let canceled = false;
    const intervalId = window.setInterval(async () => {
      try {
        const result = await electronAPI.checkBackendHealth();
        if (!canceled) {
          setHealth(result);
        }
      } catch {
        if (!canceled) {
          setHealth({ healthy: false });
        }
      }
    }, 5000);
    return () => {
      canceled = true;
      window.clearInterval(intervalId);
    };
  }, [electronAPI, state?.status]);

  const value = useMemo(
    () => ({
      state,
      logs,
      health,
      start,
      stop,
    }),
    [state, logs, health, start, stop]
  );

  return <BackendContext.Provider value={value}>{children}</BackendContext.Provider>;
}

export function useBackend() {
  const context = useContext(BackendContext);
  if (!context) {
    throw new Error("useBackend must be used within BackendProvider");
  }
  return context;
}
