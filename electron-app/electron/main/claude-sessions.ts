import fs from "fs";
import path from "path";
import os from "os";
import readline from "readline";

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

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");

function pathToClaudeProjectDir(projectPath: string): string {
  // Convert /Users/foo/bar to -Users-foo-bar
  return projectPath.replace(/\//g, "-");
}

function claudeProjectDirToPath(dirName: string): string {
  // Convert -Users-foo-bar back to /Users/foo/bar
  if (dirName.startsWith("-")) {
    return dirName.replace(/-/g, "/");
  }
  return dirName;
}

type ClaudeSessionRecord = ClaudeSessionMessage & { isMeta?: boolean };

type ClaudeSessionFileEntry = {
  name: string;
  path: string;
  mtime: Date;
};

type ClaudeProjectEntry = {
  dirName: string;
  dirPath: string;
  projectPath: string;
};

function extractMessageText(
  message?: ClaudeSessionMessage["message"]
): string {
  if (!message) return "";
  const content = message.content;
  if (typeof content === "string") {
    return content.trim();
  }
  if (Array.isArray(content)) {
    const parts = content
      .map((part) => (typeof part.text === "string" ? part.text.trim() : ""))
      .filter((part) => part.length > 0);
    return parts.join("\n").trim();
  }
  return "";
}

function isMetaMessage(message: ClaudeSessionRecord): boolean {
  return Boolean(message.isMeta);
}

function isCommandMarkup(text: string): boolean {
  const trimmed = text.trim();
  return (
    trimmed.startsWith("<command-name>") ||
    trimmed.startsWith("<command-message>") ||
    trimmed.startsWith("<command-args>") ||
    trimmed.startsWith("<local-command")
  );
}

async function listSessionFiles(
  dirPath: string,
  options: { includeAgent?: boolean } = {}
): Promise<ClaudeSessionFileEntry[]> {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const files = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".jsonl"))
      .filter(
        (entry) => options.includeAgent || !entry.name.startsWith("agent-")
      )
      .map(async (entry) => {
        const filePath = path.join(dirPath, entry.name);
        const stats = await fs.promises.stat(filePath);
        return {
          name: entry.name,
          path: filePath,
          mtime: stats.mtime,
        };
      });
    const withStats = await Promise.all(files);
    withStats.sort((a, b) => b.mtime.getTime() - a.mtime.getTime());
    return withStats;
  } catch {
    return [];
  }
}

async function resolveProjectPathFromDir(
  dirPath: string
): Promise<string | null> {
  const files = await listSessionFiles(dirPath);
  const candidates =
    files.length > 0 ? files : await listSessionFiles(dirPath, { includeAgent: true });
  if (candidates.length === 0) {
    return null;
  }
  const metadata = await getSessionMetadata(candidates[0].path);
  return metadata?.projectPath ?? null;
}

async function listClaudeProjectEntries(): Promise<ClaudeProjectEntry[]> {
  if (!fs.existsSync(PROJECTS_DIR)) {
    return [];
  }

  try {
    const entries = await fs.promises.readdir(PROJECTS_DIR, { withFileTypes: true });
    const directories = entries.filter((entry) => entry.isDirectory());

    return await Promise.all(
      directories.map(async (entry) => {
        const dirPath = path.join(PROJECTS_DIR, entry.name);
        const projectPath =
          (await resolveProjectPathFromDir(dirPath)) ??
          claudeProjectDirToPath(entry.name);
        return {
          dirName: entry.name,
          dirPath,
          projectPath,
        };
      })
    );
  } catch {
    return [];
  }
}

async function resolveProjectDir(
  projectPath: string
): Promise<{ dirPath: string; projectPath: string } | null> {
  const entries = await listClaudeProjectEntries();
  const directMatch = entries.find((entry) => entry.projectPath === projectPath);
  if (directMatch) {
    return {
      dirPath: directMatch.dirPath,
      projectPath: directMatch.projectPath,
    };
  }

  const encoded = pathToClaudeProjectDir(projectPath);
  const encodedMatch = entries.find((entry) => entry.dirName === encoded);
  if (encodedMatch) {
    return {
      dirPath: encodedMatch.dirPath,
      projectPath: encodedMatch.projectPath,
    };
  }

  const fallbackDir = path.join(PROJECTS_DIR, encoded);
  if (fs.existsSync(fallbackDir)) {
    return { dirPath: fallbackDir, projectPath };
  }
  return null;
}

