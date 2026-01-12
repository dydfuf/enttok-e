import { contextBridge, ipcRenderer } from "electron";
import type {
  BackendLog,
  BackendState,
  ClaudeSession,
  ClaudeSessionDetailResult,
  ClaudeSessionListResult,
  ElectronAPI,
  GitHubDailySummary,
  GitHubStatus,
  RuntimeStatus,
  WorkTimeNotificationSettings,
  McpState,
  McpConnectionInfo,
  MemoryStats,
  MemorySearchResult,
  ObservationSummary,
  StatusBarPreferences,
} from "../src/shared/electron-api";

// Electron API를 렌더러 프로세스에 노출
const api: ElectronAPI = {
  // 기존 IPC 통신
  send: (channel: string, data: unknown) => {
    ipcRenderer.send(channel, data);
  },
  receive: (channel: string, func: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_, ...args) => func(...args));
  },

  // 파일 시스템 API
  readFile: (filePath: string) => ipcRenderer.invoke("file:read", filePath),
  writeFile: (filePath: string, content: string) =>
    ipcRenderer.invoke("file:write", filePath, content),
  writeBinaryFile: (filePath: string, base64: string) =>
    ipcRenderer.invoke("file:write-binary", filePath, base64),
  openFileDialog: () => ipcRenderer.invoke("file:open-dialog"),
  saveFileDialog: (defaultPath?: string) =>
    ipcRenderer.invoke("file:save-dialog", defaultPath),
  openExternal: (url: string) => ipcRenderer.invoke("system:open-external", url),

  // Vault/Notes API
  selectVaultFolder: () => ipcRenderer.invoke("vault:select-folder"),
  listNotes: (folderPath: string) =>
    ipcRenderer.invoke("vault:list-notes", folderPath),
  createNote: (folderPath: string, title: string) =>
    ipcRenderer.invoke("vault:create-note", folderPath, title),
  getNotePath: (folderPath: string, noteId: string) =>
    ipcRenderer.invoke("vault:get-note-path", folderPath, noteId),
  searchNotes: (payload: { vaultPath: string; query: string; limit?: number }) =>
    ipcRenderer.invoke("vault:search-notes", payload),

  // Daily Notes API
  getDailyNotePath: (vaultPath: string, date: string) =>
    ipcRenderer.invoke("daily:get-path", vaultPath, date),
  createDailyNote: (vaultPath: string, date: string) =>
    ipcRenderer.invoke("daily:create", vaultPath, date),
  listDailyNoteDates: (vaultPath: string) =>
    ipcRenderer.invoke("daily:list-dates", vaultPath),

  // Vault Store API
  getCurrentVault: () => ipcRenderer.invoke("store:get-current-vault"),
  setCurrentVault: (vaultPath: string) =>
    ipcRenderer.invoke("store:set-current-vault", vaultPath),
  clearCurrentVault: () => ipcRenderer.invoke("store:clear-current-vault"),
  getRecentVaults: () => ipcRenderer.invoke("store:get-recent-vaults"),
  removeRecentVault: (vaultPath: string) =>
    ipcRenderer.invoke("store:remove-recent-vault", vaultPath),
  getDailyCalendarCollapsed: () =>
    ipcRenderer.invoke("store:get-daily-calendar-collapsed"),
  setDailyCalendarCollapsed: (collapsed: boolean) =>
    ipcRenderer.invoke("store:set-daily-calendar-collapsed", collapsed),
  getAssistantSidebarWidth: () =>
    ipcRenderer.invoke("store:get-assistant-sidebar-width"),
  setAssistantSidebarWidth: (width: number) =>
    ipcRenderer.invoke("store:set-assistant-sidebar-width", width),
  getAssistantSidebarOpen: () =>
    ipcRenderer.invoke("store:get-assistant-sidebar-open"),
  setAssistantSidebarOpen: (open: boolean) =>
    ipcRenderer.invoke("store:set-assistant-sidebar-open", open),
  getDailyNotesFolder: () => ipcRenderer.invoke("store:get-daily-notes-folder"),
  setDailyNotesFolder: (folder: string) =>
    ipcRenderer.invoke("store:set-daily-notes-folder", folder),
  getDailyNoteTemplate: () =>
    ipcRenderer.invoke("store:get-daily-note-template"),
  setDailyNoteTemplate: (template: string) =>
    ipcRenderer.invoke("store:set-daily-note-template", template),
  getAssetsFolder: () => ipcRenderer.invoke("store:get-assets-folder"),
  setAssetsFolder: (folder: string) =>
    ipcRenderer.invoke("store:set-assets-folder", folder),
  getSummarizePrompt: () =>
    ipcRenderer.invoke("store:get-summarize-prompt") as Promise<string>,
  setSummarizePrompt: (prompt: string) =>
    ipcRenderer.invoke("store:set-summarize-prompt", prompt) as Promise<{ success: boolean }>,
  resetSummarizePrompt: () =>
    ipcRenderer.invoke("store:reset-summarize-prompt") as Promise<{ success: boolean; prompt: string }>,
  getStatusBarPreferences: () =>
    ipcRenderer.invoke("store:get-status-bar-preferences"),
  setStatusBarPreferences: (preferences: StatusBarPreferences) =>
    ipcRenderer.invoke("store:set-status-bar-preferences", preferences),
  resetStatusBarPreferences: () =>
    ipcRenderer.invoke("store:reset-status-bar-preferences"),

  // Backend API
  startBackend: () => ipcRenderer.invoke("backend:start"),
  stopBackend: () => ipcRenderer.invoke("backend:stop"),
  getBackendStatus: () => ipcRenderer.invoke("backend:status"),
  checkBackendHealth: () => ipcRenderer.invoke("backend:health"),
  onBackendLog: (handler: (payload: BackendLog) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: BackendLog) =>
      handler(payload);
    ipcRenderer.on("backend:log", listener);
    return () => {
      ipcRenderer.removeListener("backend:log", listener);
    };
  },
  onBackendStatus: (handler: (payload: BackendState) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: BackendState) =>
      handler(payload);
    ipcRenderer.on("backend:status", listener);
    return () => {
      ipcRenderer.removeListener("backend:status", listener);
    };
  },

  // Runtime dependency checks
  checkRuntime: () => ipcRenderer.invoke("runtime:check"),
  getRuntimeStatus: () => ipcRenderer.invoke("runtime:status"),
  onRuntimeStatus: (handler: (payload: RuntimeStatus) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: RuntimeStatus) =>
      handler(payload);
    ipcRenderer.on("runtime:status", listener);
    return () => {
      ipcRenderer.removeListener("runtime:status", listener);
    };
  },

  spawnClaude: (payload: Record<string, unknown>) =>
    ipcRenderer.invoke("claude:spawn", payload),
  createClaudeSession: () => ipcRenderer.invoke("claude:session"),
  getJob: (jobId: string) => ipcRenderer.invoke("backend:job", jobId),

  getGitHubStatus: () =>
    ipcRenderer.invoke("github:status") as Promise<GitHubStatus>,
  getGitHubDailySummary: (date?: string) =>
    ipcRenderer.invoke("github:daily-summary", date) as Promise<GitHubDailySummary>,
  getGitHubRepoPaths: () => ipcRenderer.invoke("github:get-repo-paths"),
  setGitHubRepoPaths: (paths: string[]) =>
    ipcRenderer.invoke("github:set-repo-paths", paths),
  selectGitHubRepoFolder: () => ipcRenderer.invoke("github:select-repo"),

  // Work Time Notifications API
  getWorkTimeNotifications: () =>
    ipcRenderer.invoke(
      "notifications:get-settings"
    ) as Promise<WorkTimeNotificationSettings>,
  setWorkTimeNotifications: (settings: WorkTimeNotificationSettings) =>
    ipcRenderer.invoke("notifications:set-settings", settings),
  testNotification: () => ipcRenderer.invoke("notifications:test"),

  // Claude Code Sessions API
  listClaudeProjects: () =>
    ipcRenderer.invoke("claude-sessions:list-projects") as Promise<string[]>,
  listClaudeSessions: (projectPath: string) =>
    ipcRenderer.invoke(
      "claude-sessions:list",
      projectPath
    ) as Promise<ClaudeSessionListResult>,
  getClaudeSessionDetail: (sessionFilePath: string) =>
    ipcRenderer.invoke(
      "claude-sessions:detail",
      sessionFilePath
    ) as Promise<ClaudeSessionDetailResult>,
  getClaudeSessionsForDate: (projectPath: string, date: string) =>
    ipcRenderer.invoke(
      "claude-sessions:for-date",
      projectPath,
      date
    ) as Promise<ClaudeSession[]>,
  getClaudeProjectPaths: () =>
    ipcRenderer.invoke("claude-sessions:get-project-paths") as Promise<
      string[]
    >,
  setClaudeProjectPaths: (projectPaths: string[]) =>
    ipcRenderer.invoke("claude-sessions:set-project-paths", projectPaths),

  // MCP Server API
  startMcp: () => ipcRenderer.invoke("mcp:start") as Promise<McpState>,
  stopMcp: () => ipcRenderer.invoke("mcp:stop") as Promise<McpState>,
  getMcpStatus: () => ipcRenderer.invoke("mcp:status") as Promise<McpState>,
  getMcpConnectionInfo: () =>
    ipcRenderer.invoke("mcp:connection-info") as Promise<McpConnectionInfo>,
  onMcpStatus: (handler: (payload: McpState) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: McpState) =>
      handler(payload);
    ipcRenderer.on("mcp:status", listener);
    return () => {
      ipcRenderer.removeListener("mcp:status", listener);
    };
  },
  onMcpLog: (handler: (payload: BackendLog) => void) => {
    const listener = (_: Electron.IpcRendererEvent, payload: BackendLog) =>
      handler(payload);
    ipcRenderer.on("mcp:log", listener);
    return () => {
      ipcRenderer.removeListener("mcp:log", listener);
    };
  },

  // Memory System API
  getMemoryStats: () =>
    ipcRenderer.invoke("memory:stats") as Promise<MemoryStats>,
  searchMemory: (payload: { query: string; limit?: number; type?: string }) =>
    ipcRenderer.invoke("memory:search", payload) as Promise<MemorySearchResult>,
  getObservations: (params?: { days_back?: number }) =>
    ipcRenderer.invoke("memory:observations", params) as Promise<
      ObservationSummary[]
    >,
  triggerMemorySync: () => ipcRenderer.invoke("memory:sync-trigger"),
  triggerChromaSync: () => ipcRenderer.invoke("memory:chroma-sync"),
  syncGitHubToMemory: (payload: {
    prs: { authored: unknown[]; reviewed: unknown[] };
    commits: unknown[];
  }) => ipcRenderer.invoke("memory:sync-github", payload),
  syncClaudeSessionsToMemory: (payload: { sessions: unknown[] }) =>
    ipcRenderer.invoke("memory:sync-claude-sessions", payload),
};

contextBridge.exposeInMainWorld("electronAPI", api);
