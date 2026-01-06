import Store from "electron-store";
import path from "path";

export interface VaultInfo {
  path: string;
  name: string;
  lastOpened: string;
}

export interface WorkTimeNotificationSettings {
  enabled: boolean;
  workStartTime: string | null;
  workEndTime: string | null;
  workStartMessage: string;
  workEndMessage: string;
}

interface StoreSchema {
  currentVaultPath: string | null;
  recentVaults: VaultInfo[];
  maxRecentVaults: number;
  dailyCalendarCollapsed: boolean;
  dailyNotesFolder: string;
  dailyNoteTemplate: string;
  assetsFolder: string;
  gitHubRepoPaths: string[];
  workTimeNotifications: WorkTimeNotificationSettings;
}

const DEFAULT_DAILY_NOTE_TEMPLATE = `---
date: {{date}}
tags: [daily]
---

# {{date}}

## Today's Tasks

-

## Tomorrow's Plan

-

## Notes
`;

const store = new Store<StoreSchema>({
  name: "enttok-config",
  defaults: {
    currentVaultPath: null,
    recentVaults: [],
    maxRecentVaults: 10,
    dailyCalendarCollapsed: true,
    dailyNotesFolder: "daily",
    dailyNoteTemplate: DEFAULT_DAILY_NOTE_TEMPLATE,
    assetsFolder: "assets",
    gitHubRepoPaths: [],
    workTimeNotifications: {
      enabled: false,
      workStartTime: null,
      workEndTime: null,
      workStartMessage: "출근 시간입니다! 오늘의 업무를 정리해보세요.",
      workEndMessage: "퇴근 시간입니다! 오늘 하루를 마무리해보세요.",
    },
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

export function getDailyNotesFolder(): string {
  return store.get("dailyNotesFolder");
}

export function setDailyNotesFolder(folder: string): void {
  store.set("dailyNotesFolder", folder);
}

export function getDailyNoteTemplate(): string {
  return store.get("dailyNoteTemplate");
}

export function setDailyNoteTemplate(template: string): void {
  store.set("dailyNoteTemplate", template);
}

export function getAssetsFolder(): string {
  return store.get("assetsFolder");
}

export function setAssetsFolder(folder: string): void {
  store.set("assetsFolder", folder);
}

function normalizeRepoPaths(paths: string[]): string[] {
  const unique = new Set<string>();
  for (const value of paths) {
    if (!value) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    const normalized = path.normalize(trimmed);
    if (unique.has(normalized)) continue;
    unique.add(normalized);
  }
  return Array.from(unique);
}

export function getGitHubRepoPaths(): string[] {
  return store.get("gitHubRepoPaths");
}

export function setGitHubRepoPaths(paths: string[]): void {
  store.set("gitHubRepoPaths", normalizeRepoPaths(paths));
}

export function hasVault(): boolean {
  return store.get("currentVaultPath") !== null;
}

export function getWorkTimeNotifications(): WorkTimeNotificationSettings {
  return store.get("workTimeNotifications");
}

export function setWorkTimeNotifications(
  settings: WorkTimeNotificationSettings
): void {
  store.set("workTimeNotifications", settings);
}
