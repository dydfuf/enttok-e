import fs from "fs";
import path from "path";
import type { ClaudeSessionFileEntry, ClaudeProjectEntry } from "./types.js";
import { PROJECTS_DIR } from "./constants.js";
import { claudeProjectDirToPath, pathToClaudeProjectDir } from "./paths.js";
import { getSessionMetadata } from "./parser.js";

/**
 * List all session files in a directory, sorted by modification time (newest first).
 */
export async function listSessionFiles(
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

/**
 * Resolve the actual project path from a Claude project directory
 * by reading metadata from session files.
 */
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

/**
 * List all Claude project entries from the projects directory.
 */
export async function listClaudeProjectEntries(): Promise<ClaudeProjectEntry[]> {
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

/**
 * Resolve a project path to its Claude directory location.
 * Tries direct match, then encoded match, then fallback to encoded path.
 */
export async function resolveProjectDir(
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
