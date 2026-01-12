import { ipcMain } from "electron";
import type { StatusBarPreferences } from "../../store.js";
import {
  getCurrentVaultPath,
  setCurrentVaultPath,
  clearCurrentVaultPath,
  getRecentVaults,
  removeFromRecentVaults,
  getDailyCalendarCollapsed,
  setDailyCalendarCollapsed,
  getAssistantSidebarWidth,
  setAssistantSidebarWidth,
  getAssistantSidebarOpen,
  setAssistantSidebarOpen,
  getDailyNotesFolder,
  setDailyNotesFolder,
  getDailyNoteTemplate,
  setDailyNoteTemplate,
  getAssetsFolder,
  setAssetsFolder,
  getSummarizePrompt,
  setSummarizePrompt,
  resetSummarizePrompt,
  getStatusBarPreferences,
  setStatusBarPreferences,
  resetStatusBarPreferences,
  DEFAULT_SUMMARIZE_PROMPT,
} from "../../store.js";

export function registerStoreHandlers() {
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
  ipcMain.handle("store:get-assistant-sidebar-width", () =>
    getAssistantSidebarWidth()
  );
  ipcMain.handle(
    "store:set-assistant-sidebar-width",
    (_, width: number) => {
      setAssistantSidebarWidth(width);
      return { success: true };
    }
  );
  ipcMain.handle("store:get-assistant-sidebar-open", () =>
    getAssistantSidebarOpen()
  );
  ipcMain.handle("store:set-assistant-sidebar-open", (_, open: boolean) => {
    setAssistantSidebarOpen(open);
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

  // Summarize prompt handlers
  ipcMain.handle("store:get-summarize-prompt", () => getSummarizePrompt());
  ipcMain.handle("store:set-summarize-prompt", (_, prompt: string) => {
    setSummarizePrompt(prompt);
    return { success: true };
  });
  ipcMain.handle("store:reset-summarize-prompt", () => {
    resetSummarizePrompt();
    return { success: true, prompt: DEFAULT_SUMMARIZE_PROMPT };
  });

  // Status bar preferences
  ipcMain.handle("store:get-status-bar-preferences", () =>
    getStatusBarPreferences()
  );
  ipcMain.handle(
    "store:set-status-bar-preferences",
    (_, preferences: StatusBarPreferences) => {
      setStatusBarPreferences(preferences);
      return { success: true };
    }
  );
  ipcMain.handle("store:reset-status-bar-preferences", () =>
    resetStatusBarPreferences()
  );
}
