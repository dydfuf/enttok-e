import { app, BrowserWindow } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import crypto from "crypto";
import fs from "fs";
import http from "http";
import net from "net";
import path from "path";
import { applyRuntimeEnv, refreshRuntimeStatus } from "./runtime.js";
import { getBackendBaseDir, getBackendPythonPath } from "../paths.js";

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

function ensureBackendDirs() {
  const baseDir = path.join(app.getPath("userData"), "backend");
  const dataDir = path.join(baseDir, "data");
  const logDir = path.join(baseDir, "logs");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(logDir, { recursive: true });
  return { baseDir, dataDir, logDir };
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

function streamLogs(stream: NodeJS.ReadableStream, level: BackendLogLevel) {
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

function checkBackendHealth(port: number, token: string, timeoutMs = 800) {
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

export function getBackendState() {
  return backendState;
}

export async function startBackend() {
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

export async function stopBackend() {
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

export async function healthCheck() {
  if (!backendState.port || !backendState.token) {
    return { healthy: false };
  }
  const healthy = await checkBackendHealth(
    backendState.port,
    backendState.token
  );
  return { healthy };
}

export function requestBackendJson(
  method: string,
  requestPath: string,
  body?: Record<string, unknown>
) {
  const { port, token } = backendState;
  if (!port || !token) {
    return Promise.reject(new Error("backend not running"));
  }

  const payload = body ? JSON.stringify(body) : null;

  return new Promise<unknown>((resolve, reject) => {
    const req = http.request(
      {
        hostname: "127.0.0.1",
        port,
        path: requestPath,
        method,
        headers: {
          "Content-Type": "application/json",
          "X-Backend-Token": token,
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
