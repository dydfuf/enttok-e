// Public types - exported from index.ts
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

// Internal types - used within the module
export type ClaudeSessionRecord = ClaudeSessionMessage & { isMeta?: boolean };

export type ClaudeSessionFileEntry = {
  name: string;
  path: string;
  mtime: Date;
};

export type ClaudeProjectEntry = {
  dirName: string;
  dirPath: string;
  projectPath: string;
};
