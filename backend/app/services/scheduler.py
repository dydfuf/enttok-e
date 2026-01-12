import asyncio
import time
from typing import Optional

from app.db import atlassian_repo, jobs_repo
from app.services.jobs import enqueue_job
from app.utils.time import parse_iso_to_epoch
from app.websocket.manager import manager

POLL_INTERVAL_SEC = 600
MEMORY_PROCESS_INTERVAL_SEC = 3600  # 1 hour

_scheduler_task: Optional[asyncio.Task] = None
_memory_scheduler_task: Optional[asyncio.Task] = None
_last_memory_process_time: float = 0


def _is_due(last_sync_at: Optional[str]) -> bool:
    if not last_sync_at:
        return True
    try:
        last_ts = parse_iso_to_epoch(last_sync_at)
    except ValueError:
        return True
    return (time.time() - last_ts) >= POLL_INTERVAL_SEC


async def _queue_sync_jobs() -> None:
    for service in ("jira", "confluence"):
        accounts = await atlassian_repo.list_accounts(service=service, public=False)
        for account in accounts:
            if not _is_due(account.get("last_sync_at")):
                continue
            job_id = await jobs_repo.create_job(
                f"connector.{service}.sync", {"account_id": account["account_id"]}
            )
            await enqueue_job(job_id)
            await manager.emit_log(
                "info", f"{service} sync queued {account['account_id']}"
            )


async def _scheduler_loop() -> None:
    await manager.emit_log("info", "atlassian scheduler started")
    while True:
        try:
            await _queue_sync_jobs()
        except Exception as exc:
            await manager.emit_log("error", f"atlassian scheduler error: {exc}")
        await asyncio.sleep(POLL_INTERVAL_SEC)


async def _queue_memory_jobs() -> None:
    """Queue memory processing jobs."""
    global _last_memory_process_time

    current_time = time.time()
    if current_time - _last_memory_process_time < MEMORY_PROCESS_INTERVAL_SEC:
        return

    _last_memory_process_time = current_time

    # Process events from last hour
    job_id = await jobs_repo.create_job(
        "memory.process_events",
        {"window_minutes": 60},
    )
    await enqueue_job(job_id)
    await manager.emit_log("info", f"memory process job queued: {job_id}")

    # Sync to ChromaDB
    chroma_job_id = await jobs_repo.create_job(
        "memory.chroma_sync",
        {},
    )
    await enqueue_job(chroma_job_id)
    await manager.emit_log("info", f"chroma sync job queued: {chroma_job_id}")


async def _memory_scheduler_loop() -> None:
    """Memory processing scheduler loop."""
    await manager.emit_log("info", "memory scheduler started")
    while True:
        try:
            await _queue_memory_jobs()
        except Exception as exc:
            await manager.emit_log("error", f"memory scheduler error: {exc}")
        await asyncio.sleep(POLL_INTERVAL_SEC)


async def start_scheduler() -> None:
    global _scheduler_task, _memory_scheduler_task
    if _scheduler_task and not _scheduler_task.done():
        pass
    else:
        _scheduler_task = asyncio.create_task(_scheduler_loop())

    if _memory_scheduler_task and not _memory_scheduler_task.done():
        pass
    else:
        _memory_scheduler_task = asyncio.create_task(_memory_scheduler_loop())
