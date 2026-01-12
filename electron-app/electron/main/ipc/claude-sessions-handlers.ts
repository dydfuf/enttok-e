import { ipcMain } from "electron";
import {
  getClaudeProjectPaths,
  setClaudeProjectPaths,
} from "../../store.js";
import {
  listClaudeProjects,
  listClaudeSessions,
  getClaudeSessionDetail,
  getClaudeSessionsForDate,
} from "../claude-sessions.js";

export function registerClaudeSessionsHandlers() {
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
