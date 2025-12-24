"""Calendar sync service with actual Google Calendar integration."""

from typing import Any, Dict

from app.db import calendar_repo, jobs_repo
from app.services.google_calendar import fetch_calendar_events, fetch_calendars
from app.websocket.manager import manager

PROVIDER_LABELS = {
    "google": "Google Calendar",
    "apple": "Apple Calendar (CalDAV/iCloud)",
}


async def run_calendar_sync_job(job_id: str, payload: Dict[str, Any]) -> None:
    """Run calendar sync job for any provider."""
    account_id = payload.get("account_id")
    if not account_id:
        await _fail_job(job_id, "account_id is required for calendar sync")
        return

    account = await calendar_repo.fetch_account(account_id)
    if not account:
        await _fail_job(job_id, f"calendar account not found: {account_id}")
        return

    provider = account["provider"]
    provider_label = PROVIDER_LABELS.get(provider, provider)

    await jobs_repo.update_job(
        job_id,
        status="running",
        progress=0.1,
        message=f"Starting sync with {provider_label}",
    )
    await manager.broadcast({"type": "job.status", "job_id": job_id, "status": "running"})
    await jobs_repo.record_event(job_id, "info", f"calendar sync started for {account_id}")

    try:
        if provider == "google":
            await _sync_google_calendar(job_id, account)
        elif provider == "apple":
            await _fail_job(job_id, "Apple Calendar sync not yet implemented")
            return
        else:
            await _fail_job(job_id, f"Unknown provider: {provider}")
            return
    except Exception as exc:
        await _fail_job(job_id, str(exc))


async def _sync_google_calendar(job_id: str, account: Dict[str, Any]) -> None:
    """Perform Google Calendar sync."""
    account_id = account["account_id"]
    provider_label = PROVIDER_LABELS["google"]

    # Step 1: Fetch calendar list
    await jobs_repo.update_job(
        job_id,
        progress=0.15,
        message=f"Fetching calendars from {provider_label}",
    )
    await manager.broadcast(
        {
            "type": "job.progress",
            "job_id": job_id,
            "progress": 0.15,
            "stage": "fetching_calendars",
        }
    )

    calendars = await fetch_calendars(account)
    await calendar_repo.upsert_calendars(account_id, account["provider"], calendars)
    await calendar_repo.prune_calendars(
        account_id, [calendar["calendar_id"] for calendar in calendars]
    )

    if not calendars:
        await jobs_repo.update_job(
            job_id,
            status="succeeded",
            progress=1.0,
            message="No calendars found to sync",
            result={"account_id": account_id, "provider": "google", "synced_events": 0},
        )
        await manager.broadcast(
            {"type": "job.status", "job_id": job_id, "status": "succeeded"}
        )
        return

    total_calendars = len(calendars)
    total_events = 0

    # Step 2: Fetch events for each calendar
    for index, calendar in enumerate(calendars, start=1):
        calendar_id = calendar["calendar_id"]
        sync_state = await calendar_repo.fetch_calendar_sync_state(
            account_id, calendar_id
        )
        sync_cursor = sync_state["cursor"] if sync_state else None

        await jobs_repo.update_job(
            job_id,
            progress=0.2 + (index - 1) / total_calendars * 0.6,
            message=f"Fetching events ({index}/{total_calendars})",
        )
        await manager.broadcast(
            {
                "type": "job.progress",
                "job_id": job_id,
                "progress": 0.2 + (index - 1) / total_calendars * 0.6,
                "stage": "fetching_events",
            }
        )

        result = await fetch_calendar_events(
            account,
            calendar_id=calendar_id,
            calendar_timezone=calendar.get("time_zone"),
            sync_token=sync_cursor,
        )
        events = result["events"]
        next_sync_token = result.get("next_sync_token")

        if result.get("full_sync") and result.get("time_min") and result.get("time_max"):
            start_ts = int(result["time_min"].timestamp())
            end_ts = int(result["time_max"].timestamp())
            await calendar_repo.delete_events_in_range(
                account_id, calendar_id, start_ts, end_ts
            )

        cancelled_ids = [
            event["event_id"] for event in events if event.get("status") == "cancelled"
        ]
        active_events = [
            event
            for event in events
            if event.get("status") != "cancelled"
            and event.get("start_ts") is not None
            and event.get("end_ts") is not None
        ]

        if cancelled_ids:
            await calendar_repo.delete_events(account_id, calendar_id, cancelled_ids)
        if active_events:
            await calendar_repo.upsert_events(account_id, calendar_id, active_events)

        total_events += len(active_events)

        await calendar_repo.update_calendar_sync_state(
            account_id, calendar_id, next_sync_token
        )

        await jobs_repo.update_job(
            job_id,
            progress=0.2 + index / total_calendars * 0.6,
            message=f"Processed {len(active_events)} events",
        )

    # Progress: Completed
    await jobs_repo.update_job(
        job_id,
        status="succeeded",
        progress=1.0,
        message=f"Synced {total_events} events across {total_calendars} calendars",
        result={
            "account_id": account_id,
            "provider": "google",
            "synced_events": total_events,
            "synced_calendars": total_calendars,
        },
    )
    await jobs_repo.record_event(
        job_id, "info", f"Synced {total_events} events from Google Calendar"
    )
    await manager.broadcast({"type": "job.status", "job_id": job_id, "status": "succeeded"})


async def _fail_job(job_id: str, message: str) -> None:
    """Mark job as failed with error message."""
    await jobs_repo.update_job(
        job_id,
        status="failed",
        error={"message": message},
    )
    await jobs_repo.record_event(job_id, "error", message)
    await manager.emit_log("error", f"calendar sync failed: {message} (job_id={job_id})")
    await manager.broadcast({"type": "job.status", "job_id": job_id, "status": "failed"})
