import { BrowserWindow } from "electron";
import { execFile } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";

type RuntimeBinaryStatus = {
  found: boolean;
  path: string | null;
  version: string | null;
  error: string | null;
};

type RuntimeStatus = {
  node: RuntimeBinaryStatus;
  npx: RuntimeBinaryStatus;
  claude: RuntimeBinaryStatus;
  lastCheckedAt: string | null;
};

let runtimeStatus: RuntimeStatus = {
  node: { found: false, path: null, version: null, error: null },
  npx: { found: false, path: null, version: null, error: null },
  claude: { found: false, path: null, version: null, error: null },
  lastCheckedAt: null,
};

let runtimeCheckPromise: Promise<RuntimeStatus> | null = null;

function broadcastRuntimeStatus() {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("runtime:status", runtimeStatus);
  }
}

function splitPathList(value: string | undefined) {
  if (!value) {
    return [];
  }
  return value.split(path.delimiter).filter((entry) => entry.trim().length > 0);
}

function mergePathList(additions: string[], existing?: string) {
  const combined = [...additions, ...splitPathList(existing)];
  const seen = new Set<string>();
  const deduped: string[] = [];
  for (const entry of combined) {
    if (!seen.has(entry)) {
      seen.add(entry);
      deduped.push(entry);
    }
  }
  return deduped.join(path.delimiter);
}

function getStandardBinDirs() {
  if (process.platform === "win32") {
    const dirs = [];
    const programFiles = process.env.ProgramFiles;
    const programFilesX86 = process.env["ProgramFiles(x86)"];
    if (programFiles) {
      dirs.push(path.join(programFiles, "nodejs"));
    }
    if (programFilesX86) {
      dirs.push(path.join(programFilesX86, "nodejs"));
    }
    return dirs;
  }
  if (process.platform === "darwin") {
    return ["/usr/local/bin", "/opt/homebrew/bin", "/usr/bin", "/bin"];
  }
  return ["/usr/local/bin", "/usr/bin", "/bin"];
}

function getNvmBinDirs() {
  if (process.platform === "win32") {
    return [];
  }
  const nvmBase = path.join(os.homedir(), ".nvm", "versions", "node");
  if (!fs.existsSync(nvmBase)) {
    return [];
  }
  try {
    const versions = fs.readdirSync(nvmBase);
    versions.sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
    return versions.map((version) => path.join(nvmBase, version, "bin"));
  } catch {
    return [];
  }
}

function getExecutableNames(name: string) {
  if (process.platform !== "win32") {
    return [name];
  }
  const extensions = name === "node" ? [".exe"] : [".cmd", ".exe"];
  return extensions.map((ext) => `${name}${ext}`).concat(name);
}

function findExecutable(name: string, dirs: string[]) {
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

function findExistingPath(paths: string[]) {
  for (const candidate of paths) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return null;
}

function execFileWithOutput(
  command: string,
  args: string[],
  options: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}
) {
  const { timeoutMs = 2000, env } = options;
  return new Promise<{
    stdout: string;
    stderr: string;
    error: Error | null;
  }>((resolve) => {
    execFile(
      command,
      args,
      { timeout: timeoutMs, env: env ?? process.env },
      (error, stdout, stderr) => {
        resolve({
          stdout: stdout?.toString() ?? "",
          stderr: stderr?.toString() ?? "",
          error: error ?? null,
        });
      }
    );
  });
}

async function readVersion(
  command: string,
  args: string[],
  env?: NodeJS.ProcessEnv
) {
  const { stdout, stderr, error } = await execFileWithOutput(command, args, {
    env,
  });
  const output = `${stdout}${stderr}`.trim();
  return {
    version: output || null,
    error: error ? error.message : null,
  };
}

