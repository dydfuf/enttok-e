import { app, BrowserWindow } from "electron";
import { spawn, type ChildProcessWithoutNullStreams } from "child_process";
import fs from "fs";
import path from "path";
import { getBackendBaseDir } from "../paths.js";
import { applyRuntimeEnv, refreshRuntimeStatus } from "./runtime.js";

type McpStatus = "stopped" | "starting" | "running" | "stopping" | "error";

type McpState = {
  status: McpStatus;
  pid: number | null;
  startedAt: number | null;
  lastExitCode: number | null;
  lastSignal: NodeJS.Signals | null;
  lastError: string | null;
  // MCP connection info for Claude Code
  serverCommand: string | null;
  serverArgs: string[] | null;
  serverCwd: string | null;
};

type McpLogLevel = "info" | "warn" | "error";

let mcpProcess: ChildProcessWithoutNullStreams | null = null;
let mcpState: McpState = {
  status: "stopped",
  pid: null,
  startedAt: null,
  lastExitCode: null,
  lastSignal: null,
  lastError: null,
  serverCommand: null,
  serverArgs: null,
  serverCwd: null,
};
let mcpStartPromise: Promise<McpState> | null = null;

function broadcastMcpStatus() {
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("mcp:status", mcpState);
  }
}

function emitMcpLog(level: McpLogLevel, message: string) {
  if (!message.trim()) {
    return;
  }
  const payload = {
    level,
    message,
    timestamp: new Date().toISOString(),
  };
  for (const window of BrowserWindow.getAllWindows()) {
    window.webContents.send("mcp:log", payload);
  }
}

function updateMcpState(partial: Partial<McpState>) {
  mcpState = { ...mcpState, ...partial };
  broadcastMcpStatus();
}

function streamLogs(stream: NodeJS.ReadableStream, level: McpLogLevel) {
  let buffer = "";
  stream.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      emitMcpLog(level, line);
    }
  });
  stream.on("end", () => {
    if (buffer) {
      emitMcpLog(level, buffer);
    }
  });
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getMcpCommand() {
  const baseDir = getBackendBaseDir();
  if (!app.isPackaged) {
    return {
      command: "uv",
      args: ["run", "python", "-m", "app.mcp.server"],
      cwd: baseDir,
    };
  }
  // For packaged app, use the bundled Python
  const pythonPath = path.join(baseDir, "venv", "bin", "python");
  return {
    command: pythonPath,
    args: ["-m", "app.mcp.server"],
    cwd: baseDir,
  };
}

export function getMcpState() {
  return mcpState;
}

export function getMcpConnectionInfo() {
  // Return info needed to configure Claude Code MCP settings
  const { command, args, cwd } = getMcpCommand();
  return {
    command,
    args,
    cwd,
    isRunning: mcpState.status === "running",
  };
}

export async function startMcp() {
  if (mcpState.status === "running" || mcpState.status === "starting") {
    return mcpState;
  }
  if (mcpStartPromise) {
    return mcpStartPromise;
  }

  mcpStartPromise = (async () => {
    const { command, args, cwd } = getMcpCommand();

    updateMcpState({
      status: "starting",
      startedAt: Date.now(),
      lastError: null,
      serverCommand: command,
      serverArgs: args,
      serverCwd: cwd,
    });

    if (!fs.existsSync(cwd)) {
      const message = `MCP server directory not found: ${cwd}`;
      emitMcpLog("error", message);
      updateMcpState({ status: "error", lastError: message });
      return mcpState;
    }

    emitMcpLog("info", `MCP server spawn: ${command} ${args.join(" ")}`);

    const runtime = await refreshRuntimeStatus();
    const env = applyRuntimeEnv(
      {
        ...process.env,
        PYTHONUNBUFFERED: "1",
      },
      runtime
    );

    mcpProcess = spawn(command, args, {
      cwd,
      env,
      shell: process.platform === "win32",
      // MCP uses stdio for communication, but we capture stderr for logs
      stdio: ["pipe", "pipe", "pipe"],
    });

    // MCP server communicates via stdio, but stderr is for logs
    streamLogs(mcpProcess.stderr, "info");

    mcpProcess.on("exit", (code, signal) => {
      mcpProcess = null;
      updateMcpState({
        status: "stopped",
        pid: null,
        startedAt: null,
        lastExitCode: code,
        lastSignal: signal,
      });
    });

    mcpProcess.on("error", (error) => {
      emitMcpLog("error", `MCP server error: ${error.message}`);
      updateMcpState({
        status: "error",
        lastError: error.message,
      });
    });

    updateMcpState({ pid: mcpProcess.pid ?? null });

    // MCP server is ready immediately after spawn (stdio-based)
    // Give it a moment to initialize
    await delay(500);

    if (mcpProcess && !mcpProcess.killed) {
      updateMcpState({ status: "running" });
      emitMcpLog("info", "MCP server started successfully");
    } else {
      updateMcpState({ status: "error", lastError: "process-exited" });
    }

    return mcpState;
  })();

  try {
    return await mcpStartPromise;
  } finally {
    mcpStartPromise = null;
  }
}

export async function stopMcp() {
  if (!mcpProcess) {
    updateMcpState({
      status: "stopped",
      pid: null,
      startedAt: null,
    });
    return mcpState;
  }

  updateMcpState({ status: "stopping" });
  mcpProcess.kill("SIGTERM");

  const timeoutMs = 3000;
  const startedAt = Date.now();
  while (mcpProcess && Date.now() - startedAt < timeoutMs) {
    await delay(200);
  }

  if (mcpProcess) {
    mcpProcess.kill("SIGKILL");
  }

  updateMcpState({
    status: "stopped",
    pid: null,
    startedAt: null,
  });

  emitMcpLog("info", "MCP server stopped");
  return mcpState;
}
