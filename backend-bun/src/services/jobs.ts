import * as jobsRepo from "../db/jobs.ts";
import { config } from "../lib/config.ts";
import type { JobRecord } from "../schemas/jobs.ts";
import { manager } from "../websocket/manager.ts";

// Simple in-memory queue
const jobQueue: string[] = [];
const activeJobs = new Set<string>();
const startedAt = Date.now();

// Job handlers registry
type JobHandler = (jobId: string, payload: Record<string, unknown>) => Promise<void>;
const jobHandlers = new Map<string, JobHandler>();

export function registerJobHandler(type: string, handler: JobHandler): void {
  jobHandlers.set(type, handler);
}

export function enqueueJob(jobId: string): void {
  jobQueue.push(jobId);
  // Process queue asynchronously
  setTimeout(() => processQueue(), 0);
}

async function processQueue(): Promise<void> {
  // Check if we have available workers
  if (activeJobs.size >= config.BACKEND_WORKERS) return;
  if (jobQueue.length === 0) return;

  const jobId = jobQueue.shift();
  if (!jobId) return;

  activeJobs.add(jobId);

  try {
    await processJob(jobId);
  } finally {
    activeJobs.delete(jobId);
    // Continue processing queue
    if (jobQueue.length > 0) {
      setTimeout(() => processQueue(), 0);
    }
  }
}

async function processJob(jobId: string): Promise<void> {
  const job = jobsRepo.fetchJob(jobId);
  if (!job) return;
  if (job.status === "canceled") return;

  // Check for registered handler
  const handler = jobHandlers.get(job.type);
  if (handler) {
    await handler(jobId, job.payload);
    return;
  }

  // Default job processing (simulation)
  jobsRepo.updateJob(jobId, { status: "running", progress: 0 });
  manager.emitJobStatus(jobId, "running");

  try {
    const payload = job.payload;
    const durationMs = (payload.simulate_ms as number) || 0;
    const duration = Math.max(0, durationMs / 1000);
    const steps = duration <= 0 ? 1 : Math.min(5, Math.max(1, Math.floor(duration / 0.2)));

    for (let step = 0; step < steps; step++) {
      if (duration > 0) {
        await Bun.sleep((duration / steps) * 1000);
      }

      // Check if canceled
      const currentJob = jobsRepo.fetchJob(jobId);
      if (currentJob?.status === "canceled") return;

      const progress = Math.round(((step + 1) / steps) * 100) / 100;
      jobsRepo.updateJob(jobId, { progress, message: `progress ${progress.toFixed(2)}` });
      manager.emitJobProgress(jobId, progress);
    }

    jobsRepo.updateJob(jobId, { status: "succeeded", progress: 1 });
    jobsRepo.recordEvent(jobId, "info", "job completed");
    manager.emitJobStatus(jobId, "succeeded");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    jobsRepo.updateJob(jobId, {
      status: "failed",
      error: { message: errorMessage },
    });
    jobsRepo.recordEvent(jobId, "error", "job failed", { error: errorMessage });
    manager.emitJobStatus(jobId, "failed");
  }
}

export function startWorkers(): void {
  console.log(`Started ${config.BACKEND_WORKERS} workers`);
}

export function statusSnapshot(): {
  uptime_sec: number;
  queue_depth: number;
  workers: { active: number; idle: number };
  scheduler: { running: boolean; jobs: number };
} {
  return {
    uptime_sec: Math.floor((Date.now() - startedAt) / 1000),
    queue_depth: jobQueue.length,
    workers: {
      active: activeJobs.size,
      idle: Math.max(config.BACKEND_WORKERS - activeJobs.size, 0),
    },
    scheduler: { running: false, jobs: 0 },
  };
}
