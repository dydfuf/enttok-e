import asyncio
from typing import Any, Dict

from app.db import calendar_repo, jobs_repo
from app.websocket.manager import manager

PROVIDER_LABELS = {
    "google": "Google Calendar",
    "apple": "Apple Calendar (CalDAV/iCloud)",
}


async def run_calendar_sync_job(job_id: str, payload: Dict[str, Any]) -> None:
    account_id = payload.get("account_id")
    cursor = payload.get("cursor")
    if not account_id:
        await jobs_repo.update_job(
            job_id,
            status="failed",
            error={"message": "account_id is required for calendar sync"},
        )
        await jobs_repo.record_event(job_id, "error", "calendar account missing")
        await manager.broadcast(
            {"type": "job.status", "job_id": job_id, "status": "failed"}
        )
        return

    account = await calendar_repo.fetch_account(account_id)
    if not account:
        await jobs_repo.update_job(
            job_id,
            status="failed",
            error={"message": "calendar account not found"},
        )
        await jobs_repo.record_event(job_id, "error", f"account {account_id} not found")
        await manager.broadcast(
            {"type": "job.status", "job_id": job_id, "status": "failed"}
        )
        return

    provider_label = PROVIDER_LABELS.get(account["provider"], account["provider"])
    await jobs_repo.update_job(
        job_id,
        status="running",
        progress=0.05,
        message=f"syncing {provider_label}",
    )
    await manager.broadcast(
        {"type": "job.status", "job_id": job_id, "status": "running"}
    )
    await jobs_repo.record_event(job_id, "info", f"calendar sync started for {account_id}")

    try:
        checkpoints = [
            (0.25, "discovery"),
            (0.5, "fetching events"),
            (0.75, "processing"),
            (1.0, "finalizing"),
        ]
        for progress, stage in checkpoints:
            await asyncio.sleep(payload.get("simulate_step_sec", 0.05))
            await jobs_repo.update_job(
                job_id,
                progress=progress,
                message=f"{stage} ({provider_label})",
            )
            await manager.broadcast(
                {
                    "type": "job.progress",
                    "job_id": job_id,
                    "progress": progress,
                    "stage": stage,
                }
            )

        last_sync_at = await calendar_repo.update_sync_state(account_id, cursor)
        await jobs_repo.update_job(
            job_id,
            status="succeeded",
            progress=1.0,
            result={
                "account_id": account_id,
                "provider": account["provider"],
                "synced_events": payload.get("synced_events", 0),
                "cursor": cursor,
                "last_sync_at": last_sync_at,
            },
        )
        await jobs_repo.record_event(job_id, "info", "calendar sync completed")
        await manager.broadcast(
            {"type": "job.status", "job_id": job_id, "status": "succeeded"}
        )
    except Exception as exc:  # pragma: no cover - safety guard
        await jobs_repo.update_job(
            job_id,
            status="failed",
            error={"message": str(exc)},
        )
        await jobs_repo.record_event(
            job_id, "error", "calendar sync failed", {"error": str(exc)}
        )
        await manager.broadcast(
            {"type": "job.status", "job_id": job_id, "status": "failed"}
        )