export function getClaudeProjectsDir(): string {
  return PROJECTS_DIR;
}

export async function listClaudeProjects(): Promise<string[]> {
  const entries = await listClaudeProjectEntries();
  const projects: string[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    if (!entry.projectPath) continue;
    if (seen.has(entry.projectPath)) continue;
    seen.add(entry.projectPath);
    projects.push(entry.projectPath);
  }
  return projects;
}

async function parseSessionFile(
  filePath: string
): Promise<{ messages: ClaudeSessionMessage[]; summary: string; firstMessage: string }> {
  const messages: ClaudeSessionMessage[] = [];
  let summary = "";
  let firstMessage = "";
  let fallbackMessage = "";

  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      resolve({ messages, summary, firstMessage });
      return;
    }

    const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    rl.on("line", (line) => {
      if (!line.trim()) return;

      try {
        const parsed = JSON.parse(line) as ClaudeSessionRecord;
        messages.push(parsed);

        // Extract summary
        if (parsed.type === "summary" && parsed.summary && !summary) {
          summary = parsed.summary;
        }

        const messageText = extractMessageText(parsed.message);
        if (messageText && !isCommandMarkup(messageText)) {
          if (parsed.type === "user" && !isMetaMessage(parsed) && !firstMessage) {
            firstMessage = messageText.slice(0, 200);
          }
          if (parsed.type === "assistant" && !fallbackMessage) {
            fallbackMessage = messageText.slice(0, 200);
          }
        }
      } catch {
        // Skip invalid JSON lines
      }
    });

    rl.on("close", () => {
      resolve({
        messages,
        summary,
        firstMessage: firstMessage || fallbackMessage,
      });
    });

    rl.on("error", () => {
      resolve({
        messages,
        summary,
        firstMessage: firstMessage || fallbackMessage,
      });
    });
  });
}

async function getSessionMetadata(
  filePath: string
): Promise<Partial<ClaudeSession> | null> {
  return new Promise((resolve) => {
    if (!fs.existsSync(filePath)) {
      resolve(null);
      return;
    }

    const fileStream = fs.createReadStream(filePath, { encoding: "utf8" });
    const rl = readline.createInterface({
      input: fileStream,
      crlfDelay: Infinity,
    });

    let summary = "";
    let firstMessage = "";
    let fallbackMessage = "";
    let timestamp = "";
    let gitBranch = "";
    let sessionId = "";
    let messageCount = 0;
    let projectPath = "";
    let linesRead = 0;
    const maxLines = 100; // Read up to 100 lines to get metadata

    rl.on("line", (line) => {
      linesRead++;
      if (linesRead > maxLines) {
        rl.close();
        return;
      }

      if (!line.trim()) return;

      try {
        const parsed = JSON.parse(line) as ClaudeSessionRecord;
        const isMeta = isMetaMessage(parsed);

        // Count user and assistant messages
        if ((parsed.type === "user" || parsed.type === "assistant") && !isMeta) {
          messageCount++;
        }

        // Extract summary
        if (parsed.type === "summary" && parsed.summary && !summary) {
          summary = parsed.summary;
        }

        const messageText = extractMessageText(parsed.message);
        if (messageText && !isCommandMarkup(messageText)) {
          if (parsed.type === "user" && !isMeta && !firstMessage) {
            firstMessage = messageText.slice(0, 200);
          }
          if (parsed.type === "assistant" && !fallbackMessage) {
            fallbackMessage = messageText.slice(0, 200);
          }
        }

        // Extract metadata from first non-summary message
        if (!timestamp && parsed.timestamp) {
          timestamp = parsed.timestamp;
        }
        if (!gitBranch && parsed.gitBranch) {
          gitBranch = parsed.gitBranch;
        }
        if (!sessionId && parsed.sessionId) {
          sessionId = parsed.sessionId;
        }
        if (!projectPath && parsed.cwd) {
          projectPath = parsed.cwd;
        }
      } catch {
        // Skip invalid JSON lines
      }
    });

    rl.on("close", () => {
      resolve({
        summary,
        firstMessage: firstMessage || fallbackMessage,
        timestamp,
        gitBranch,
        messageCount,
        id: sessionId,
        projectPath,
      });
    });

    rl.on("error", () => {
      resolve(null);
    });
  });
}

