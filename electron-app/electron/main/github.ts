import { execFile } from "child_process";
import fs from "fs";
import path from "path";

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

function execFileWithOutput(
  command: string,
  args: string[],
  timeoutMs = 10000
): Promise<{ stdout: string; stderr: string; error: Error | null }> {
  return new Promise((resolve) => {
    execFile(command, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
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

  const { stdout, stderr, error } = await execFileWithOutput(
    ghPath,
    args,
    timeoutMs
  );

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

type RawPushEvent = {
  type: string;
  created_at: string;
  repo: { name: string };
  payload: {
    commits?: Array<{
      sha: string;
      message: string;
      url: string;
    }>;
  };
};

export async function getTodayCommits(
  username: string,
  date?: string
): Promise<GitHubCommit[]> {
  const dateStr = getDateString(date);
  const startOfDay = `${dateStr}T00:00:00Z`;

  const result = await execGh<RawPushEvent[]>(
    ["api", `/users/${username}/events`, "--paginate"],
    { timeoutMs: 20000 }
  );

  if (!result.success || !result.data) {
    return [];
  }

  const commits: GitHubCommit[] = [];

  for (const event of result.data) {
    if (event.type !== "PushEvent") continue;
    if (event.created_at < startOfDay) continue;

    const eventCommits = event.payload.commits || [];
    for (const commit of eventCommits) {
      commits.push({
        sha: commit.sha.slice(0, 7),
        message: commit.message.split("\n")[0],
        repository: event.repo.name,
        url: commit.url
          .replace("api.github.com/repos", "github.com")
          .replace("/commits/", "/commit/"),
        createdAt: event.created_at,
      });
    }
  }

  return commits;
}

export async function getGitHubDailySummary(
  date?: string
): Promise<GitHubDailySummary> {
  const dateStr = getDateString(date);

  const auth = await checkGitHubAuth();

  if (!auth.authenticated || !auth.username) {
    return {
      date: dateStr,
      username: null,
      prs: { authored: [], reviewed: [] },
      commits: [],
      stats: {
        totalPRsAuthored: 0,
        totalPRsReviewed: 0,
        totalCommits: 0,
      },
    };
  }

  const [prs, commits] = await Promise.all([
    getTodayPRs(dateStr),
    getTodayCommits(auth.username, dateStr),
  ]);

  return {
    date: dateStr,
    username: auth.username,
    prs,
    commits,
    stats: {
      totalPRsAuthored: prs.authored.length,
      totalPRsReviewed: prs.reviewed.length,
      totalCommits: commits.length,
    },
  };
}
