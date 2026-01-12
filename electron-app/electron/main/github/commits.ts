/**
 * Local git commit functions
 */

import fs from "fs";
import type { GitHubCommit } from "./types.js";
import {
  execGit,
  ensureGitAvailable,
  isGitRepo,
  getRepoRemoteInfo,
  getRepoAuthorPattern,
  getRepoDisplayName,
} from "./git.js";
import { getGitHubRepoPaths } from "../../store.js";

const MAX_COMMITS_PER_REPO = 200;

/**
 * Parse git log output into GitHubCommit array
 */
export function parseGitLog(
  output: string,
  repository: string,
  urlBase: string | null
): GitHubCommit[] {
  const trimmed = output.trim();
  if (!trimmed) {
    return [];
  }

  const commits: GitHubCommit[] = [];
  for (const line of trimmed.split("\n")) {
    const [sha, createdAt, message] = line.split("\x1f");
    if (!sha || !createdAt) continue;
    commits.push({
      sha: sha.slice(0, 7),
      message: message ? message.trim() : "No commit message",
      repository,
      url: urlBase ? urlBase + "/commit/" + sha : "",
      createdAt: createdAt.trim(),
    });
  }
  return commits;
}

/**
 * Get local commits from configured repositories
 */
export async function getLocalCommits(): Promise<GitHubCommit[]> {
  const repoPaths = getGitHubRepoPaths();
  if (repoPaths.length === 0) {
    return [];
  }

  const gitAvailable = await ensureGitAvailable();
  if (!gitAvailable) {
    return [];
  }

  const repoCommits = await Promise.all(
    repoPaths.map(async (repoPath) => {
      if (!fs.existsSync(repoPath)) {
        return [];
      }

      const repoOk = await isGitRepo(repoPath);
      if (!repoOk) {
        return [];
      }

      const [remoteInfo, authorPattern] = await Promise.all([
        getRepoRemoteInfo(repoPath),
        getRepoAuthorPattern(repoPath),
      ]);

      const logArgs = [
        "-C",
        repoPath,
        "log",
        "--all",
        "--pretty=format:%H%x1f%aI%x1f%s",
        "--max-count",
        String(MAX_COMMITS_PER_REPO),
      ];

      if (authorPattern) {
        logArgs.push("--author=" + authorPattern);
      }

      const logResult = await execGit(logArgs, { timeoutMs: 20000 });
      if (!logResult.success || !logResult.data) {
        return [];
      }

      const repository = getRepoDisplayName(repoPath, remoteInfo);
      const urlBase = remoteInfo
        ? "https://" + remoteInfo.host + "/" + remoteInfo.repoPath.replace(/\.git$/, "")
        : null;

      return parseGitLog(logResult.data, repository, urlBase);
    })
  );

  const commits = repoCommits.flat();
  commits.sort(
    (a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)
  );
  return commits;
}
