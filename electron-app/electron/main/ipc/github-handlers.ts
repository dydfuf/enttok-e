import { ipcMain } from "electron";
import { showSelectFolderDialog } from "../../file-handlers.js";
import {
  getGitHubRepoPaths,
  setGitHubRepoPaths,
} from "../../store.js";
import {
  getGitHubStatus,
  getGitHubDailySummary,
} from "../github.js";

export function registerGitHubHandlers() {
  ipcMain.handle("github:get-repo-paths", () => getGitHubRepoPaths());
  ipcMain.handle("github:set-repo-paths", (_event, paths: string[]) => {
    setGitHubRepoPaths(paths);
    return { success: true };
  });
  ipcMain.handle("github:select-repo", () => showSelectFolderDialog());

  ipcMain.handle("github:status", () => getGitHubStatus());
  ipcMain.handle("github:daily-summary", (_event, date?: string) =>
    getGitHubDailySummary(date)
  );
}
