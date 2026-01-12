/**
 * GitHub CLI (gh) wrapper functions
 */

import fs from "fs";
import type { ExecGhResult } from "./types.js";
import {
  findExecutable,
  getStandardBinDirs,
  splitPathList,
  execFileWithOutput,
} from "./utils.js";

let cachedGhPath: string | null = null;

/**
 * Find the gh CLI executable
 */
export async function findGhCli(): Promise<string | null> {
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

/**
 * Execute a gh CLI command
 */
export async function execGh<T = unknown>(
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
      error: "Failed to parse JSON response: " + stdout.slice(0, 200),
    };
  }
}
