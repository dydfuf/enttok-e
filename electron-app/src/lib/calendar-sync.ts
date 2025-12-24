import type { CalendarAccount } from "@/lib/calendar-api";
import { waitForBackendJob } from "@/lib/backend-jobs";

export type TriggerSync = (accountId: string) => Promise<{ job_id: string }>;

export type SyncSummary = {
	completed: number;
	failed: number;
	failures: SyncFailure[];
};

export type SyncFailure = {
	accountId: string;
	message: string;
};

export function getStaleAccountIds(
	accounts: CalendarAccount[],
	staleMs: number,
): string[] {
	const now = Date.now();
	return accounts
		.filter((account) => {
			if (!account.last_sync_at) {
				return true;
			}
			const lastSync = new Date(account.last_sync_at).getTime();
			if (Number.isNaN(lastSync)) {
				return true;
			}
			return now - lastSync > staleMs;
		})
		.map((account) => account.account_id);
}

export async function syncCalendarAccounts(
	accountIds: string[],
	triggerSync: TriggerSync,
): Promise<SyncSummary> {
	if (!accountIds.length) {
		return { completed: 0, failed: 0, failures: [] };
	}

	const results = await Promise.allSettled(
		accountIds.map(async (accountId) => {
			const { job_id } = await triggerSync(accountId);
			await waitForBackendJob(job_id);
			return accountId;
		}),
	);

	const failures: SyncFailure[] = [];
	results.forEach((result, index) => {
		if (result.status === "rejected") {
			const reason = result.reason;
			const message =
				reason instanceof Error
					? reason.message
					: typeof reason === "string"
						? reason
						: "동기화 실패";
			failures.push({ accountId: accountIds[index], message });
		}
	});
	const failed = failures.length;
	return { completed: results.length - failed, failed, failures };
}
