import { ipcMain, shell } from "electron";
import {
  readFile,
  writeFile,
  writeBinaryFile,
  showOpenDialog,
  showSaveDialog,
  showSelectFolderDialog,
  listMarkdownFiles,
  createNote,
  getNotePath,
  getDailyNotePath,
  createDailyNote,
  listDailyNoteDates,
} from "../file-handlers.js";
import {
  getCurrentVaultPath,
  setCurrentVaultPath,
  clearCurrentVaultPath,
  getRecentVaults,
  removeFromRecentVaults,
  getDailyCalendarCollapsed,
  setDailyCalendarCollapsed,
  getDailyNotesFolder,
  setDailyNotesFolder,
  getDailyNoteTemplate,
  setDailyNoteTemplate,
  getAssetsFolder,
  setAssetsFolder,
  getGitHubRepoPaths,
  setGitHubRepoPaths,
  getWorkTimeNotifications,
  setWorkTimeNotifications,
  getClaudeProjectPaths,
  setClaudeProjectPaths,
  type WorkTimeNotificationSettings,
} from "../store.js";
import {
  getBackendState,
  healthCheck,
  requestBackendJson,
  startBackend,
  stopBackend,
} from "./backend.js";
import { getRuntimeStatus, refreshRuntimeStatus } from "./runtime.js";
import {
  getGitHubStatus,
  getGitHubDailySummary,
} from "./github.js";
import {
  initializeNotificationScheduler,
  sendTestNotification,
} from "./notifications.js";
import {
  listClaudeProjects,
  listClaudeSessions,
  getClaudeSessionDetail,
  getClaudeSessionsForDate,
} from "./claude-sessions.js";

