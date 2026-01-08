export type FileResult = {
  success: boolean;
  data?: string;
  error?: string;
};

export type OpenDialogResult = {
  filePath: string;
  content: string;
};

export type SaveDialogResult = {
  success: boolean;
  filePath?: string;
  canceled?: boolean;
  error?: string;
};

export type OpenExternalResult = {
  success: boolean;
  error?: string;
};

export type SelectFolderResult = {
  success: boolean;
  folderPath?: string;
  canceled?: boolean;
};

export type VaultInfo = {
  path: string;
  name: string;
  lastOpened: string;
};

export type NoteInfo = {
  id: string;
  title: string;
  filePath: string;
  updatedAt: string;
};

export type ListNotesResult = {
  success: boolean;
  notes?: NoteInfo[];
  error?: string;
};

export type CreateNoteResult = {
  success: boolean;
  note?: NoteInfo;
  error?: string;
};

export type DailyNoteResult = {
  success: boolean;
  filePath?: string;
  error?: string;
};

export type DailyNoteDatesResult = {
  success: boolean;
  dates?: string[];
  error?: string;
};

export type BackendStatus = "stopped" | "starting" | "running" | "stopping" | "error";

export type BackendState = {
  status: BackendStatus;
  pid: number | null;
  port: number | null;
  token: string | null;
  startedAt: number | null;
  lastExitCode: number | null;
  lastSignal: string | null;
  lastError: string | null;
};

export type BackendLog = {
  level: "info" | "warn" | "error";
  message: string;
  timestamp: string;
};

export type BackendHealth = {
  healthy: boolean;
};

export type RuntimeBinaryStatus = {
  found: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
};

export type RuntimeStatus = {
  node: RuntimeBinaryStatus;
  npx: RuntimeBinaryStatus;
  claude: RuntimeBinaryStatus;
  lastCheckedAt: string | null;
};

export type ClaudeJobResponse = {
  job_id: string;
  status: string;
};

export type ClaudeSessionResponse = {
  session_id: string;
};

export type ClaudeJobRecord = {
  job_id: string;
  status: string;
  created_at: string;
  updated_at: string;
  progress?: number | null;
  message?: string | null;
  payload?: Record<string, unknown>;
  result?: {
    stdout_tail?: string[];
    stderr_tail?: string[];
    exit_code?: number;
  } | null;
  error?: {
    message?: string;
    stdout_tail?: string[];
    stderr_tail?: string[];
    exit_code?: number;
  } | null;
};

export type GitHubCliStatus = {
  found: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
};

export type GitHubAuthStatus = {
  authenticated: boolean;
  username: string | null;
  hostname: string;
  error: string | null;
};

export type GitHubStatus = {
  cli: GitHubCliStatus;
  auth: GitHubAuthStatus;
};

export type GitHubPR = {
  number: number;
  title: string;
  url: string;
  state: string;
  repository: string;
  createdAt: string;
  updatedAt: string;
};

export type GitHubCommit = {
  sha: string;
  message: string;
  repository: string;
  url: string;
  createdAt: string;
};

export type GitHubDailySummary = {
  date: string;
  username: string | null;
  prs: {
    authored: GitHubPR[];
    reviewed: GitHubPR[];
  };
  commits: GitHubCommit[];
  stats: {
    totalPRsAuthored: number;
    totalPRsReviewed: number;
    totalCommits: number;
  };
};

export type WorkTimeNotificationSettings = {
  enabled: boolean;
  workStartTime: string | null; // "HH:mm"
  workEndTime: string | null; // "HH:mm"
  workStartMessage: string;
  workEndMessage: string;
};

// Claude Code Session Types
export type ClaudeSessionMessage = {
  type: "user" | "assistant" | "system" | "summary";
  timestamp?: string;
  sessionId?: string;
  gitBranch?: string;
  cwd?: string;
  summary?: string;
  message?: {
    role: string;
    content: string | Array<{ type: string; text?: string; thinking?: string }>;
  };
};

export type ClaudeSession = {
  id: string;
  summary: string;
  firstMessage: string;
  timestamp: string;
  messageCount: number;
  gitBranch: string;
  projectPath: string;
  filePath: string;
};

export type ClaudeSessionListResult = {
  success: boolean;
  sessions: ClaudeSession[];
  projectPath: string | null;
  error: string | null;
};

