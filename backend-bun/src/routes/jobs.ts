import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import { authMiddleware, requireAuth } from "../middleware/auth.ts";
import * as jobsRepo from "../db/jobs.ts";
import { enqueueJob } from "../services/jobs.ts";
import { JobCreateSchema, type JobResponse, type JobRecord } from "../schemas/jobs.ts";
import type { Env } from "../lib/types.ts";

export const jobsRoutes = new Hono<Env>();

jobsRoutes.use("*", authMiddleware);
jobsRoutes.use("*", requireAuth);

jobsRoutes.post("/", zValidator("json", JobCreateSchema), (c) => {
  const body = c.req.valid("json");
  const jobId = jobsRepo.createJob(body.type, body.payload ?? {});
  enqueueJob(jobId);
  return c.json<JobResponse>({ job_id: jobId, status: "queued" });
});

jobsRoutes.get("/", (c) => {
  return c.json<{ jobs: JobRecord[] }>({ jobs: jobsRepo.fetchJobs() });
});

jobsRoutes.get(
  "/:jobId",
  zValidator("param", z.object({ jobId: z.string() })),
  (c) => {
    const { jobId } = c.req.valid("param");
    const job = jobsRepo.fetchJob(jobId);
    if (!job) {
      return c.json({ detail: "job not found" }, 404);
    }
    return c.json(job);
  }
);

jobsRoutes.post(
  "/:jobId/cancel",
  zValidator("param", z.object({ jobId: z.string() })),
  (c) => {
    const { jobId } = c.req.valid("param");
    const job = jobsRepo.fetchJob(jobId);
    if (!job) {
      return c.json({ detail: "job not found" }, 404);
    }

    if (job.status === "succeeded" || job.status === "failed") {
      return c.json({ job_id: jobId, status: job.status });
    }

    jobsRepo.updateJob(jobId, { status: "canceled" });
    jobsRepo.recordEvent(jobId, "info", "job canceled");

    return c.json({ job_id: jobId, status: "canceled" });
  }
);
