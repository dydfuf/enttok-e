/**
 * GitHub integration module - Re-export for backward compatibility
 *
 * This file maintains backward compatibility by re-exporting from the
 * modularized github/ directory. New code should import directly from
 * "./github/index.js" or specific submodules.
 */

export type {
  GitHubCliStatus,
  GitHubAuthHost,
  GitHubAuthStatus,
  GitHubPR,
  GitHubCommit,
  GitHubDailySummary,
  GitHubStatus,
} from "./github/index.js";

export {
  getGitHubCliStatus,
  checkGitHubAuth,
  getGitHubStatus,
  getTodayPRs,
  getGitHubDailySummary,
} from "./github/index.js";
