import { app, BrowserWindow, ipcMain } from "electron";
import { execFile, spawn, type ChildProcessWithoutNullStreams } from "child_process";
import crypto from "crypto";
import fs from "fs";
import http from "http";
import net from "net";
import os from "os";
import path from "path";
import { fileURLToPath } from "url";
import {
  readFile,
  writeFile,
  showOpenDialog,
  showSaveDialog,
  showSelectFolderDialog,
  listMarkdownFiles,
  createNote,
  getNotePath,
  getDailyNotePath,
  createDailyNote,
  listDailyNoteDates,
} from "./file-handlers.js";
import {
  getCurrentVaultPath,
  setCurrentVaultPath,
  clearCurrentVaultPath,
  getRecentVaults,
  removeFromRecentVaults,
} from "./store.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const isDev = process.env.NODE_ENV === "development";

type BackendStatus = "stopped" | "starting" | "running" | "stopping" | "error";

type BackendState = {
  status: BackendStatus;
  pid: number | null;
  port: number | null;
  token: string | null;
  startedAt: number | null;
  lastExitCode: number | null;
  lastSignal: NodeJS.Signals | null;
  lastError: string | null;
};

type BackendLogLevel = "info" | "warn" | "error";

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

let backendProcess: ChildProcessWithoutNullStreams | null = null;
let backendState: BackendState = {
  status: "stopped",
  pid: null,
  port: null,
  token: null,
  startedAt: null,
  lastExitCode: null,
  lastSignal: null,
  lastError: null,
};
let backendStartPromise: Promise<BackendState> | null = null;

let runtimeStatus: RuntimeStatus = {
  node: { found: false, path: null, version: null, error: null },
  npx: { found: false, path: null, version: null, error: null },
  claude: { found: false, path: null, version: null, error: null },
  lastCheckedAt: null,
};
let runtimeCheckPromise: Promise<RuntimeStatus> | null = null;

function broadcastBackendStatus() {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("backend:status", backendState);
  }
}

function emitBackendLog(level: BackendLogLevel, message: string) {
  if (!message.trim()) {
    return;
  }
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("backend:log", payload);
  }
}

function updateBackendState(partial: Partial<BackendState>) {
  backendState = { ...backendState, ...partial };
  broadcastBackendStatus();
}

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
  timeoutMs = 2000
) {
  return new Promise<{
    stdout: string;
    stderr: string;
    error: Error | null;
  }>((resolve) => {
    execFile(command, args, { timeout: timeoutMs }, (error, stdout, stderr) => {
      resolve({
        stdout: stdout?.toString() ?? "",
        stderr: stderr?.toString() ?? "",
        error: error ?? null,
      });
    });
  });
}

async function readVersion(command: string, args: string[]) {
  const { stdout, stderr, error } = await execFileWithOutput(command, args);
  const output = `${stdout}${stderr}`.trim();
  return {
    version: output || null,
    error: error ? error.message : null,
  };
}

async function getNpmGlobalBin(npmPath: string | null) {
  if (!npmPath) {
    return null;
  }
  const { stdout } = await execFileWithOutput(npmPath, ["root", "-g"]);
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
  versionArgs: string[]
): Promise<RuntimeBinaryStatus> {
  if (!pathValue) {
    return { found: false, path: null, version: null, error: "not-found" };
  }
  const { version, error } = await readVersion(pathValue, versionArgs);
  return {
    found: true,
    path: pathValue,
    version,
    error,
  };
}

async function refreshRuntimeStatus() {
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
    const npmGlobalBin = await getNpmGlobalBin(npmPath);

    const claudeCandidates = [
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

    const nodeStatus = await buildBinaryStatus(nodePath, ["--version"]);
    const npxStatus = await buildBinaryStatus(npxPath, ["--version"]);
    const claudeStatus = await buildBinaryStatus(claudePath, ["--version"]);

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

function applyRuntimeEnv(
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

function ensureBackendDirs() {
  const baseDir = path.join(app.getPath("userData"), "backend");
  const dataDir = path.join(baseDir, "data");
  const logDir = path.join(baseDir, "logs");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  return { baseDir, dataDir, logDir };
}

function getBackendBaseDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "backend");
  }
  const repoRoot = path.resolve(__dirname, "../../..");
  const repoBackend = path.join(repoRoot, "backend");
  if (fs.existsSync(repoBackend)) {
    return repoBackend;
  }
  return path.resolve(app.getAppPath(), "..", "backend");
}

function getBackendPythonPath(baseDir: string) {
  if (process.platform === "win32") {
    return path.join(baseDir, ".venv", "Scripts", "python.exe");
  }
  return path.join(baseDir, ".venv", "bin", "python");
}

