import { useMemo } from "react";
import { useBackend } from "@/contexts/BackendContext";
import { cn } from "@/lib/utils";

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

export default function BackendStatusPanel() {
  const { state, logs, health } = useBackend();

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
    </div>
  );
}