export function registerIpcHandlers() {
  // IPC Handlers for file operations
  ipcMain.handle("file:read", (_, filePath: string) => readFile(filePath));
  ipcMain.handle("file:write", (_, filePath: string, content: string) =>
    writeFile(filePath, content)
  );
  ipcMain.handle("file:write-binary", (_, filePath: string, base64: string) =>
    writeBinaryFile(filePath, base64)
  );
  ipcMain.handle("file:open-dialog", () => showOpenDialog());
  ipcMain.handle("file:save-dialog", (_, defaultPath?: string) =>
    showSaveDialog(defaultPath)
  );
  ipcMain.handle("system:open-external", async (_event, url: string) => {
    if (!url) {
      return { success: false, error: "Missing URL" };
    }
    try {
      const parsed = new URL(url);
      const allowedProtocols = new Set(["http:", "https:", "mailto:"]);
      if (!allowedProtocols.has(parsed.protocol)) {
        return { success: false, error: "Unsupported URL protocol" };
      }
      await shell.openExternal(url);
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to open link",
      };
    }
  });

  // IPC Handlers for vault/notes operations
  ipcMain.handle("vault:select-folder", () => showSelectFolderDialog());
  ipcMain.handle("vault:list-notes", (_, folderPath: string) =>
    listMarkdownFiles(folderPath)
  );
  ipcMain.handle("vault:create-note", (_, folderPath: string, title: string) =>
    createNote(folderPath, title)
  );
  ipcMain.handle("vault:get-note-path", (_, folderPath: string, noteId: string) =>
    getNotePath(folderPath, noteId)
  );

  // IPC Handlers for daily notes
  ipcMain.handle("daily:get-path", (_, vaultPath: string, date: string) =>
    getDailyNotePath(vaultPath, date)
  );
  ipcMain.handle("daily:create", (_, vaultPath: string, date: string) =>
    createDailyNote(vaultPath, date)
  );
  ipcMain.handle("daily:list-dates", (_, vaultPath: string) =>
    listDailyNoteDates(vaultPath)
  );

  // IPC Handlers for vault store
  ipcMain.handle("store:get-current-vault", () => getCurrentVaultPath());
  ipcMain.handle("store:set-current-vault", (_, vaultPath: string) => {
    setCurrentVaultPath(vaultPath);
    return { success: true };
  });
  ipcMain.handle("store:clear-current-vault", () => {
    clearCurrentVaultPath();
    return { success: true };
  });
  ipcMain.handle("store:get-recent-vaults", () => getRecentVaults());
  ipcMain.handle("store:remove-recent-vault", (_, vaultPath: string) => {
    removeFromRecentVaults(vaultPath);
    return { success: true };
  });
  ipcMain.handle("store:get-daily-calendar-collapsed", () =>
    getDailyCalendarCollapsed()
  );
  ipcMain.handle("store:set-daily-calendar-collapsed", (_, collapsed: boolean) => {
    setDailyCalendarCollapsed(collapsed);
    return { success: true };
  });
  ipcMain.handle("store:get-daily-notes-folder", () => getDailyNotesFolder());
  ipcMain.handle("store:set-daily-notes-folder", (_, folder: string) => {
    setDailyNotesFolder(folder);
    return { success: true };
  });
  ipcMain.handle("store:get-daily-note-template", () =>
    getDailyNoteTemplate()
  );
  ipcMain.handle("store:set-daily-note-template", (_, template: string) => {
    setDailyNoteTemplate(template);
    return { success: true };
  });
  ipcMain.handle("store:get-assets-folder", () => getAssetsFolder());
  ipcMain.handle("store:set-assets-folder", (_, folder: string) => {
    setAssetsFolder(folder);
    return { success: true };
  });

  ipcMain.handle("github:get-repo-paths", () => getGitHubRepoPaths());
  ipcMain.handle("github:set-repo-paths", (_event, paths: string[]) => {
    setGitHubRepoPaths(paths);
    return { success: true };
  });
  ipcMain.handle("github:select-repo", () => showSelectFolderDialog());

  // IPC Handlers for backend operations
  ipcMain.handle("backend:start", () => startBackend());
  ipcMain.handle("backend:stop", () => stopBackend());
  ipcMain.handle("backend:status", () => getBackendState());
  ipcMain.handle("backend:health", () => healthCheck());

  // IPC Handlers for runtime dependency checks
  ipcMain.handle("runtime:check", () => refreshRuntimeStatus());
  ipcMain.handle("runtime:status", () => getRuntimeStatus());

  // IPC Handlers for Claude jobs
  ipcMain.handle(
    "claude:spawn",
    async (_event, payload: Record<string, unknown>) =>
      requestBackendJson("POST", "/claude/spawn", payload)
  );
  ipcMain.handle("backend:job", async (_event, jobId: string) =>
    requestBackendJson("GET", `/jobs/${jobId}`)
  );
  ipcMain.handle("claude:session", async () =>
    requestBackendJson("POST", "/claude/session")
  );

  ipcMain.handle("github:status", () => getGitHubStatus());
  ipcMain.handle("github:daily-summary", (_event, date?: string) =>
    getGitHubDailySummary(date)
  );

  // IPC Handlers for work time notifications
  ipcMain.handle("notifications:get-settings", () => getWorkTimeNotifications());
  ipcMain.handle(
    "notifications:set-settings",
    (_event, settings: unknown) => {
      // Validate input from renderer
      if (!settings || typeof settings !== "object") {
        return { success: false, error: "Invalid settings format" };
      }
      const s = settings as Record<string, unknown>;
      if (typeof s.enabled !== "boolean") {
        return { success: false, error: "Invalid enabled field" };
      }
      if (s.workStartTime !== null && typeof s.workStartTime !== "string") {
        return { success: false, error: "Invalid workStartTime field" };
      }
      if (s.workEndTime !== null && typeof s.workEndTime !== "string") {
        return { success: false, error: "Invalid workEndTime field" };
      }
      if (typeof s.workStartMessage !== "string") {
        return { success: false, error: "Invalid workStartMessage field" };
      }
      if (typeof s.workEndMessage !== "string") {
        return { success: false, error: "Invalid workEndMessage field" };
      }
      // Validate time format if provided
      const timeRegex = /^\d{2}:\d{2}$/;
      if (s.workStartTime && !timeRegex.test(s.workStartTime as string)) {
        return { success: false, error: "Invalid workStartTime format" };
      }
      if (s.workEndTime && !timeRegex.test(s.workEndTime as string)) {
        return { success: false, error: "Invalid workEndTime format" };
      }

      setWorkTimeNotifications(s as unknown as WorkTimeNotificationSettings);
      initializeNotificationScheduler();
      return { success: true };
    }
  );
  ipcMain.handle("notifications:test", () => {
    sendTestNotification();
    return { success: true };
  });

  // IPC Handlers for Claude Code sessions
  ipcMain.handle("claude-sessions:list-projects", () => listClaudeProjects());
  ipcMain.handle("claude-sessions:list", (_event, projectPath: string) =>
    listClaudeSessions(projectPath)
  );
  ipcMain.handle("claude-sessions:detail", (_event, sessionFilePath: string) =>
    getClaudeSessionDetail(sessionFilePath)
  );
  ipcMain.handle(
    "claude-sessions:for-date",
    (_event, projectPath: string, date: string) =>
      getClaudeSessionsForDate(projectPath, date)
  );
  ipcMain.handle("claude-sessions:get-project-paths", () =>
    getClaudeProjectPaths()
  );
  ipcMain.handle(
    "claude-sessions:set-project-paths",
    (_event, projectPaths: string[]) => {
      setClaudeProjectPaths(projectPaths);
      return { success: true };
    }
  );
}
