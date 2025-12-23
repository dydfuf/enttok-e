/// <reference types="vite/client" />

import type { ElectronAPI } from "./src/shared/electron-api";

declare global {
  interface Window {
    electronAPI: ElectronAPI;
  }
}

export {};
