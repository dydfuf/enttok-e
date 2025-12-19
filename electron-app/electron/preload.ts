import { contextBridge, ipcRenderer } from "electron";

// Electron API를 렌더러 프로세스에 노출
contextBridge.exposeInMainWorld("electronAPI", {
  // 예: IPC 통신
  send: (channel: string, data: any) => {
    ipcRenderer.send(channel, data);
  },
  receive: (channel: string, func: (...args: any[]) => void) => {
    ipcRenderer.on(channel, (_, ...args) => func(...args));
  },
});
