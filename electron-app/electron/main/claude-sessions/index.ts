import fs from "fs";
import path from "path";
import type {
  ClaudeSession,
  ClaudeSessionListResult,
  ClaudeSessionDetailResult,
  ClaudeSessionRecord,
} from "./types.js";
import { PROJECTS_DIR } from "./constants.js";
import { listSessionFiles, listClaudeProjectEntries, resolveProjectDir } from "./file-utils.js";
import { parseSessionFile, getSessionMetadata } from "./parser.js";
import { isMetaMessage } from "./message-utils.js";

// Re-export all public types
export type {
  ClaudeSessionMessage,
  ClaudeSession,
  ClaudeSessionListResult,
  ClaudeSessionDetailResult,
} from "./types.js";

/**
 * Get the path to the Claude projects directory.
 */
export function getClaudeProjectsDir(): string {
  return PROJECTS_DIR;
}

/**
 * List all unique project paths that have Claude sessions.
 */
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

/**
 * List all Claude sessions for a given project path.
 */
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

/**
 * Get detailed information about a specific Claude session.
 */
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

/**
 * Get all Claude sessions for a specific date.
 */
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
