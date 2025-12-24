"""Calendar sync service with actual Google Calendar integration."""

from typing import Any, Dict

from app.db import calendar_repo, jobs_repo
from app.services.google_calendar import fetch_calendar_events
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

    # Get existing sync token for incremental sync
    sync_cursor = account.get("sync_cursor")

    # Progress: Fetching events
    await jobs_repo.update_job(
        job_id,
        progress=0.2,
        message=f"Fetching events from {provider_label}",
    )
    await manager.broadcast({
        "type": "job.progress",
        "job_id": job_id,
        "progress": 0.2,
        "stage": "fetching",
    })

    # Fetch events from Google Calendar API
    result = await fetch_calendar_events(account, sync_token=sync_cursor)
    events = result["events"]
    next_sync_token = result.get("next_sync_token")

    # Progress: Processing events
    await jobs_repo.update_job(
        job_id,
        progress=0.7,
        message=f"Processing {len(events)} events",
    )
    await manager.broadcast({
        "type": "job.progress",
        "job_id": job_id,
        "progress": 0.7,
        "stage": "processing",
    })

    # Update sync state with new token
    last_sync_at = await calendar_repo.update_sync_state(account_id, next_sync_token)

    # Progress: Completed
    await jobs_repo.update_job(
        job_id,
        status="succeeded",
        progress=1.0,
        message=f"Synced {len(events)} events",
        result={
            "account_id": account_id,
            "provider": "google",
            "synced_events": len(events),
            "cursor": next_sync_token,
            "last_sync_at": last_sync_at,
            "events": events,  # Include events in result for debugging
        },
    )
    await jobs_repo.record_event(
        job_id, "info", f"Synced {len(events)} events from Google Calendar"
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
    await manager.broadcast({"type": "job.status", "job_id": job_id, "status": "failed"})
