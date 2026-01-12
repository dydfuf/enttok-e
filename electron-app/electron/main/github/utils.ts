/**
 * Path utilities, executable finders, and shell execution helpers
 */

import { execFile } from "child_process";
import fs from "fs";
import path from "path";
import type { ExecFileOptions } from "./types.js";

/**
 * Get standard binary directories for the current platform
 */
export function getStandardBinDirs(): string[] {
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

/**
 * Split PATH environment variable into array of directories
 */
export function splitPathList(value: string | undefined): string[] {
  if (!value) return [];
  return value.split(path.delimiter).filter((entry) => entry.trim().length > 0);
}

/**
 * Get platform-specific executable names
 */
export function getExecutableNames(name: string): string[] {
  if (process.platform !== "win32") {
    return [name];
  }
  return [`${name}.exe`, `${name}.cmd`, name];
}

/**
 * Find an executable in the given directories
 */
export function findExecutable(name: string, dirs: string[]): string | null {
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

/**
 * Execute a file and return stdout/stderr/error
 */
export function execFileWithOutput(
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

/**
 * Get today's date as YYYY-MM-DD string
 */
export function getTodayDateString(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * Get date string, defaulting to today if not provided
 */
export function getDateString(date?: string): string {
  if (date) return date;
  return getTodayDateString();
}
