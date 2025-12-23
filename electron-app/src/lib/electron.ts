import type { ElectronAPI } from "@/shared/electron-api";

export function getElectronAPI(): ElectronAPI | null {
  if (typeof window === "undefined") {
    return null;
  }
  return (window as { electronAPI?: ElectronAPI }).electronAPI ?? null;
}

export function requireElectronAPI(): ElectronAPI {
  const api = getElectronAPI();
  if (!api) {
    throw new Error("electronAPI unavailable");
  }
  return api;
}
