import { ipcMain } from "electron";
import {
  getBackendState,
  healthCheck,
  requestBackendJson,
  startBackend,
  stopBackend,
} from "../backend.js";
import { getRuntimeStatus, refreshRuntimeStatus } from "../runtime.js";

export function registerBackendHandlers() {
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
}
