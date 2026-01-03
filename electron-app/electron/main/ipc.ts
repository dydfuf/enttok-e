import { ipcMain } from "electron";
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
  getAssetsFolder,
  setAssetsFolder,
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
  ipcMain.handle("store:get-assets-folder", () => getAssetsFolder());
  ipcMain.handle("store:set-assets-folder", (_, folder: string) => {
    setAssetsFolder(folder);
    return { success: true };
  });

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
}
