import { useNavigate } from "@tanstack/react-router";
import { GitBranch, HelpCircle } from "lucide-react";
import { useBackend } from "@/contexts/BackendContext";
import { cn } from "@/lib/utils";

interface StatusBarProps {
  wordCount?: number;
  backlinks?: number;
  gitBranch?: string;
}

const statusColors: Record<string, string> = {
  stopped: "bg-gray-400",
  starting: "bg-yellow-500 animate-pulse",
  running: "bg-green-500 animate-pulse",
  stopping: "bg-yellow-500",
  error: "bg-red-500",
};

const statusLabels: Record<string, string> = {
  stopped: "Stopped",
  starting: "Starting...",
  running: "Running",
  stopping: "Stopping...",
  error: "Error",
};

export function StatusBar({
  wordCount = 0,
  backlinks = 0,
  gitBranch = "main",
}: StatusBarProps) {
  const navigate = useNavigate();
  const { state } = useBackend();
  const status = state?.status ?? "stopped";

  const handleStatusClick = () => {
    navigate({ to: "/settings", search: { tab: "system" } });
  };

  return (
    <footer className="h-8 bg-muted/50 border-t border-border flex items-center justify-between px-4 text-xs text-muted-foreground shrink-0">
      {/* Left section */}
      <div className="flex items-center space-x-4">
        {/* Backend status */}
        <button
          type="button"
          onClick={handleStatusClick}
          className="flex items-center space-x-2 hover:text-foreground transition-colors"
        >
          <div
            className={cn("w-2 h-2 rounded-full", statusColors[status] ?? statusColors.stopped)}
          />
          <span>Backend: {statusLabels[status] ?? "Unknown"}</span>
        </button>

        {/* Backlinks count */}
        <div className="hidden md:block">
          <span className="font-mono">{backlinks} backlinks</span>
        </div>

        {/* Word count */}
        <div className="hidden md:block">
          <span className="font-mono">{wordCount} words</span>
        </div>
      </div>

      {/* Right section */}
      <div className="flex items-center space-x-4">
        {/* Git branch */}
        <button
          type="button"
          className="flex items-center gap-1 cursor-pointer hover:text-foreground transition-colors"
        >
          <GitBranch className="size-3.5" />
          <span>{gitBranch}</span>
        </button>

        {/* Encoding */}
        <span>UTF-8</span>

        {/* Help */}
        <button
          type="button"
          className="cursor-pointer hover:text-foreground transition-colors"
        >
          <HelpCircle className="size-3.5" />
        </button>
      </div>
    </footer>
  );
}
