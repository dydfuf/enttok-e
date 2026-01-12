/**
 * Type definitions for GitHub integration module
 */

export type GitHubCliStatus = {
  found: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
};

export type GitHubAuthHost = {
  login: string;
  active: boolean;
  state: string;
  error?: string;
};

export type GitHubAuthStatus = {
  authenticated: boolean;
  username: string | null;
  hostname: string;
  error: string | null;
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

export type GitHubStatus = {
  cli: GitHubCliStatus;
  auth: GitHubAuthStatus;
};

export type ExecFileOptions = {
  timeoutMs?: number;
  cwd?: string;
};

export type ExecGhResult<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

export type ExecGitResult = {
  success: boolean;
  data: string | null;
  error: string | null;
};

export type GitRemoteInfo = {
  host: string;
  repoPath: string;
};

export type RawPR = {
  number: number;
  title: string;
  url: string;
  state: string;
  repository: { nameWithOwner: string };
  createdAt: string;
  updatedAt: string;
};
