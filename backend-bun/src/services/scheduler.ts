/**
 * Background scheduler for automatic sync jobs
 * Polls Atlassian accounts every 10 minutes and enqueues sync jobs if due
 */

import * as atlassianRepo from "../db/atlassian.ts";
import * as jobsRepo from "../db/jobs.ts";
import { enqueueJob } from "./jobs.ts";
import { manager } from "../websocket/manager.ts";

// Poll interval: 10 minutes
const POLL_INTERVAL_MS = 10 * 60 * 1000;

let schedulerRunning = false;
let schedulerTimeout: Timer | null = null;

/**
 * Check if an account is due for sync based on last sync time
 */
function isDue(connector: string): boolean {
  const syncState = atlassianRepo.fetchSyncState(connector);

  // No previous sync - due immediately
  if (!syncState?.last_sync_at) {
    return true;
  }

  const lastSyncTs = new Date(syncState.last_sync_at).getTime();
  const elapsed = Date.now() - lastSyncTs;

  return elapsed >= POLL_INTERVAL_MS;
}

/**
 * Queue sync jobs for all due accounts
 */
async function runSchedulerCycle(): Promise<void> {
  const services: Array<"jira" | "confluence"> = ["jira", "confluence"];

  for (const service of services) {
    const accounts = atlassianRepo.fetchAtlassianAccounts(service);

    for (const account of accounts) {
      const connector = `${service}:${account.account_id}`;

      if (isDue(connector)) {
        const jobType = `connector.${service}.sync`;
        const payload = { account_id: account.account_id };

        const jobId = jobsRepo.createJob(jobType, payload);
        enqueueJob(jobId);

        manager.emitLog("info", `Scheduler: queued ${service} sync for ${account.org}`);
      }
    }
  }
}

/**
 * Main scheduler loop
 */
async function schedulerLoop(): Promise<void> {
  while (schedulerRunning) {
    try {
      await runSchedulerCycle();
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      manager.emitLog("error", `Scheduler error: ${errorMessage}`);
    }

    // Wait for next cycle
    await new Promise<void>((resolve) => {
      schedulerTimeout = setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }
}

/**
 * Start the background scheduler
 */
export function startScheduler(): void {
  if (schedulerRunning) {
    console.log("Scheduler already running");
    return;
  }

  schedulerRunning = true;
  console.log(`Scheduler started (interval: ${POLL_INTERVAL_MS / 1000}s)`);

  // Start async loop (don't await)
  schedulerLoop();
}

/**
 * Stop the background scheduler
 */
export function stopScheduler(): void {
  schedulerRunning = false;

  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout);
    schedulerTimeout = null;
  }

  console.log("Scheduler stopped");
}

/**
 * Get scheduler status
 */
export function getSchedulerStatus(): { running: boolean; interval_ms: number } {
  return {
    running: schedulerRunning,
    interval_ms: POLL_INTERVAL_MS,
  };
}