async function getNpmGlobalBin(
  npmPath: string | null,
  env?: NodeJS.ProcessEnv
) {
  if (!npmPath) {
    return null;
  }
  const { stdout } = await execFileWithOutput(npmPath, ["root", "-g"], { env });
  const root = stdout.trim();
  if (!root) {
    return null;
  }
  const libNodeModules = path.join("lib", "node_modules");
  if (root.endsWith(libNodeModules)) {
    return path.join(path.dirname(path.dirname(root)), "bin");
  }
  return path.join(root, "bin");
}

async function buildBinaryStatus(
  pathValue: string | null,
  versionArgs: string[],
  env?: NodeJS.ProcessEnv
): Promise<RuntimeBinaryStatus> {
  if (!pathValue) {
    return { found: false, path: null, version: null, error: "not-found" };
  }
  const { version, error } = await readVersion(pathValue, versionArgs, env);
  return {
    found: true,
    path: pathValue,
    version,
    error,
  };
}

export function getRuntimeStatus() {
  return runtimeStatus;
}

export async function refreshRuntimeStatus() {
  if (runtimeCheckPromise) {
    return runtimeCheckPromise;
  }
  runtimeCheckPromise = (async () => {
    const pathDirs = splitPathList(process.env.PATH);
    const standardDirs = getStandardBinDirs();
    const nvmDirs = getNvmBinDirs();
    const searchDirs = [...standardDirs, ...pathDirs, ...nvmDirs];

    const nodePath = findExecutable("node", searchDirs);
    const npxPath = findExecutable("npx", searchDirs);
    const npmPath = findExecutable("npm", searchDirs);

    // Build enriched PATH with discovered binary directories for subprocess execution
    // This fixes the issue where GUI apps on macOS don't inherit terminal PATH
    const enrichedPaths: string[] = [];
    if (nodePath) {
      enrichedPaths.push(path.dirname(nodePath));
    }
    if (npxPath) {
      enrichedPaths.push(path.dirname(npxPath));
    }
    if (npmPath) {
      enrichedPaths.push(path.dirname(npmPath));
    }
    const enrichedEnv: NodeJS.ProcessEnv = {
      ...process.env,
      PATH: mergePathList(enrichedPaths, process.env.PATH),
    };

    const npmGlobalBin = await getNpmGlobalBin(npmPath, enrichedEnv);

    const claudeCandidates = [
      path.join(os.homedir(), ".local", "bin", "claude"),
      path.join(os.homedir(), ".npm-global", "bin", "claude"),
      "/usr/local/bin/claude",
      "/opt/homebrew/bin/claude",
    ];
    if (npmGlobalBin) {
      claudeCandidates.unshift(path.join(npmGlobalBin, "claude"));
    }
    const claudePath =
      findExistingPath(claudeCandidates) ||
      findExecutable("claude", nvmDirs) ||
      findExecutable("claude", searchDirs);

    const nodeStatus = await buildBinaryStatus(
      nodePath,
      ["--version"],
      enrichedEnv
    );
    const npxStatus = await buildBinaryStatus(
      npxPath,
      ["--version"],
      enrichedEnv
    );
    const claudeStatus = await buildBinaryStatus(
      claudePath,
      ["--version"],
      enrichedEnv
    );

    runtimeStatus = {
      node: nodeStatus,
      npx: npxStatus,
      claude: claudeStatus,
      lastCheckedAt: new Date().toISOString(),
    };

    broadcastRuntimeStatus();
    return runtimeStatus;
  })();

  try {
    return await runtimeCheckPromise;
  } finally {
    runtimeCheckPromise = null;
  }
}

export function applyRuntimeEnv(
  env: NodeJS.ProcessEnv,
  status: RuntimeStatus
) {
  const extraPaths: string[] = [];
  if (status.node.path) {
    extraPaths.push(path.dirname(status.node.path));
  }
  if (status.npx.path) {
    extraPaths.push(path.dirname(status.npx.path));
  }
  if (status.claude.path) {
    env.CLAUDE_CODE_CLI_PATH = status.claude.path;
    extraPaths.push(path.dirname(status.claude.path));
  }
  if (extraPaths.length > 0) {
    env.PATH = mergePathList(extraPaths, env.PATH);
  }
  return env;
}