function getBackendCommand() {
  const baseDir = getBackendBaseDir();
  if (!app.isPackaged) {
    return {
      command: "uv",
      args: ["run", "python", "-m", "app.main"],
      cwd: baseDir,
    };
  }
  return {
    command: getBackendPythonPath(baseDir),
    args: ["-m", "app.main"],
    cwd: baseDir,
  };
}

function streamLogs(
  stream: NodeJS.ReadableStream,
  level: BackendLogLevel
) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      emitBackendLog(level, line);
    }
  });
  stream.on("end", () => {
    if (buffer) {
      emitBackendLog(level, buffer);
    }
  });
}

function getAvailablePort() {
  return new Promise<number>((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (address && typeof address === "object") {
        const port = address.port;
        server.close(() => resolve(port));
      } else {
        server.close(() => reject(new Error("Failed to allocate port")));
      }
    });
  });
}

function checkBackendHealth(
  port: number,
  token: string,
  timeoutMs = 800
) {
  return new Promise<boolean>((resolve) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: "/health",
        method: "GET",
        headers: {
          "X-Backend-Token": token,
        },
        timeout: timeoutMs,
      },
      (res) => {
        res.resume();
        resolve(res.statusCode === 200);
      }
    );
    req.on("timeout", () => {
      req.destroy();
      resolve(false);
    });
    req.on("error", () => resolve(false));
    req.end();
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForBackendReady(port: number, token: string) {
  const startedAt = Date.now();
  const timeoutMs = 10000;
  while (Date.now() - startedAt < timeoutMs) {
    if (await checkBackendHealth(port, token)) {
      return true;
    }
    await delay(250);
  }
  return false;
}

async function startBackend() {
  if (backendState.status === "running" || backendState.status === "starting") {
    return backendState;
  }
  if (backendStartPromise) {
    return backendStartPromise;
  }

  backendStartPromise = (async () => {
    const { dataDir, logDir } = ensureBackendDirs();
    const port = await getAvailablePort();
    const token = crypto.randomBytes(24).toString("hex");
    updateBackendState({
      status: "starting",
      port,
      token,
      startedAt: Date.now(),
      lastError: null,
    });

    const { command, args, cwd } = getBackendCommand();
    if (!fs.existsSync(cwd)) {
      const message = `backend directory not found: ${cwd}`;
      emitBackendLog("error", message);
      updateBackendState({ status: "error", lastError: message });
      return backendState;
    }
    if (app.isPackaged && !fs.existsSync(command)) {
      const message = `backend python not found: ${command}`;
      emitBackendLog("error", message);
      updateBackendState({ status: "error", lastError: message });
      return backendState;
    }
    emitBackendLog("info", `backend spawn: ${command} ${args.join(" ")}`);

    const runtime = await refreshRuntimeStatus();
    const env = applyRuntimeEnv(
      {
        ...process.env,
        BACKEND_PORT: String(port),
        BACKEND_TOKEN: token,
        APP_DATA_DIR: dataDir,
        LOG_DIR: logDir,
        RUN_ENV: app.isPackaged ? "prod" : "dev",
        PYTHONUNBUFFERED: "1",
      },
      runtime
    );

    backendProcess = spawn(command, args, {
      cwd,
      env,
      shell: process.platform === "win32",
    });

    streamLogs(backendProcess.stdout, "info");
    streamLogs(backendProcess.stderr, "error");

    backendProcess.on("exit", (code, signal) => {
      backendProcess = null;
      updateBackendState({
        status: "stopped",
        pid: null,
        port: null,
        token: null,
        startedAt: null,
        lastExitCode: code,
        lastSignal: signal,
      });
    });

    backendProcess.on("error", (error) => {
      emitBackendLog("error", `backend error: ${error.message}`);
      updateBackendState({
        status: "error",
        lastError: error.message,
      });
    });

    updateBackendState({ pid: backendProcess.pid ?? null });

    const ready = await waitForBackendReady(port, token);
    if (!ready) {
      emitBackendLog("warn", "backend health check timed out");
      updateBackendState({ status: "error", lastError: "healthcheck-timeout" });
      backendProcess?.kill("SIGTERM");
      return backendState;
    }

    updateBackendState({ status: "running" });
    return backendState;
  })();

  try {
    return await backendStartPromise;
  } finally {
    backendStartPromise = null;
  }
}

async function stopBackend() {
  if (!backendProcess) {
    updateBackendState({
      status: "stopped",
      pid: null,
      port: null,
      token: null,
      startedAt: null,
    });
    return backendState;
  }
  updateBackendState({ status: "stopping" });
  backendProcess.kill("SIGTERM");

  const timeoutMs = 5000;
  const startedAt = Date.now();
  while (backendProcess && Date.now() - startedAt < timeoutMs) {
    await delay(200);
  }

  if (backendProcess) {
    backendProcess.kill("SIGKILL");
  }

  updateBackendState({
    status: "stopped",
    pid: null,
    port: null,
    token: null,
    startedAt: null,
  });
  return backendState;
}

