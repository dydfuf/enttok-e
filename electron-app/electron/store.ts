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

export interface StatusBarPreferences {
  showBackendStatus: boolean;
  showSaveStatus: boolean;
  showGitHubStatus: boolean;
  showActivity: boolean;
  showStatusMessage: boolean;
  showNoteInfo: boolean;
  showVaultInfo: boolean;
  showSelection: boolean;
  showCursor: boolean;
  showWordCount: boolean;
  showCharCount: boolean;
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
  claudeProjectPaths: string[];
  claudeProjectPath?: string | null;
  summarizePrompt: string;
  statusBarPreferences: StatusBarPreferences;
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

const DEFAULT_SUMMARIZE_PROMPT = `오늘 한 일을 요약해줘.

## 링크 규칙
- Jira, Confluence(Wiki) 항목: 반드시 마크다운 링크로 작성 (예: [제목](URL))
- GitHub PR (본인이 생성한 것): 마크다운 링크로 작성
- GitHub 커밋, 리뷰: 링크 없이 텍스트로만 작성
- Claude 세션: 링크 없이 텍스트로만 작성

## 출력 형식
- 간결하고 명확하게 작성
- 주요 작업을 카테고리별로 그룹핑
- 각 항목은 불릿 포인트로 작성`;

const DEFAULT_STATUS_BAR_PREFERENCES: StatusBarPreferences = {
  showBackendStatus: true,
  showSaveStatus: true,
  showGitHubStatus: true,
  showActivity: true,
  showStatusMessage: true,
  showNoteInfo: true,
  showVaultInfo: true,
  showSelection: true,
  showCursor: true,
  showWordCount: true,
  showCharCount: true,
};

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
    claudeProjectPaths: [],
    claudeProjectPath: null,
    summarizePrompt: DEFAULT_SUMMARIZE_PROMPT,
    statusBarPreferences: DEFAULT_STATUS_BAR_PREFERENCES,
  },
});

function normalizeStatusBarPreferences(
  value: StatusBarPreferences | null | undefined
): StatusBarPreferences {
  return { ...DEFAULT_STATUS_BAR_PREFERENCES, ...(value ?? {}) };
}

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

function normalizeClaudeProjectPaths(paths: string[]): string[] {
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

export function getClaudeProjectPaths(): string[] {
  const stored = store.get("claudeProjectPaths");
  if (stored && stored.length > 0) {
    return normalizeClaudeProjectPaths(stored);
  }
  const legacy = store.get("claudeProjectPath");
  if (legacy) {
    const normalized = normalizeClaudeProjectPaths([legacy]);
    store.set("claudeProjectPaths", normalized);
    return normalized;
  }
  return [];
}

export function setClaudeProjectPaths(paths: string[]): void {
  const normalized = normalizeClaudeProjectPaths(paths);
  store.set("claudeProjectPaths", normalized);
  store.set("claudeProjectPath", normalized.length === 1 ? normalized[0] : null);
}

export function getSummarizePrompt(): string {
  return store.get("summarizePrompt");
}

export function setSummarizePrompt(prompt: string): void {
  store.set("summarizePrompt", prompt);
}

export function resetSummarizePrompt(): void {
  store.set("summarizePrompt", DEFAULT_SUMMARIZE_PROMPT);
}

export function getStatusBarPreferences(): StatusBarPreferences {
  const stored = store.get("statusBarPreferences");
  return normalizeStatusBarPreferences(stored);
}

export function setStatusBarPreferences(
  preferences: StatusBarPreferences
): void {
  store.set("statusBarPreferences", normalizeStatusBarPreferences(preferences));
}

export function resetStatusBarPreferences(): StatusBarPreferences {
  store.set("statusBarPreferences", DEFAULT_STATUS_BAR_PREFERENCES);
  return DEFAULT_STATUS_BAR_PREFERENCES;
}

export { DEFAULT_SUMMARIZE_PROMPT };
