import { contextBridge, ipcRenderer } from "electron";
import type {
  BackendLog,
  BackendState,
  ElectronAPI,
  RuntimeStatus,
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

  // Vault/Notes API
  selectVaultFolder: () => ipcRenderer.invoke("vault:select-folder"),
  listNotes: (folderPath: string) =>
    ipcRenderer.invoke("vault:list-notes", folderPath),
  createNote: (folderPath: string, title: string) =>
    ipcRenderer.invoke("vault:create-note", folderPath, title),
  getNotePath: (folderPath: string, noteId: string) =>
    ipcRenderer.invoke("vault:get-note-path", folderPath, noteId),

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

  // Claude spawn API
  spawnClaude: (payload: Record<string, unknown>) =>
    ipcRenderer.invoke("claude:spawn", payload),
  createClaudeSession: () => ipcRenderer.invoke("claude:session"),
  getJob: (jobId: string) => ipcRenderer.invoke("backend:job", jobId),
};

contextBridge.exposeInMainWorld("electronAPI", api);
