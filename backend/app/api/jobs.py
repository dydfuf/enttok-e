from typing import Any, Dict

from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import verify_token
from app.db import jobs_repo
from app.schemas.jobs import JobCreate, JobResponse
from app.services.jobs import enqueue_job
from app.websocket.manager import manager

router = APIRouter()


@router.post("/jobs", response_model=JobResponse)
async def create_job_api(
    request: JobCreate, _: None = Depends(verify_token)
) -> JobResponse:
    job_id = await jobs_repo.create_job(request.type, request.payload)
    await enqueue_job(job_id)
    await manager.emit_log("info", f"job queued {job_id} ({request.type})")
    return JobResponse(job_id=job_id, status="queued")


@router.get("/jobs")
async def list_jobs(_: None = Depends(verify_token)) -> Dict[str, Any]:
    return {"jobs": await jobs_repo.fetch_jobs()}


@router.get("/jobs/{job_id}")
async def get_job(job_id: str, _: None = Depends(verify_token)) -> Dict[str, Any]:
    job = await jobs_repo.fetch_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    return job


@router.post("/jobs/{job_id}/cancel")
async def cancel_job(job_id: str, _: None = Depends(verify_token)) -> Dict[str, Any]:
    job = await jobs_repo.fetch_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="job not found")
    if job["status"] in {"succeeded", "failed"}:
        return {"job_id": job_id, "status": job["status"]}
    await jobs_repo.update_job(job_id, status="canceled")
    await jobs_repo.record_event(job_id, "info", "job canceled")
    await manager.broadcast({"type": "job.status", "job_id": job_id, "status": "canceled"})
    return {"job_id": job_id, "status": "canceled"}
