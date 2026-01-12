import { ipcMain } from "electron";
import { requestBackendJson } from "../backend.js";

export function registerMemoryHandlers() {
  // IPC Handlers for Memory API (via backend)
  ipcMain.handle("memory:stats", () =>
    requestBackendJson("GET", "/memory/stats")
  );
  ipcMain.handle(
    "memory:search",
    (_event, payload: { query: string; limit?: number; type?: string }) =>
      requestBackendJson("POST", "/memory/search", payload)
  );
  ipcMain.handle("memory:observations", (_event, params?: { days_back?: number }) => {
    const queryParams = params?.days_back ? `?days_back=${params.days_back}` : "";
    return requestBackendJson("GET", `/memory/observations${queryParams}`);
  });
  ipcMain.handle("memory:sync-trigger", () =>
    requestBackendJson("POST", "/memory/sync/process", { window_minutes: 60 })
  );
  ipcMain.handle("memory:chroma-sync", () =>
    requestBackendJson("POST", "/memory/sync/chroma")
  );

  // IPC Handlers for GitHub/Claude memory sync
  ipcMain.handle(
    "memory:sync-github",
    async (_event, payload: { prs: { authored: unknown[]; reviewed: unknown[] }; commits: unknown[] }) =>
      requestBackendJson("POST", "/memory/sync/github", payload)
  );
  ipcMain.handle(
    "memory:sync-claude-sessions",
    async (_event, payload: { sessions: unknown[] }) =>
      requestBackendJson("POST", "/memory/sync/claude-sessions", payload)
  );
}
