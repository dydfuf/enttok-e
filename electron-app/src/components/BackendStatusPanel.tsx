import { useEffect, useMemo, useState } from "react";
import { useBackend } from "@/contexts/BackendContext";
import { cn } from "@/lib/utils";
import type { RuntimeBinaryStatus, RuntimeStatus } from "@/shared/electron-api";
import { getElectronAPI } from "@/lib/electron";

const STATUS_LABELS: Record<string, string> = {
  stopped: "Stopped",
  starting: "Starting",
  running: "Running",
  stopping: "Stopping",
  error: "Error",
};

const STATUS_CLASSES: Record<string, string> = {
  stopped: "bg-slate-400",
  starting: "bg-amber-400",
  running: "bg-emerald-500",
  stopping: "bg-amber-400",
  error: "bg-red-500",
};

function formatRuntimeLabel(status: RuntimeBinaryStatus | null) {
  if (!status) {
    return "Checking";
  }
  if (!status.found) {
    return "Not found";
  }
  return status.version ? status.version : "Found";
}

export default function BackendStatusPanel() {
  const { state, logs, health } = useBackend();
  const [runtime, setRuntime] = useState<RuntimeStatus | null>(null);

  const lastLogs = useMemo(() => logs.slice(-6), [logs]);
  const status = state?.status ?? "stopped";
  const statusLabel = STATUS_LABELS[status] ?? status;
  const statusClass = STATUS_CLASSES[status] ?? STATUS_CLASSES.stopped;
  const healthLabel =
    status === "running"
      ? health
        ? health.healthy
          ? "Healthy"
          : "Unhealthy"
        : "Checking"
      : "N/A";

  useEffect(() => {
    const api = getElectronAPI();
    if (!api) {
      return;
    }
    let mounted = true;
    api
      .getRuntimeStatus()
      .then((value) => {
        if (mounted) {
          setRuntime(value);
        }
      })
      .catch(() => undefined);
    api
      .checkRuntime()
      .then((value) => {
        if (mounted) {
          setRuntime(value);
        }
      })
      .catch(() => undefined);
    const off = api.onRuntimeStatus((value) => {
      setRuntime(value);
    });
    return () => {
      mounted = false;
      off();
    };
  }, []);

  return (
    <div className="mt-6 border-t border-gray-200 dark:border-gray-800 pt-4">
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <span className={cn("h-2 w-2 rounded-full", statusClass)} />
          <span className="font-medium text-gray-700 dark:text-gray-300">
            Backend: {statusLabel}
          </span>
        </div>
        <span>{healthLabel}</span>
      </div>
      <div className="mt-2 text-[11px] text-muted-foreground">
        {state?.port ? `127.0.0.1:${state.port}` : "no port"}
      </div>
      <div className="mt-3 rounded-md bg-gray-100 dark:bg-gray-900 p-2 max-h-28 overflow-y-auto">
        {lastLogs.length === 0 ? (
          <div className="text-xs text-muted-foreground text-center py-2">
            No backend logs yet
          </div>
        ) : (
          <ul className="space-y-1">
            {lastLogs.map((log, index) => (
              <li
                key={`${log.timestamp}-${index}`}
                className="text-[11px] text-gray-700 dark:text-gray-300"
              >
                <span className="mr-2 text-[10px] text-gray-400">
                  {log.level}
                </span>
                {log.message}
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="mt-4 border-t border-gray-200 dark:border-gray-800 pt-3">
        <div className="text-xs font-medium text-gray-600 dark:text-gray-300">
          Runtime
        </div>
        <div className="mt-2 space-y-1 text-xs text-muted-foreground">
          {[
            { label: "Node", status: runtime?.node ?? null },
            { label: "npx", status: runtime?.npx ?? null },
            { label: "Claude", status: runtime?.claude ?? null },
          ].map((item) => (
            <div key={item.label} className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    item.status
                      ? item.status.found
                        ? "bg-emerald-500"
                        : "bg-red-500"
                      : "bg-amber-400"
                  )}
                />
                <span className="text-gray-700 dark:text-gray-300">
                  {item.label}
                </span>
              </div>
              <span>{formatRuntimeLabel(item.status)}</span>
            </div>
          ))}
          {runtime?.lastCheckedAt && (
            <div className="text-[11px] text-muted-foreground">
              Checked {runtime.lastCheckedAt}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
