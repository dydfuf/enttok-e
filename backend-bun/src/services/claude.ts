import { $ } from "bun";
import * as jobsRepo from "../db/jobs.ts";
import { config } from "../lib/config.ts";
import { manager } from "../websocket/manager.ts";
import {
  getSessionMessages,
  appendSessionMessage,
  formatSessionPrompt,
} from "./sessions.ts";

function resolveClaudePath(): string | null {
  const cliPath = Bun.env.CLAUDE_CODE_CLI_PATH;
  if (cliPath && Bun.file(cliPath).size > 0) {
    return cliPath;
  }
  // Check if claude is in PATH
  try {
    const result = Bun.spawnSync(["which", "claude"]);
    if (result.exitCode === 0) {
      return result.stdout.toString().trim();
    }
  } catch {
    // Ignore errors
  }
  return null;
}

export async function runClaudeJob(
  jobId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const claudePath = resolveClaudePath();
  if (!claudePath) {
    jobsRepo.updateJob(jobId, {
      status: "failed",
      error: { message: "claude cli not found" },
    });
    jobsRepo.recordEvent(jobId, "error", "claude cli not found");
    manager.emitJobStatus(jobId, "failed");
    return;
  }

  const sessionId = payload.session_id as string | undefined;
  let args = (payload.args as string[]) || [];
  const rawPrompt = payload.prompt as string | undefined;
  let prompt = rawPrompt;

  if (sessionId && rawPrompt) {
    const history = getSessionMessages(sessionId);
    prompt = formatSessionPrompt(history, rawPrompt);
  }

  if (prompt && args.length === 0) {
    args = ["--print", prompt];
  }

  if (args.length === 0) {
    jobsRepo.updateJob(jobId, {
      status: "failed",
      error: { message: "no args provided for claude cli" },
    });
    jobsRepo.recordEvent(jobId, "error", "claude cli args missing");
    manager.emitJobStatus(jobId, "failed");
    return;
  }

  const timeoutMs = payload.timeout_ms as number | undefined;
  const timeoutSec = timeoutMs ? Math.max(timeoutMs / 1000, 1) : undefined;
  const stdinPayload = payload.stdin as string | undefined;

  jobsRepo.updateJob(jobId, { status: "running", progress: 0.05, message: "spawning" });
  manager.emitJobStatus(jobId, "running");

  const stdoutLines: string[] = [];
  const stderrLines: string[] = [];
  const started = Date.now();

  try {
    const proc = Bun.spawn([claudePath, ...args], {
      stdin: stdinPayload ? new TextEncoder().encode(stdinPayload) : undefined,
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env },
    });

    // Create timeout promise if needed
    let timeoutId: Timer | undefined;
    if (timeoutSec) {
      timeoutId = setTimeout(() => {
        proc.kill();
      }, timeoutSec * 1000);
    }

    // Wait for process to complete
    const exitCode = await proc.exited;
    if (timeoutId) clearTimeout(timeoutId);

    // Read output
    const stdoutText = await new Response(proc.stdout).text();
    const stderrText = await new Response(proc.stderr).text();

    for (const line of stdoutText.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        manager.emitLog("info", `claude: ${trimmed}`);
        stdoutLines.push(trimmed);
        if (stdoutLines.length > config.SESSION_OUTPUT_LINES) {
          stdoutLines.shift();
        }
      }
    }

    for (const line of stderrText.split("\n")) {
      const trimmed = line.trim();
      if (trimmed) {
        manager.emitLog("error", `claude: ${trimmed}`);
        stderrLines.push(trimmed);
        if (stderrLines.length > config.SESSION_OUTPUT_LINES) {
          stderrLines.shift();
        }
      }
    }

    const durationMs = Date.now() - started;
    const stdoutTail = stdoutLines.slice(-50);
    const stderrTail = stderrLines.slice(-50);

    if (exitCode === 0) {
      if (sessionId && rawPrompt) {
        const assistantOutput = stdoutLines.join("\n").trim();
        appendSessionMessage(sessionId, "user", rawPrompt);
        appendSessionMessage(sessionId, "assistant", assistantOutput);
      }

      jobsRepo.updateJob(jobId, {
        status: "succeeded",
        progress: 1,
        result: {
          exit_code: exitCode,
          duration_ms: durationMs,
          stdout_tail: stdoutTail,
          stderr_tail: stderrTail,
        },
      });
      jobsRepo.recordEvent(jobId, "info", "claude cli finished");
      manager.emitJobStatus(jobId, "succeeded");
    } else {
      jobsRepo.updateJob(jobId, {
        status: "failed",
        error: {
          message: "claude cli failed",
          exit_code: exitCode,
          stdout_tail: stdoutTail,
          stderr_tail: stderrTail,
        },
      });
      jobsRepo.recordEvent(jobId, "error", "claude cli failed");
      manager.emitJobStatus(jobId, "failed");
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);

    if (errorMessage === "timeout") {
      jobsRepo.updateJob(jobId, {
        status: "failed",
        error: { message: "claude cli timeout" },
      });
      jobsRepo.recordEvent(jobId, "error", "claude cli timeout");
    } else {
      jobsRepo.updateJob(jobId, {
        status: "failed",
        error: { message: errorMessage },
      });
      jobsRepo.recordEvent(jobId, "error", `claude cli error: ${errorMessage}`);
    }
    manager.emitJobStatus(jobId, "failed");
  }
}
