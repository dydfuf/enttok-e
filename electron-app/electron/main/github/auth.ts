/**
 * GitHub authentication functions
 */

import type {
  GitHubCliStatus,
  GitHubAuthStatus,
  GitHubAuthHost,
  GitHubStatus,
} from "./types.js";
import { findGhCli, execGh } from "./cli.js";
import { execFileWithOutput } from "./utils.js";

/**
 * Get GitHub CLI status (found, path, version)
 */
export async function getGitHubCliStatus(): Promise<GitHubCliStatus> {
  const ghPath = await findGhCli();
  if (!ghPath) {
    return {
      found: false,
      path: null,
      version: null,
      error: "gh CLI not found",
    };
  }

  const { stdout, error } = await execFileWithOutput(ghPath, ["--version"]);
  const versionMatch = stdout.match(/gh version ([\d.]+)/);

  return {
    found: true,
    path: ghPath,
    version: versionMatch ? versionMatch[1] : null,
    error: error ? error.message : null,
  };
}

/**
 * Check GitHub authentication status
 */
export async function checkGitHubAuth(): Promise<GitHubAuthStatus> {
  const result = await execGh<{ hosts: Record<string, GitHubAuthHost[]> }>([
    "auth",
    "status",
    "--json",
    "hosts",
  ]);

  if (!result.success || !result.data) {
    return {
      authenticated: false,
      username: null,
      hostname: "github.com",
      error: result.error,
    };
  }

  const hosts = result.data.hosts || {};
  const githubComUsers = hosts["github.com"] || [];
  const activeGithubComUser = githubComUsers.find(
    (h) => h.active && h.state !== "error"
  );

  if (activeGithubComUser) {
    return {
      authenticated: true,
      username: activeGithubComUser.login,
      hostname: "github.com",
      error: null,
    };
  }

  for (const [hostname, users] of Object.entries(hosts)) {
    const activeUser = users.find((u) => u.active && u.state !== "error");
    if (activeUser) {
      return {
        authenticated: true,
        username: activeUser.login,
        hostname,
        error: null,
      };
    }
  }

  const errorHost = githubComUsers.find((h) => h.active && h.state === "error");
  if (errorHost) {
    return {
      authenticated: false,
      username: errorHost.login,
      hostname: "github.com",
      error: errorHost.error || "Authentication error",
    };
  }

  return {
    authenticated: false,
    username: null,
    hostname: "github.com",
    error: "No active GitHub account found",
  };
}

/**
 * Get combined GitHub CLI and auth status
 */
export async function getGitHubStatus(): Promise<GitHubStatus> {
  const [cli, auth] = await Promise.all([
    getGitHubCliStatus(),
    checkGitHubAuth(),
  ]);

  return { cli, auth };
}
