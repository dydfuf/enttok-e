import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { authMiddleware, requireAuth } from "../middleware/auth.ts";
import * as jobsRepo from "../db/jobs.ts";
import { enqueueJob } from "../services/jobs.ts";
import { createSession } from "../services/sessions.ts";
import { manager } from "../websocket/manager.ts";
import { ClaudeSpawnRequestSchema, type ClaudeSessionResponse } from "../schemas/claude.ts";
import type { JobResponse } from "../schemas/jobs.ts";
import type { Env } from "../lib/types.ts";

export const claudeRoutes = new Hono<Env>();

claudeRoutes.use("*", authMiddleware);
claudeRoutes.use("*", requireAuth);

claudeRoutes.post("/spawn", zValidator("json", ClaudeSpawnRequestSchema), (c) => {
  const body = c.req.valid("json");
  const payload = {
    args: body.args ?? [],
    prompt: body.prompt,
    stdin: body.stdin,
    session_id: body.session_id,
    timeout_ms: body.timeout_ms,
  };
  const jobId = jobsRepo.createJob("claude.spawn", payload);
  enqueueJob(jobId);
  manager.emitLog("info", `claude job queued ${jobId}`);
  return c.json<JobResponse>({ job_id: jobId, status: "queued" });
});

claudeRoutes.post("/session", (c) => {
  const sessionId = createSession();
  manager.emitLog("info", `claude session created ${sessionId}`);
  return c.json<ClaudeSessionResponse>({ session_id: sessionId });
});
