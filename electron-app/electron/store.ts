import Store from "electron-store";
import path from "path";

export interface VaultInfo {
  path: string;
  name: string;
  lastOpened: string;
}

interface StoreSchema {
  currentVaultPath: string | null;
  recentVaults: VaultInfo[];
  maxRecentVaults: number;
  dailyCalendarCollapsed: boolean;
  assetsFolder: string;
}

const store = new Store<StoreSchema>({
  name: "enttok-config",
  defaults: {
    currentVaultPath: null,
    recentVaults: [],
    maxRecentVaults: 10,
    dailyCalendarCollapsed: true,
    assetsFolder: "assets",
  },
});

export function getCurrentVaultPath(): string | null {
  return store.get("currentVaultPath");
}

export function setCurrentVaultPath(vaultPath: string): void {
  store.set("currentVaultPath", vaultPath);
  addToRecentVaults(vaultPath);
}

export function clearCurrentVaultPath(): void {
  store.set("currentVaultPath", null);
}

export function getRecentVaults(): VaultInfo[] {
  return store.get("recentVaults");
}

export function addToRecentVaults(vaultPath: string): void {
  const name = path.basename(vaultPath) || vaultPath;
  const recentVaults = store.get("recentVaults");
  const maxRecent = store.get("maxRecentVaults");

  const filtered = recentVaults.filter((v) => v.path !== vaultPath);

  const updated: VaultInfo[] = [
    { path: vaultPath, name, lastOpened: new Date().toISOString() },
    ...filtered,
  ].slice(0, maxRecent);

  store.set("recentVaults", updated);
}

export function removeFromRecentVaults(vaultPath: string): void {
  const recentVaults = store.get("recentVaults");
  const filtered = recentVaults.filter((v) => v.path !== vaultPath);
  store.set("recentVaults", filtered);
}

export function getDailyCalendarCollapsed(): boolean {
  return store.get("dailyCalendarCollapsed");
}

export function setDailyCalendarCollapsed(collapsed: boolean): void {
  store.set("dailyCalendarCollapsed", collapsed);
}

export function getAssetsFolder(): string {
  return store.get("assetsFolder");
}

export function setAssetsFolder(folder: string): void {
  store.set("assetsFolder", folder);
}

export function hasVault(): boolean {
  return store.get("currentVaultPath") !== null;
}
