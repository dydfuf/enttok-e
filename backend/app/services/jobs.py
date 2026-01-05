import asyncio
import time
from typing import Any, Dict

from app.core.config import BACKEND_WORKERS
from app.db import jobs_repo
from app.services.calendar import run_calendar_sync_job
from app.services.claude import run_claude_job
from app.services.confluence import run_confluence_sync_job
from app.services.jira import run_jira_sync_job
from app.websocket.manager import manager

job_queue: asyncio.Queue[str] = asyncio.Queue()
active_jobs: set[str] = set()
started_at = time.time()


async def start_workers() -> None:
    for worker_id in range(BACKEND_WORKERS):
        asyncio.create_task(worker_loop(worker_id))


async def enqueue_job(job_id: str) -> None:
    await job_queue.put(job_id)


async def process_job(job_id: str) -> None:
    job = await jobs_repo.fetch_job(job_id)
    if not job:
        return
    if job["status"] == "canceled":
        return

    if job["type"] == "claude.spawn":
        await run_claude_job(job_id, job.get("payload", {}))
        return

    if job["type"] == "connector.calendar.sync":
        await run_calendar_sync_job(job_id, job.get("payload", {}))
        return
    if job["type"] == "connector.jira.sync":
        await run_jira_sync_job(job_id, job.get("payload", {}))
        return
    if job["type"] == "connector.confluence.sync":
        await run_confluence_sync_job(job_id, job.get("payload", {}))
        return

    await jobs_repo.update_job(job_id, status="running", progress=0.0)
    await manager.broadcast(
        {"type": "job.status", "job_id": job_id, "status": "running"}
    )

    try:
        payload = job.get("payload", {})
        duration_ms = payload.get("simulate_ms", 0)
        duration = max(0.0, float(duration_ms) / 1000.0)
        steps = 1 if duration <= 0 else min(5, max(1, int(duration / 0.2)))
        for step in range(steps):
            if duration > 0:
                await asyncio.sleep(duration / steps)
            progress = round((step + 1) / steps, 2)
            await jobs_repo.update_job(
                job_id, progress=progress, message=f"progress {progress:.2f}"
            )
            await manager.broadcast(
                {
                    "type": "job.progress",
                    "job_id": job_id,
                    "progress": progress,
                }
            )

        await jobs_repo.update_job(job_id, status="succeeded", progress=1.0)
        await jobs_repo.record_event(job_id, "info", "job completed")
        await manager.broadcast(
            {"type": "job.status", "job_id": job_id, "status": "succeeded"}
        )
    except Exception as exc:  # pragma: no cover - safety net
        await jobs_repo.update_job(
            job_id,
            status="failed",
            error={"message": str(exc)},
        )
        await jobs_repo.record_event(job_id, "error", "job failed", {"error": str(exc)})
        await manager.broadcast(
            {"type": "job.status", "job_id": job_id, "status": "failed"}
        )


async def worker_loop(worker_id: int) -> None:
    await manager.emit_log("info", f"worker {worker_id} ready")
    while True:
        job_id = await job_queue.get()
        active_jobs.add(job_id)
        try:
            job = await jobs_repo.fetch_job(job_id)
            if not job or job["status"] == "canceled":
                await manager.emit_log("info", f"job {job_id} canceled")
            else:
                await process_job(job_id)
        finally:
            active_jobs.discard(job_id)
            job_queue.task_done()


def status_snapshot() -> Dict[str, Any]:
    return {
        "uptime_sec": int(time.time() - started_at),
        "queue_depth": job_queue.qsize(),
        "workers": {
            "active": len(active_jobs),
            "idle": max(BACKEND_WORKERS - len(active_jobs), 0),
        },
        "scheduler": {"running": False, "jobs": 0},
    }
