/**
 * GitHub integration module
 *
 * This module provides functions for interacting with GitHub CLI,
 * checking authentication status, fetching PRs, and collecting local commits.
 */

// Re-export all types
export type {
  GitHubCliStatus,
  GitHubAuthHost,
  GitHubAuthStatus,
  GitHubPR,
  GitHubCommit,
  GitHubDailySummary,
  GitHubStatus,
} from "./types.js";

// Re-export auth functions
export {
  getGitHubCliStatus,
  checkGitHubAuth,
  getGitHubStatus,
} from "./auth.js";

// Re-export PR functions
export { getTodayPRs } from "./prs.js";

// Re-export commit functions
export { getLocalCommits } from "./commits.js";

// Import for getGitHubDailySummary
import type { GitHubDailySummary } from "./types.js";
import { checkGitHubAuth } from "./auth.js";
import { getTodayPRs } from "./prs.js";
import { getLocalCommits } from "./commits.js";
import { getDateString } from "./utils.js";

/**
 * Get a complete daily summary of GitHub activity
 */
export async function getGitHubDailySummary(
  date?: string
): Promise<GitHubDailySummary> {
  const dateStr = getDateString(date);

  const auth = await checkGitHubAuth();
  const prs =
    auth.authenticated && auth.username
      ? await getTodayPRs(dateStr)
      : { authored: [], reviewed: [] };
  const commits = await getLocalCommits();

  return {
    date: dateStr,
    username: auth.authenticated ? auth.username : null,
    prs,
    commits,
    stats: {
      totalPRsAuthored: prs.authored.length,
      totalPRsReviewed: prs.reviewed.length,
      totalCommits: commits.length,
    },
  };
}
