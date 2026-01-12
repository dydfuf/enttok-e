import { registerFileHandlers } from "./file-handlers.js";
import { registerVaultHandlers } from "./vault-handlers.js";
import { registerStoreHandlers } from "./store-handlers.js";
import { registerGitHubHandlers } from "./github-handlers.js";
import { registerBackendHandlers } from "./backend-handlers.js";
import { registerNotificationsHandlers } from "./notifications-handlers.js";
import { registerClaudeSessionsHandlers } from "./claude-sessions-handlers.js";
import { registerMcpHandlers } from "./mcp-handlers.js";
import { registerMemoryHandlers } from "./memory-handlers.js";

export function registerIpcHandlers() {
  registerFileHandlers();
  registerVaultHandlers();
  registerStoreHandlers();
  registerGitHubHandlers();
  registerBackendHandlers();
  registerNotificationsHandlers();
  registerClaudeSessionsHandlers();
  registerMcpHandlers();
  registerMemoryHandlers();
}