export async function listClaudeSessions(
  projectPath: string
): Promise<ClaudeSessionListResult> {
  const resolved = await resolveProjectDir(projectPath);

  if (!resolved || !fs.existsSync(resolved.dirPath)) {
    return {
      success: true,
      sessions: [],
      projectPath,
      error: null,
    };
  }

  try {
    const filesWithStats = await listSessionFiles(resolved.dirPath);
    if (filesWithStats.length === 0) {
      return {
        success: true,
        sessions: [],
        projectPath: resolved.projectPath,
        error: null,
      };
    }

    const filesWithMetadata = await Promise.all(
      filesWithStats.map(async (file) => ({
        ...file,
        metadata: await getSessionMetadata(file.path),
      }))
    );

    const sessions: ClaudeSession[] = filesWithStats
      .map((file, index) => ({
        ...file,
        metadata: filesWithMetadata[index]?.metadata ?? null,
      }))
      .filter((f) => f.metadata)
      .map((file) => {
        const sessionId = file.metadata?.id || file.name.replace(".jsonl", "");
        const summary =
          file.metadata?.summary ||
          file.metadata?.firstMessage ||
          "Untitled Session";
        return {
          id: sessionId,
          summary,
          firstMessage: file.metadata?.firstMessage || "",
          timestamp: file.metadata?.timestamp || file.mtime.toISOString(),
          messageCount: file.metadata?.messageCount || 0,
          gitBranch: file.metadata?.gitBranch || "",
          projectPath: file.metadata?.projectPath || resolved.projectPath,
          filePath: file.path,
        };
      });

    return {
      success: true,
      sessions,
      projectPath: resolved.projectPath,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      sessions: [],
      projectPath: resolved?.projectPath ?? projectPath,
      error: error instanceof Error ? error.message : "Failed to list sessions",
    };
  }
}

export async function getClaudeSessionDetail(
  sessionFilePath: string
): Promise<ClaudeSessionDetailResult> {
  if (!fs.existsSync(sessionFilePath)) {
    return {
      success: false,
      session: null,
      messages: [],
      error: "Session file not found",
    };
  }

  try {
    const { messages, summary, firstMessage } =
      await parseSessionFile(sessionFilePath);

    const sessionMessages = messages.filter(
      (m) => m.type === "user" || m.type === "assistant"
    );
    const firstSystemMsg =
      sessionMessages.find((m) => !isMetaMessage(m as ClaudeSessionRecord)) ??
      sessionMessages[0];
    const messageCount = sessionMessages.filter(
      (m) => !isMetaMessage(m as ClaudeSessionRecord)
    ).length;
    const sessionSummary = summary || firstMessage || "Untitled Session";

    const session: ClaudeSession = {
      id: firstSystemMsg?.sessionId || path.basename(sessionFilePath, ".jsonl"),
      summary: sessionSummary,
      firstMessage,
      timestamp: firstSystemMsg?.timestamp || new Date().toISOString(),
      messageCount,
      gitBranch: firstSystemMsg?.gitBranch || "",
      projectPath: firstSystemMsg?.cwd || "",
      filePath: sessionFilePath,
    };

    return {
      success: true,
      session,
      messages,
      error: null,
    };
  } catch (error) {
    return {
      success: false,
      session: null,
      messages: [],
      error: error instanceof Error ? error.message : "Failed to read session",
    };
  }
}

export async function getClaudeSessionsForDate(
  projectPath: string,
  date: string // YYYY-MM-DD format
): Promise<ClaudeSession[]> {
  const result = await listClaudeSessions(projectPath);
  if (!result.success) {
    return [];
  }

  const targetDate = new Date(date);
  const targetDateStr = targetDate.toISOString().split("T")[0];

  return result.sessions.filter((session) => {
    const sessionDate = new Date(session.timestamp).toISOString().split("T")[0];
    return sessionDate === targetDateStr;
  });
}
