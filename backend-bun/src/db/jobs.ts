import { getDb } from "./connection.ts";
import { utcNow, generateId } from "../lib/time.ts";
import type { JobRecord } from "../schemas/jobs.ts";

interface JobRow {
  job_id: string;
  type: string;
  status: string;
  created_at: string;
  updated_at: string;
  progress: number | null;
  message: string | null;
  payload_json: string | null;
  result_json: string | null;
  error_json: string | null;
}

function rowToJob(row: JobRow): JobRecord {
  return {
    job_id: row.job_id,
    type: row.type,
    status: row.status,
    created_at: row.created_at,
    updated_at: row.updated_at,
    progress: row.progress,
    message: row.message,
    payload: row.payload_json ? JSON.parse(row.payload_json) : {},
    result: row.result_json ? JSON.parse(row.result_json) : null,
    error: row.error_json ? JSON.parse(row.error_json) : null,
  };
}

export function createJob(jobType: string, payload: Record<string, unknown> = {}): string {
  const jobId = generateId("job");
  const now = utcNow();

  const stmt = getDb().prepare(
    `INSERT INTO jobs (job_id, type, status, created_at, updated_at, progress, message, payload_json, result_json, error_json)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  stmt.run(jobId, jobType, "queued", now, now, null, null, JSON.stringify(payload), null, null);

  return jobId;
}

export function updateJob(
  jobId: string,
  fields: Partial<{
    status: string;
    progress: number;
    message: string;
    payload: Record<string, unknown>;
    result: Record<string, unknown>;
    error: Record<string, unknown>;
  }>
): void {
  if (Object.keys(fields).length === 0) return;

  const updates: string[] = ["updated_at = ?"];
  const values: unknown[] = [utcNow()];

  for (const [key, value] of Object.entries(fields)) {
    if (key === "payload" || key === "result" || key === "error") {
      updates.push(`${key}_json = ?`);
      values.push(value !== undefined ? JSON.stringify(value) : null);
    } else {
      updates.push(`${key} = ?`);
      values.push(value);
    }
  }

  values.push(jobId);
  const stmt = getDb().prepare(`UPDATE jobs SET ${updates.join(", ")} WHERE job_id = ?`);
  stmt.run(...(values as []));
}

export function fetchJob(jobId: string): JobRecord | null {
  const stmt = getDb().prepare<JobRow, [string]>("SELECT * FROM jobs WHERE job_id = ?");
  const row = stmt.get(jobId);
  return row ? rowToJob(row) : null;
}

export function fetchJobs(limit = 200): JobRecord[] {
  const stmt = getDb().prepare<JobRow, [number]>(
    "SELECT * FROM jobs ORDER BY created_at DESC LIMIT ?"
  );
  const rows = stmt.all(limit);
  return rows.map(rowToJob);
}

export function recordEvent(
  jobId: string,
  level: string,
  message: string,
  meta?: Record<string, unknown>
): void {
  const stmt = getDb().prepare(
    `INSERT INTO job_events (job_id, created_at, level, message, meta_json)
     VALUES (?, ?, ?, ?, ?)`
  );
  stmt.run(jobId, utcNow(), level, message, meta ? JSON.stringify(meta) : null);
}
