import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import { getGitHubRepoPaths } from "../store.js";

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

let cachedGhPath: string | null = null;

function getStandardBinDirs(): string[] {
  if (process.platform === "win32") {
    const dirs: string[] = [];
    const programFiles = process.env.ProgramFiles;
    const localAppData = process.env.LOCALAPPDATA;
    if (programFiles) {
      dirs.push(path.join(programFiles, "GitHub CLI"));
    }
    if (localAppData) {
      dirs.push(path.join(localAppData, "Programs", "GitHub CLI"));
    }
    return dirs;
  }
  if (process.platform === "darwin") {
    return ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"];
  }
  return ["/usr/local/bin", "/usr/bin", "/bin"];
}

function splitPathList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(path.delimiter).filter((entry) => entry.trim().length > 0);
}

function getExecutableNames(name: string): string[] {
  if (process.platform !== "win32") {
    return [name];
  }
  return [`${name}.exe`, `${name}.cmd`, name];
}

function findExecutable(name: string, dirs: string[]): string | null {
  const executables = getExecutableNames(name);
  for (const dir of dirs) {
    for (const execName of executables) {
      const fullPath = path.join(dir, execName);
      if (fs.existsSync(fullPath)) {
        return fullPath;
      }
    }
  }
  return null;
}

type ExecFileOptions = {
  timeoutMs?: number;
  cwd?: string;
};

function execFileWithOutput(
  command: string,
  args: string[],
  options: ExecFileOptions = {}
): Promise<{ stdout: string; stderr: string; error: Error | null }> {
  const { timeoutMs = 10000, cwd } = options;
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs, cwd }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout?.toString() ?? "",
        stderr: stderr?.toString() ?? "",
        error: error ?? null,
      });
    });
  });
}

async function findGhCli(): Promise<string | null> {
  if (cachedGhPath && fs.existsSync(cachedGhPath)) {
    return cachedGhPath;
  }

  const pathDirs = splitPathList(process.env.PATH);
  const standardDirs = getStandardBinDirs();
  const searchDirs = [...standardDirs, ...pathDirs];

  const ghPath = findExecutable("gh", searchDirs);
  if (ghPath) {
    cachedGhPath = ghPath;
  }
  return ghPath;
}

type ExecGhResult<T> = {
  success: boolean;
  data: T | null;
  error: string | null;
};

async function execGh<T = unknown>(
  args: string[],
  options: { parseJson?: boolean; timeoutMs?: number } = {}
): Promise<ExecGhResult<T>> {
  const { parseJson = true, timeoutMs = 15000 } = options;

  const ghPath = await findGhCli();
  if (!ghPath) {
    return {
      success: false,
      data: null,
      error: "GitHub CLI (gh) not found. Install from https://cli.github.com",
    };
  }

  const { stdout, stderr, error } = await execFileWithOutput(ghPath, args, {
    timeoutMs,
  });

  if (error) {
    const errorOutput = stderr || stdout || error.message;
    if (errorOutput.includes("not logged in")) {
      return {
        success: false,
        data: null,
        error: "Not authenticated. Run 'gh auth login' in your terminal.",
      };
    }
    if (errorOutput.includes("Bad credentials")) {
      return {
        success: false,
        data: null,
        error: "Invalid credentials. Run 'gh auth login' to re-authenticate.",
      };
    }
    return {
      success: false,
      data: null,
      error: errorOutput || "Unknown error executing gh command",
    };
  }

  if (!parseJson) {
    return {
      success: true,
      data: stdout as T,
      error: null,
    };
  }

  try {
    const parsed = JSON.parse(stdout) as T;
    return {
      success: true,
      data: parsed,
      error: null,
    };
  } catch {
    return {
      success: false,
      data: null,
      error: `Failed to parse JSON response: ${stdout.slice(0, 200)}`,
    };
  }
}

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

export async function getGitHubStatus(): Promise<GitHubStatus> {
  const [cli, auth] = await Promise.all([
    getGitHubCliStatus(),
    checkGitHubAuth(),
  ]);

  return { cli, auth };
}

function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getDateString(date?: string): string {
  if (date) return date;
  return getTodayDateString();
}

type RawPR = {
  number: number;
  title: string;
  url: string;
  state: string;
  repository: { nameWithOwner: string };
  createdAt: string;
  updatedAt: string;
};

function mapRawPRToGitHubPR(pr: RawPR): GitHubPR {
  return {
    number: pr.number,
    title: pr.title,
    url: pr.url,
    state: pr.state,
    repository: pr.repository?.nameWithOwner || "",
    createdAt: pr.createdAt,
    updatedAt: pr.updatedAt,
  };
}

function excludeDuplicatePRs(prs: GitHubPR[], excludeUrls: Set<string>): GitHubPR[] {
  return prs.filter((pr) => !excludeUrls.has(pr.url));
}

