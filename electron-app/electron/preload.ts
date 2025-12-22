import { contextBridge, ipcRenderer } from "electron";

// Electron API를 렌더러 프로세스에 노출
contextBridge.exposeInMainWorld("electronAPI", {
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
});
