import { ipcMain } from "electron";
import {
  getMcpState,
  getMcpConnectionInfo,
  startMcp,
  stopMcp,
} from "../mcp.js";

export function registerMcpHandlers() {
  // IPC Handlers for MCP server
  ipcMain.handle("mcp:start", () => startMcp());
  ipcMain.handle("mcp:stop", () => stopMcp());
  ipcMain.handle("mcp:status", () => getMcpState());
  ipcMain.handle("mcp:connection-info", () => getMcpConnectionInfo());
}
