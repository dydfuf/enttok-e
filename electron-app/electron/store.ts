import Store from "electron-store";

export interface VaultInfo {
  path: string;
  name: string;
  lastOpened: string;
}

interface StoreSchema {
  currentVaultPath: string | null;
  recentVaults: VaultInfo[];
  maxRecentVaults: number;
}

const store = new Store<StoreSchema>({
  name: "enttokk-config",
  defaults: {
    currentVaultPath: null,
    recentVaults: [],
    maxRecentVaults: 10,
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
  const name = vaultPath.split("/").pop() || vaultPath;
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

export function hasVault(): boolean {
  return store.get("currentVaultPath") !== null;
}
