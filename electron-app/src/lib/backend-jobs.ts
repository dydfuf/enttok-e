import { requireElectronAPI } from "@/lib/electron";

export type BackendJobStatus =
	| "queued"
	| "running"
	| "succeeded"
	| "failed"
	| "canceled";

export type BackendJobRecord = {
	job_id: string;
	status: BackendJobStatus;
	message?: string | null;
	error?: { message?: string } | null;
};

export type WaitForJobOptions = {
	pollMs?: number;
	timeoutMs?: number;
};

export async function waitForBackendJob(
	jobId: string,
	options: WaitForJobOptions = {},
): Promise<BackendJobRecord> {
	const api = requireElectronAPI();
	const pollMs = options.pollMs ?? 1200;
	const timeoutMs = options.timeoutMs ?? 180000;
	const startedAt = Date.now();

	while (Date.now() - startedAt < timeoutMs) {
		const job = (await api.getJob(jobId)) as BackendJobRecord;
		if (job.status === "succeeded") {
			return job;
		}
		if (job.status === "failed" || job.status === "canceled") {
			throw new Error(job.error?.message || job.message || "Sync failed");
		}
		await new Promise((resolve) => setTimeout(resolve, pollMs));
	}
	throw new Error("Sync timed out");
}
