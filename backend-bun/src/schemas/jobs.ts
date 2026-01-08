import { z } from "zod";

// Request schemas
export const JobCreateSchema = z.object({
  type: z.string().min(1),
  payload: z.record(z.string(), z.unknown()).optional(),
});

export type JobCreateInput = z.infer<typeof JobCreateSchema>;

// Response types
export interface JobResponse {
  job_id: string;
  status: string;
}

export interface JobRecord {
  job_id: string;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
  progress: number | null;
  message: string | null;
  payload: Record<string, unknown>;
  result: Record<string, unknown> | null;
  error: Record<string, unknown> | null;
}

// Job status enum
export const JobStatus = {
  QUEUED: "queued",
  RUNNING: "running",
  SUCCEEDED: "succeeded",
  FAILED: "failed",
  CANCELED: "canceled",
} as const;

export type JobStatusType = (typeof JobStatus)[keyof typeof JobStatus];