export async function getTodayPRs(
  date?: string
): Promise<{ authored: GitHubPR[]; reviewed: GitHubPR[] }> {
  const dateStr = getDateString(date);

  const [authoredResult, reviewedResult] = await Promise.all([
    execGh<RawPR[]>([
      "search",
      "prs",
      "--author=@me",
      `--updated=>=${dateStr}`,
      "--json",
      "number,title,url,state,repository,createdAt,updatedAt",
      "--limit",
      "50",
    ]),
    execGh<RawPR[]>([
      "search",
      "prs",
      "--reviewed-by=@me",
      `--updated=>=${dateStr}`,
      "--json",
      "number,title,url,state,repository,createdAt,updatedAt",
      "--limit",
      "50",
    ]),
  ]);

  const authored =
    authoredResult.success && authoredResult.data
      ? authoredResult.data.map(mapRawPRToGitHubPR)
      : [];

  const allReviewed =
    reviewedResult.success && reviewedResult.data
      ? reviewedResult.data.map(mapRawPRToGitHubPR)
      : [];

  const authoredUrls = new Set(authored.map((pr) => pr.url));
  const reviewed = excludeDuplicatePRs(allReviewed, authoredUrls);

  return { authored, reviewed };
}

type ExecGitResult = {
  success: boolean;
  data: string | null;
  error: string | null;
};

type GitRemoteInfo = {
  host: string;
  repoPath: string;
};

const MAX_COMMITS_PER_REPO = 200;

let cachedGitAvailable: boolean | null = null;
let cachedGlobalGitIdentity: { name: string | null; email: string | null } | null = null;

async function execGit(
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

async function ensureGitAvailable(): Promise<boolean> {
  if (cachedGitAvailable !== null) {
    return cachedGitAvailable;
  }
  const result = await execGit(["--version"], { timeoutMs: 5000 });
  cachedGitAvailable = result.success;
  return cachedGitAvailable;
}

function escapeGitAuthorPattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function getGitConfigValue(
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

async function getGlobalGitIdentity(): Promise<{ name: string | null; email: string | null }> {
  if (cachedGlobalGitIdentity) {
    return cachedGlobalGitIdentity;
  }

  const [emailResult, nameResult] = await Promise.all([
    execGit(["config", "--global", "--get", "user.email"]),
    execGit(["config", "--global", "--get", "user.name"]),
  ]);

  cachedGlobalGitIdentity = {
    email: emailResult.success && emailResult.data ? emailResult.data.trim() : null,
    name: nameResult.success && nameResult.data ? nameResult.data.trim() : null,
  };

  if (cachedGlobalGitIdentity.email === "") {
    cachedGlobalGitIdentity.email = null;
  }
  if (cachedGlobalGitIdentity.name === "") {
    cachedGlobalGitIdentity.name = null;
  }

  return cachedGlobalGitIdentity;
}

async function getRepoAuthorPattern(repoPath: string): Promise<string | null> {
  const [repoEmail, repoName] = await Promise.all([
    getGitConfigValue(repoPath, "user.email"),
    getGitConfigValue(repoPath, "user.name"),
  ]);

  let email = repoEmail;
  let name = repoName;

  if (!email || !name) {
    const globalIdentity = await getGlobalGitIdentity();
    email = email || globalIdentity.email;
    name = name || globalIdentity.name;
  }

  const parts = [email, name].filter(Boolean).map(escapeGitAuthorPattern);
  return parts.length > 0 ? parts.join("|") : null;
}

async function isGitRepo(repoPath: string): Promise<boolean> {
  const result = await execGit([
    "-C",
    repoPath,
    "rev-parse",
    "--is-inside-work-tree",
  ]);
  return result.success && result.data?.trim() === "true";
}

function parseRemoteUrl(remoteUrl: string): GitRemoteInfo | null {
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

async function getRepoRemoteInfo(repoPath: string): Promise<GitRemoteInfo | null> {
  const result = await execGit(["-C", repoPath, "remote", "get-url", "origin"]);
  if (!result.success || !result.data) {
    return null;
  }
  return parseRemoteUrl(result.data);
}

function getRepoDisplayName(repoPath: string, remoteInfo: GitRemoteInfo | null): string {
  if (remoteInfo?.repoPath) {
    return remoteInfo.repoPath.replace(/\.git$/, "");
  }
  return path.basename(path.normalize(repoPath)) || repoPath;
}

function parseGitLog(
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
      url: urlBase ? `${urlBase}/commit/${sha}` : "",
      createdAt: createdAt.trim(),
    });
  }
  return commits;
}

async function getLocalCommits(dateStr: string): Promise<GitHubCommit[]> {
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
        `--since=${dateStr}`,
        "--pretty=format:%H%x1f%aI%x1f%s",
        "--max-count",
        String(MAX_COMMITS_PER_REPO),
      ];

      if (authorPattern) {
        logArgs.push(`--author=${authorPattern}`);
      }

      const logResult = await execGit(logArgs, { timeoutMs: 20000 });
      if (!logResult.success || !logResult.data) {
        return [];
      }

      const repository = getRepoDisplayName(repoPath, remoteInfo);
      const urlBase = remoteInfo
        ? `https://${remoteInfo.host}/${remoteInfo.repoPath.replace(/\.git$/, "")}`
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

export async function getGitHubDailySummary(
  date?: string
): Promise<GitHubDailySummary> {
  const dateStr = getDateString(date);

  const auth = await checkGitHubAuth();
  const prs =
    auth.authenticated && auth.username
      ? await getTodayPRs(dateStr)
      : { authored: [], reviewed: [] };
  const commits = await getLocalCommits(dateStr);

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