async function healthCheck() {
  if (!backendState.port || !backendState.token) {
    return { healthy: false };
  }
  const healthy = await checkBackendHealth(
    backendState.port,
    backendState.token
  );
  return { healthy };
}

function requestBackendJson(
  method: string,
  requestPath: string,
  body?: Record<string, unknown>
) {
  if (!backendState.port || !backendState.token) {
    return Promise.reject(new Error("backend not running"));
  }

  const payload = body ? JSON.stringify(body) : null;

  return new Promise<unknown>((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port: backendState.port,
        path: requestPath,
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Backend-Token": backendState.token,
          ...(payload ? { "Content-Length": Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = "";
        res.on("data", (chunk) => {
          data += chunk.toString();
        });
        res.on("end", () => {
          if (res.statusCode && res.statusCode >= 400) {
            reject(new Error(`backend error ${res.statusCode}: ${data}`));
            return;
          }
          if (!data) {
            resolve(null);
            return;
          }
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    req.on("error", reject);
    if (payload) {
      req.write(payload);
    }
    req.end();
  });
}

function createWindow() {
  const isMac = process.platform === "darwin";

  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    titleBarStyle: isMac ? "hiddenInset" : undefined,
    titleBarOverlay: isMac
      ? {
          color: "#00000000",
          symbolColor: "#ffffff",
          height: 32,
        }
      : undefined,
    trafficLightPosition: isMac ? { x: 12, y: 12 } : undefined,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
    },
  });

  if (isDev) {
    // 개발 모드: Vite 개발 서버 로드
    mainWindow.loadURL("http://localhost:5173");
    mainWindow.webContents.openDevTools();
  } else {
    // 프로덕션: 빌드된 파일 로드
    mainWindow.loadFile(path.join(__dirname, "../../dist-react/index.html"));
  }
}

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

app.on("before-quit", async () => {
  await stopBackend();
});

// IPC Handlers for file operations
ipcMain.handle("file:read", (_, filePath: string) => readFile(filePath));
ipcMain.handle("file:write", (_, filePath: string, content: string) =>
  writeFile(filePath, content)
);
ipcMain.handle("file:open-dialog", () => showOpenDialog());
ipcMain.handle("file:save-dialog", (_, defaultPath?: string) =>
  showSaveDialog(defaultPath)
);

// IPC Handlers for vault/notes operations
ipcMain.handle("vault:select-folder", () => showSelectFolderDialog());
ipcMain.handle("vault:list-notes", (_, folderPath: string) =>
  listMarkdownFiles(folderPath)
);
ipcMain.handle("vault:create-note", (_, folderPath: string, title: string) =>
  createNote(folderPath, title)
);
ipcMain.handle("vault:get-note-path", (_, folderPath: string, noteId: string) =>
  getNotePath(folderPath, noteId)
);

// IPC Handlers for daily notes
ipcMain.handle("daily:get-path", (_, vaultPath: string, date: string) =>
  getDailyNotePath(vaultPath, date)
);
ipcMain.handle("daily:create", (_, vaultPath: string, date: string) =>
  createDailyNote(vaultPath, date)
);
ipcMain.handle("daily:list-dates", (_, vaultPath: string) =>
  listDailyNoteDates(vaultPath)
);

// IPC Handlers for vault store
ipcMain.handle("store:get-current-vault", () => getCurrentVaultPath());
ipcMain.handle("store:set-current-vault", (_, vaultPath: string) => {
  setCurrentVaultPath(vaultPath);
  return { success: true };
});
ipcMain.handle("store:clear-current-vault", () => {
  clearCurrentVaultPath();
  return { success: true };
});
ipcMain.handle("store:get-recent-vaults", () => getRecentVaults());
ipcMain.handle("store:remove-recent-vault", (_, vaultPath: string) => {
  removeFromRecentVaults(vaultPath);
  return { success: true };
});

// IPC Handlers for backend operations
ipcMain.handle("backend:start", () => startBackend());
ipcMain.handle("backend:stop", () => stopBackend());
ipcMain.handle("backend:status", () => backendState);
ipcMain.handle("backend:health", () => healthCheck());

// IPC Handlers for runtime dependency checks
ipcMain.handle("runtime:check", () => refreshRuntimeStatus());
ipcMain.handle("runtime:status", () => runtimeStatus);

// IPC Handlers for Claude jobs
ipcMain.handle("claude:spawn", async (_event, payload: Record<string, unknown>) =>
  requestBackendJson("POST", "/claude/spawn", payload)
);
ipcMain.handle("backend:job", async (_event, jobId: string) =>
  requestBackendJson("GET", `/jobs/${jobId}`)
);
ipcMain.handle("claude:session", async () =>
  requestBackendJson("POST", "/claude/session")
);
