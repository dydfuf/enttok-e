from fastapi import APIRouter, Depends

from app.api.deps import verify_token
from app.db import jobs_repo
from app.schemas.claude import ClaudeSessionResponse, ClaudeSpawnRequest
from app.schemas.jobs import JobResponse
from app.services.jobs import enqueue_job
from app.services.sessions import create_session
from app.websocket.manager import manager

router = APIRouter(prefix="/claude")


@router.post("/spawn", response_model=JobResponse)
async def spawn_claude_api(
    request: ClaudeSpawnRequest, _: None = Depends(verify_token)
) -> JobResponse:
    payload = request.model_dump()
    job_id = await jobs_repo.create_job("claude.spawn", payload)
    await enqueue_job(job_id)
    await manager.emit_log("info", f"claude job queued {job_id}")
    return JobResponse(job_id=job_id, status="queued")


@router.post("/session", response_model=ClaudeSessionResponse)
async def create_claude_session(
    _: None = Depends(verify_token),
) -> ClaudeSessionResponse:
    session_id = await create_session()
    await manager.emit_log("info", f"claude session created {session_id}")
    return ClaudeSessionResponse(session_id=session_id)
