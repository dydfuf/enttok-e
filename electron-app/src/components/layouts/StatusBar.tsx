import { Loader2 } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useBackend } from "@/contexts/BackendContext";
import { useEditorOptional } from "@/contexts/EditorContext";
import { useGitHub } from "@/contexts/GitHubContext";
import { useVault } from "@/contexts/VaultContext";
import { useEditorStats } from "@/hooks/useEditorStats";
import { useStatusBarMessage } from "@/hooks/useStatusBarMessage";
import { useStatusBarPreferences } from "@/hooks/useStatusBarPreferences";
import { cn } from "@/lib/utils";

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/\/+$/, "");
}

function isWindowsPath(value: string): boolean {
  return /^[A-Za-z]:\//.test(value);
}

function getBaseName(value: string): string {
  const normalized = normalizePath(value);
  const parts = normalized.split("/").filter(Boolean);
  return parts[parts.length - 1] ?? value;
}

function getRelativePath(basePath: string, fullPath: string): string | null {
  const normalizedBase = normalizePath(basePath);
  const normalizedFull = normalizePath(fullPath);
  const comparableBase = isWindowsPath(normalizedBase)
    ? normalizedBase.toLowerCase()
    : normalizedBase;
  const comparableFull = isWindowsPath(normalizedFull)
    ? normalizedFull.toLowerCase()
    : normalizedFull;

  if (!comparableFull.startsWith(comparableBase)) {
    return null;
  }

  const remainder = normalizedFull.slice(normalizedBase.length).replace(/^\/+/, "");
  return remainder || null;
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

type SaveStatus = "saving" | "dirty" | "saved";

const saveStatusColors: Record<string, string> = {
  saving: "bg-amber-500 animate-pulse",
  dirty: "bg-amber-500",
  saved: "bg-emerald-500",
};

const saveStatusLabels: Record<string, string> = {
  saving: "Saving...",
  dirty: "Unsaved",
  saved: "Saved",
};

type GitHubState = "checking" | "error" | "missing" | "unauth" | "connected" | "unavailable";

const gitHubStatusColors: Record<GitHubState, string> = {
  checking: "bg-amber-400 animate-pulse",
  error: "bg-red-500",
  missing: "bg-amber-500",
  unauth: "bg-amber-500",
  connected: "bg-emerald-500",
  unavailable: "bg-gray-400",
};

const messageToneClasses: Record<string, string> = {
  info: "text-muted-foreground",
  warning: "text-amber-600",
  error: "text-red-500",
  success: "text-emerald-500",
};

export function StatusBar() {
  const navigate = useNavigate();
  const { state } = useBackend();
  const { status: gitHubStatus, loading: gitHubLoading, error: gitHubError } = useGitHub();
  const { vaultPath } = useVault();
  const editor = useEditorOptional();
  const { message } = useStatusBarMessage();
  const { preferences, setPreference, resetPreferences } = useStatusBarPreferences();
  const notePath = editor?.notePath ?? null;
  const status = state?.status ?? "stopped";
  const {
    wordCount,
    charCount,
    selectionLength,
    cursorLine,
    cursorColumn,
    hasSelection,
    isDirty,
    isSaving,
  } = useEditorStats();

  const saveStatus: SaveStatus = isSaving ? "saving" : isDirty ? "dirty" : "saved";
  const vaultName = vaultPath ? getBaseName(vaultPath) : "No vault";
  const noteName = notePath ? getBaseName(notePath) : "No note";
  const noteRelativePath =
    notePath && vaultPath ? getRelativePath(vaultPath, notePath) : null;
  const noteDirectory = noteRelativePath
    ? noteRelativePath
        .split("/")
        .slice(0, -1)
        .filter(Boolean)
        .join("/")
    : null;
  const backendError = status === "error" ? state?.lastError ?? null : null;
  const messageText = backendError ?? message?.text ?? null;
  const messageTone = backendError ? "error" : message?.tone ?? "info";

  const activityItems: string[] = [];
  if (status === "starting") {
    activityItems.push("Starting backend");
  }
  if (status === "stopping") {
    activityItems.push("Stopping backend");
  }
  if (gitHubLoading) {
    activityItems.push("Checking GitHub");
  }
  if (isSaving) {
    activityItems.push("Saving note");
  }

  const activityLabel =
    activityItems.length > 0
      ? activityItems.length === 1
        ? activityItems[0]
        : `${activityItems[0]} +${activityItems.length - 1}`
      : null;

  let gitHubState: GitHubState = "unavailable";
  let gitHubLabel = "GitHub: Unavailable";
  let gitHubTitle = "";

  if (gitHubLoading) {
    gitHubState = "checking";
    gitHubLabel = "GitHub: Checking...";
  } else if (gitHubError) {
    gitHubState = "error";
    gitHubLabel = "GitHub: Error";
    gitHubTitle = gitHubError;
  } else if (!gitHubStatus) {
    gitHubState = "unavailable";
    gitHubLabel = "GitHub: Unavailable";
  } else if (!gitHubStatus.cli.found) {
    gitHubState = "missing";
    gitHubLabel = "GitHub: CLI Missing";
    gitHubTitle = gitHubStatus.cli.error ?? "";
  } else if (!gitHubStatus.auth.authenticated) {
    gitHubState = "unauth";
    gitHubLabel = "GitHub: Sign in";
    gitHubTitle = gitHubStatus.auth.error ?? "";
  } else {
    gitHubState = "connected";
    gitHubLabel = gitHubStatus.auth.username
      ? `GitHub: @${gitHubStatus.auth.username}`
      : "GitHub: Connected";
  }

  const showActivity = preferences.showActivity && activityItems.length > 0;
  const showSelection = preferences.showSelection && hasSelection;
  const showCursor = preferences.showCursor;
  const showWordCount = preferences.showWordCount;
  const showCharCount = preferences.showCharCount;
  const showLeftSection =
    preferences.showBackendStatus ||
    preferences.showSaveStatus ||
    preferences.showGitHubStatus ||
    Boolean(showActivity);
  const showCenterSection =
    preferences.showNoteInfo ||
    preferences.showVaultInfo ||
    (preferences.showStatusMessage && Boolean(messageText));
  const showRightSection =
    showSelection || showCursor || showWordCount || showCharCount;

  const handleStatusClick = () => {
    navigate({ to: "/settings", search: { tab: "system" } });
  };

  const handleMessageClick = () => {
    navigate({ to: "/settings", search: { tab: "system" } });
  };

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <footer className="h-8 bg-muted/50 border-t border-border flex items-center justify-between px-4 text-xs text-muted-foreground shrink-0 gap-4">
          {/* Left section */}
          {showLeftSection && (
            <div className="flex items-center gap-4 shrink-0">
              {preferences.showBackendStatus && (
                <button
                  type="button"
                  onClick={handleStatusClick}
                  className="flex items-center space-x-2 hover:text-foreground transition-colors"
                >
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      statusColors[status] ?? statusColors.stopped
                    )}
                  />
                  <span>Backend: {statusLabels[status] ?? "Unknown"}</span>
                </button>
              )}

              {preferences.showSaveStatus && (
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      saveStatusColors[saveStatus]
                    )}
                  />
                  <span>{saveStatusLabels[saveStatus]}</span>
                </div>
              )}

              {preferences.showGitHubStatus && (
                <button
                  type="button"
                  onClick={() => navigate({ to: "/integrations/github" })}
                  className="flex items-center gap-2 hover:text-foreground transition-colors"
                  title={gitHubTitle || undefined}
                >
                  <div
                    className={cn(
                      "w-2 h-2 rounded-full",
                      gitHubStatusColors[gitHubState]
                    )}
                  />
                  <span>{gitHubLabel}</span>
                </button>
              )}

              {showActivity && (
                <div
                  className="flex items-center gap-2"
                  title={activityItems.join(", ")}
                >
                  <Loader2 className="size-3 animate-spin" />
                  <span>{activityLabel ?? "Working..."}</span>
                </div>
              )}
            </div>
          )}

          {/* Center section */}
          {showCenterSection && (
            <div className="flex items-center gap-3 min-w-0 flex-1">
              {preferences.showStatusMessage && messageText && (
                <button
                  type="button"
                  onClick={handleMessageClick}
                  className={cn(
                    "flex items-center gap-1 min-w-0 hover:text-foreground transition-colors",
                    messageToneClasses[messageTone] ?? "text-muted-foreground"
                  )}
                  title={messageText}
                >
                  <span className="truncate max-w-[360px]">{messageText}</span>
                </button>
              )}

              {preferences.showNoteInfo && (
                <button
                  type="button"
                  onClick={() => navigate({ to: "/notes" })}
                  className="flex items-center gap-1 min-w-0 hover:text-foreground transition-colors"
                  title={notePath ?? "No note open"}
                >
                  <span className="text-muted-foreground">Note:</span>
                  <span className="truncate max-w-[280px]">{noteName}</span>
                  {noteDirectory && (
                    <span className="hidden lg:inline text-muted-foreground truncate max-w-[240px]">
                      ({noteDirectory})
                    </span>
                  )}
                </button>
              )}

              {preferences.showVaultInfo && (
                <button
                  type="button"
                  onClick={() => navigate({ to: "/notes" })}
                  className="hidden md:flex items-center gap-1 min-w-0 hover:text-foreground transition-colors"
                  title={vaultPath ?? "No vault selected"}
                >
                  <span className="text-muted-foreground">Vault:</span>
                  <span className="truncate max-w-[200px]">{vaultName}</span>
                </button>
              )}
            </div>
          )}

          {/* Right section */}
          {showRightSection && (
            <div className="flex items-center gap-4 shrink-0">
              {showSelection && (
                <span className="font-mono">Sel {selectionLength}</span>
              )}
              {showCursor && (
                <span className="font-mono">
                  Ln {cursorLine}, Col {cursorColumn}
                </span>
              )}
              {showWordCount && (
                <span className="hidden md:inline font-mono">
                  {wordCount} words
                </span>
              )}
              {showCharCount && (
                <span className="hidden md:inline font-mono">
                  {charCount} chars
                </span>
              )}
            </div>
          )}
        </footer>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>Left Section</ContextMenuLabel>
        <ContextMenuCheckboxItem
          checked={preferences.showBackendStatus}
          onCheckedChange={(checked) =>
            setPreference("showBackendStatus", Boolean(checked))
          }
        >
          Backend status
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={preferences.showSaveStatus}
          onCheckedChange={(checked) =>
            setPreference("showSaveStatus", Boolean(checked))
          }
        >
          Save status
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={preferences.showGitHubStatus}
          onCheckedChange={(checked) =>
            setPreference("showGitHubStatus", Boolean(checked))
          }
        >
          GitHub status
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={preferences.showActivity}
          onCheckedChange={(checked) =>
            setPreference("showActivity", Boolean(checked))
          }
        >
          Activity indicator
        </ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuLabel>Center Section</ContextMenuLabel>
        <ContextMenuCheckboxItem
          checked={preferences.showStatusMessage}
          onCheckedChange={(checked) =>
            setPreference("showStatusMessage", Boolean(checked))
          }
        >
          Status message
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={preferences.showNoteInfo}
          onCheckedChange={(checked) =>
            setPreference("showNoteInfo", Boolean(checked))
          }
        >
          Note info
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={preferences.showVaultInfo}
          onCheckedChange={(checked) =>
            setPreference("showVaultInfo", Boolean(checked))
          }
        >
          Vault info
        </ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuLabel>Right Section</ContextMenuLabel>
        <ContextMenuCheckboxItem
          checked={preferences.showSelection}
          onCheckedChange={(checked) =>
            setPreference("showSelection", Boolean(checked))
          }
        >
          Selection length
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={preferences.showCursor}
          onCheckedChange={(checked) =>
            setPreference("showCursor", Boolean(checked))
          }
        >
          Cursor position
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={preferences.showWordCount}
          onCheckedChange={(checked) =>
            setPreference("showWordCount", Boolean(checked))
          }
        >
          Word count
        </ContextMenuCheckboxItem>
        <ContextMenuCheckboxItem
          checked={preferences.showCharCount}
          onCheckedChange={(checked) =>
            setPreference("showCharCount", Boolean(checked))
          }
        >
          Character count
        </ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={resetPreferences}>
          Reset to defaults
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}