export type ClaudeSessionDetailResult = {
  success: boolean;
  session: ClaudeSession | null;
  messages: ClaudeSessionMessage[];
  error: string | null;
};

export type ElectronAPI = {
  send: (channel: string, data: unknown) => void;
  receive: (channel: string, func: (...args: unknown[]) => void) => void;
  readFile: (filePath: string) => Promise<FileResult>;
  writeFile: (filePath: string, content: string) => Promise<FileResult>;
  writeBinaryFile: (filePath: string, base64: string) => Promise<FileResult>;
  openFileDialog: () => Promise<OpenDialogResult | null>;
  saveFileDialog: (defaultPath?: string) => Promise<SaveDialogResult>;
  openExternal: (url: string) => Promise<OpenExternalResult>;
  selectVaultFolder: () => Promise<SelectFolderResult>;
  listNotes: (folderPath: string) => Promise<ListNotesResult>;
  createNote: (folderPath: string, title: string) => Promise<CreateNoteResult>;
  getNotePath: (folderPath: string, noteId: string) => Promise<string | null>;
  getDailyNotePath: (vaultPath: string, date: string) => Promise<string>;
  createDailyNote: (vaultPath: string, date: string) => Promise<DailyNoteResult>;
  listDailyNoteDates: (vaultPath: string) => Promise<DailyNoteDatesResult>;
  getCurrentVault: () => Promise<string | null>;
  setCurrentVault: (vaultPath: string) => Promise<{ success: boolean }>;
  clearCurrentVault: () => Promise<{ success: boolean }>;
  getRecentVaults: () => Promise<VaultInfo[]>;
  removeRecentVault: (vaultPath: string) => Promise<{ success: boolean }>;
  getDailyCalendarCollapsed: () => Promise<boolean>;
  setDailyCalendarCollapsed: (
    collapsed: boolean
  ) => Promise<{ success: boolean }>;
  getDailyNotesFolder: () => Promise<string>;
  setDailyNotesFolder: (folder: string) => Promise<{ success: boolean }>;
  getDailyNoteTemplate: () => Promise<string>;
  setDailyNoteTemplate: (template: string) => Promise<{ success: boolean }>;
  getAssetsFolder: () => Promise<string>;
  setAssetsFolder: (folder: string) => Promise<{ success: boolean }>;
  startBackend: () => Promise<BackendState>;
  stopBackend: () => Promise<BackendState>;
  getBackendStatus: () => Promise<BackendState>;
  checkBackendHealth: () => Promise<BackendHealth>;
  onBackendLog: (handler: (payload: BackendLog) => void) => () => void;
  onBackendStatus: (handler: (payload: BackendState) => void) => () => void;
  checkRuntime: () => Promise<RuntimeStatus>;
  getRuntimeStatus: () => Promise<RuntimeStatus>;
  onRuntimeStatus: (handler: (payload: RuntimeStatus) => void) => () => void;
  spawnClaude: (payload: Record<string, unknown>) => Promise<ClaudeJobResponse>;
  createClaudeSession: () => Promise<ClaudeSessionResponse>;
  getJob: (jobId: string) => Promise<ClaudeJobRecord>;
  getGitHubStatus: () => Promise<GitHubStatus>;
  getGitHubDailySummary: (date?: string) => Promise<GitHubDailySummary>;
  getGitHubRepoPaths: () => Promise<string[]>;
  setGitHubRepoPaths: (paths: string[]) => Promise<{ success: boolean }>;
  selectGitHubRepoFolder: () => Promise<SelectFolderResult>;
  // Work Time Notifications
  getWorkTimeNotifications: () => Promise<WorkTimeNotificationSettings>;
  setWorkTimeNotifications: (
    settings: WorkTimeNotificationSettings
  ) => Promise<{ success: boolean }>;
  testNotification: () => Promise<{ success: boolean }>;
  // Claude Code Sessions
  listClaudeProjects: () => Promise<string[]>;
  listClaudeSessions: (projectPath: string) => Promise<ClaudeSessionListResult>;
  getClaudeSessionDetail: (
    sessionFilePath: string
  ) => Promise<ClaudeSessionDetailResult>;
  getClaudeSessionsForDate: (
    projectPath: string,
    date: string
  ) => Promise<ClaudeSession[]>;
  getClaudeProjectPaths: () => Promise<string[]>;
  setClaudeProjectPaths: (
    projectPaths: string[]
  ) => Promise<{ success: boolean }>;
};
