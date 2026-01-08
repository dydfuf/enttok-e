import * as jobsRepo from "../../db/jobs.ts";
import * as calendarRepo from "../../db/calendar.ts";
import * as googleCalendar from "./google.ts";
import { manager } from "../../websocket/manager.ts";

export async function runCalendarSyncJob(
  jobId: string,
  payload: Record<string, unknown>
): Promise<void> {
  const accountId = payload.account_id as string;

  // Validate account exists
  const account = calendarRepo.fetchAccount(accountId);
  if (!account) {
    jobsRepo.updateJob(jobId, {
      status: "failed",
      error: { message: "Account not found" },
    });
    jobsRepo.recordEvent(jobId, "error", "Account not found");
    manager.emitJobStatus(jobId, "failed");
    return;
  }

  if (account.provider !== "google") {
    jobsRepo.updateJob(jobId, {
      status: "failed",
      error: { message: `Unsupported provider: ${account.provider}` },
    });
    manager.emitJobStatus(jobId, "failed");
    return;
  }

  jobsRepo.updateJob(jobId, { status: "running", progress: 0.05, message: "Starting sync" });
  manager.emitJobStatus(jobId, "running");

  try {
    // Step 1: Fetch and sync calendars (10-15%)
    jobsRepo.updateJob(jobId, { progress: 0.1, message: "Fetching calendars" });

    const calendars = await googleCalendar.listCalendars(accountId);
    const calendarIds: string[] = [];

    for (const cal of calendars) {
      calendarRepo.upsertCalendar(accountId, cal.calendar_id, {
        provider: "google",
        name: cal.name,
        description: cal.description,
        is_primary: cal.is_primary,
        access_role: cal.access_role,
        background_color: cal.background_color,
        foreground_color: cal.foreground_color,
        time_zone: cal.time_zone,
      });
      calendarIds.push(cal.calendar_id);
    }

    // Prune calendars no longer in Google
    calendarRepo.pruneCalendars(accountId, calendarIds);

    // Step 2: Fetch events for each calendar (15-80%)
    const selectedCalendars = calendarRepo.fetchCalendars(accountId, true);
    const totalCalendars = selectedCalendars.length;
    let syncedEvents = 0;

    for (let i = 0; i < totalCalendars; i++) {
      const calendar = selectedCalendars[i];
      if (!calendar) continue;

      const progress = 0.15 + (0.65 * (i / Math.max(totalCalendars, 1)));
      jobsRepo.updateJob(jobId, { progress, message: `Syncing ${calendar.name}` });

      const connector = `calendar:${accountId}:${calendar.calendar_id}`;
      const syncState = calendarRepo.fetchSyncState(connector);

      // Determine sync strategy
      let timeMin: string | undefined;
      let timeMax: string | undefined;
      let syncToken: string | undefined;

      if (syncState?.cursor) {
        // Incremental sync
        syncToken = syncState.cursor;
      } else {
        // Full sync - 30 days back, 90 days forward
        const now = new Date();
        const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
        timeMin = past.toISOString();
        timeMax = future.toISOString();
      }

      try {
        const result = await googleCalendar.listEvents(accountId, calendar.calendar_id, {
          syncToken,
          timeMin,
          timeMax,
          calendarTz: calendar.time_zone,
        });

        // Handle sync token expired (result.events empty and no nextSyncToken)
        if (syncToken && result.events.length === 0 && !result.nextSyncToken) {
          // Retry with full sync
          const now = new Date();
          const past = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          const future = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

          const fullResult = await googleCalendar.listEvents(accountId, calendar.calendar_id, {
            timeMin: past.toISOString(),
            timeMax: future.toISOString(),
            calendarTz: calendar.time_zone,
          });

          for (const event of fullResult.events) {
            calendarRepo.upsertEvent(accountId, calendar.calendar_id, event.event_id, event);
            syncedEvents++;
          }

          if (fullResult.nextSyncToken) {
            calendarRepo.upsertSyncState(connector, fullResult.nextSyncToken);
          }
        } else {
          // Delete cancelled events
          for (const eventId of result.deletedEventIds) {
            calendarRepo.deleteEvent(accountId, calendar.calendar_id, eventId);
          }

          // Upsert events
          for (const event of result.events) {
            calendarRepo.upsertEvent(accountId, calendar.calendar_id, event.event_id, event);
            syncedEvents++;
          }

          // Update sync state
          if (result.nextSyncToken) {
            calendarRepo.upsertSyncState(connector, result.nextSyncToken);
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error syncing calendar ${calendar.calendar_id}: ${errorMessage}`);
        // Continue with other calendars
      }
    }

    // Update account-level sync state
    calendarRepo.upsertSyncState(`calendar:${accountId}`, null);

    // Complete
    jobsRepo.updateJob(jobId, {
      status: "succeeded",
      progress: 1,
      result: {
        account_id: accountId,
        provider: account.provider,
        synced_calendars: totalCalendars,
        synced_events: syncedEvents,
      },
    });
    jobsRepo.recordEvent(jobId, "info", "Calendar sync completed");
    manager.emitJobStatus(jobId, "succeeded");
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    jobsRepo.updateJob(jobId, {
      status: "failed",
      error: { message: errorMessage },
    });
    jobsRepo.recordEvent(jobId, "error", `Calendar sync failed: ${errorMessage}`);
    manager.emitJobStatus(jobId, "failed");
  }
}
