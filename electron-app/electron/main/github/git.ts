/**
 * Git command execution utilities
 */

import path from "path";
import type { ExecGitResult, GitRemoteInfo } from "./types.js";
import { execFileWithOutput } from "./utils.js";

let cachedGitAvailable: boolean | null = null;
let cachedGlobalGitName: string | null | undefined = undefined;

/**
 * Execute a git command
 */
export async function execGit(
  args: string[],
  options: { timeoutMs?: number } = {}
): Promise<ExecGitResult> {
  const { timeoutMs = 15000 } = options;
  const { stdout, stderr, error } = await execFileWithOutput("git", args, {
    timeoutMs,
  });

  if (error) {
    return {
      success: false,
      data: null,
      error: stderr || stdout || error.message,
    };
  }

  return { success: true, data: stdout, error: null };
}

/**
 * Check if git is available on the system
 */
export async function ensureGitAvailable(): Promise<boolean> {
  if (cachedGitAvailable !== null) {
    return cachedGitAvailable;
  }
  const result = await execGit(["--version"], { timeoutMs: 5000 });
  cachedGitAvailable = result.success;
  return cachedGitAvailable;
}

/**
 * Escape special regex characters in git author pattern
 */
export function escapeGitAuthorPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Get a git config value for a repository
 */
export async function getGitConfigValue(
  repoPath: string,
  key: string
): Promise<string | null> {
  const result = await execGit(["-C", repoPath, "config", "--get", key]);
  if (!result.success || !result.data) {
    return null;
  }
  const value = result.data.trim();
  return value.length > 0 ? value : null;
}

/**
 * Get global git user.name
 */
export async function getGlobalGitName(): Promise<string | null> {
  if (cachedGlobalGitName !== undefined) {
    return cachedGlobalGitName;
  }

  const result = await execGit(["config", "--global", "--get", "user.name"]);
  cachedGlobalGitName = result.success && result.data ? result.data.trim() : null;

  if (cachedGlobalGitName === "") {
    cachedGlobalGitName = null;
  }

  return cachedGlobalGitName;
}

/**
 * Get author pattern for a repository (local or global)
 */
export async function getRepoAuthorPattern(repoPath: string): Promise<string | null> {
  let name = await getGitConfigValue(repoPath, "user.name");

  if (!name) {
    name = await getGlobalGitName();
  }

  return name ? escapeGitAuthorPattern(name) : null;
}

/**
 * Check if a path is a git repository
 */
export async function isGitRepo(repoPath: string): Promise<boolean> {
  const result = await execGit([
    "-C",
    repoPath,
    "rev-parse",
    "--is-inside-work-tree",
  ]);
  return result.success && result.data?.trim() === "true";
}

/**
 * Parse a git remote URL into host and repo path
 */
export function parseRemoteUrl(remoteUrl: string): GitRemoteInfo | null {
  const trimmed = remoteUrl.trim();
  if (!trimmed) return null;

  const scpMatch = trimmed.match(/^git@([^:]+):(.+?)(?:\.git)?$/);
  if (scpMatch) {
    return { host: scpMatch[1], repoPath: scpMatch[2] };
  }

  const sshMatch = trimmed.match(/^ssh:\/\/git@([^/]+)\/(.+?)(?:\.git)?$/);
  if (sshMatch) {
    return { host: sshMatch[1], repoPath: sshMatch[2] };
  }

  const httpsMatch = trimmed.match(/^https?:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (httpsMatch) {
    return { host: httpsMatch[1], repoPath: httpsMatch[2] };
  }

  const gitMatch = trimmed.match(/^git:\/\/([^/]+)\/(.+?)(?:\.git)?$/);
  if (gitMatch) {
    return { host: gitMatch[1], repoPath: gitMatch[2] };
  }

  return null;
}

/**
 * Get remote info (host and repo path) for a repository
 */
export async function getRepoRemoteInfo(repoPath: string): Promise<GitRemoteInfo | null> {
  const result = await execGit(["-C", repoPath, "remote", "get-url", "origin"]);
  if (!result.success || !result.data) {
    return null;
  }
  return parseRemoteUrl(result.data);
}

/**
 * Get display name for a repository
 */
export function getRepoDisplayName(repoPath: string, remoteInfo: GitRemoteInfo | null): string {
  if (remoteInfo?.repoPath) {
    return remoteInfo.repoPath.replace(/\.git$/, "");
  }
  return path.basename(path.normalize(repoPath)) || repoPath;
}
