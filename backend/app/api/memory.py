"""REST API endpoints for memory system."""

import time
from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import verify_token
from app.db import memory_repo, jobs_repo
from app.services import search as search_service
from app.services import memory as memory_service
from app.services.jobs import enqueue_job
from app.schemas.memory import (
    ObservationCreate,
    Observation,
    ObservationSummary,
    SearchRequest,
    SearchResponse,
    TimelineRequest,
    TimelineResponse,
    MemoryStats,
    BatchObservationsRequest,
    SyncTriggerResponse,
)
from app.utils.time import parse_iso_to_ts

router = APIRouter(prefix="/memory", tags=["memory"])


@router.post("/observations", response_model=dict)
async def create_observation(
    data: ObservationCreate,
    _: None = Depends(verify_token),
) -> dict:
    """Create a new observation manually."""
    event_ts = data.event_ts
    if event_ts is None:
        event_ts = parse_iso_to_ts(data.event_time)

    observation_id = await memory_service.create_observation(
        title=data.title,
        narrative=data.narrative,
        type=data.type,
        source=data.source,
        event_time=data.event_time,
        event_ts=event_ts,
        facts=data.facts,
        concepts=data.concepts,
        source_event_id=data.source_event_id,
        project_path=data.project_path,
    )

    return {"observation_id": observation_id, "created": True}


@router.get("/observations/{observation_id}", response_model=Observation)
async def get_observation(
    observation_id: str,
    _: None = Depends(verify_token),
) -> Observation:
    """Get full observation details by ID."""
    obs = await memory_repo.fetch_observation(observation_id)
    if not obs:
        raise HTTPException(status_code=404, detail="Observation not found")

    return Observation(
        observation_id=obs["observation_id"],
        title=obs["title"],
        narrative=obs["narrative"],
        facts=obs.get("facts"),
        concepts=obs.get("concepts"),
        type=obs["type"],
        source=obs["source"],
        source_event_id=obs.get("source_event_id"),
        project_path=obs.get("project_path"),
        event_time=obs["event_time"],
        event_ts=obs["event_ts"],
        created_at=obs["created_at"],
        updated_at=obs["updated_at"],
        chroma_synced=obs.get("chroma_synced", False),
    )


@router.post("/observations/batch", response_model=list[Observation])
async def get_observations_batch(
    data: BatchObservationsRequest,
    _: None = Depends(verify_token),
) -> list[Observation]:
    """Batch fetch multiple observations by IDs."""
    observations = await memory_repo.fetch_observations(data.ids)

    return [
        Observation(
            observation_id=obs["observation_id"],
            title=obs["title"],
            narrative=obs["narrative"],
            facts=obs.get("facts"),
            concepts=obs.get("concepts"),
            type=obs["type"],
            source=obs["source"],
            source_event_id=obs.get("source_event_id"),
            project_path=obs.get("project_path"),
            event_time=obs["event_time"],
            event_ts=obs["event_ts"],
            created_at=obs["created_at"],
            updated_at=obs["updated_at"],
            chroma_synced=obs.get("chroma_synced", False),
        )
        for obs in observations
    ]


@router.delete("/observations/{observation_id}")
async def delete_observation(
    observation_id: str,
    _: None = Depends(verify_token),
) -> dict:
    """Delete an observation."""
    obs = await memory_repo.fetch_observation(observation_id)
    if not obs:
        raise HTTPException(status_code=404, detail="Observation not found")

    await memory_repo.delete_observation(observation_id)
    return {"deleted": True, "observation_id": observation_id}


@router.get("/observations", response_model=list[ObservationSummary])
async def list_observations(
    type: str | None = None,
    source: str | None = None,
    days_back: int = 90,
    limit: int = 50,
    offset: int = 0,
    _: None = Depends(verify_token),
) -> list[ObservationSummary]:
    """List observation summaries with optional filters."""
    end_ts = int(time.time() * 1000)
    start_ts = end_ts - (days_back * 24 * 60 * 60 * 1000)

    observations = await memory_repo.list_observation_summaries(
        start_ts=start_ts,
        end_ts=end_ts,
        type_filter=type,
        source_filter=source,
        limit=min(limit, 100),
        offset=offset,
    )

    return [
        ObservationSummary(
            observation_id=obs["observation_id"],
            title=obs["title"],
            type=obs["type"],
            source=obs["source"],
            event_time=obs["event_time"],
        )
        for obs in observations
    ]


@router.post("/search", response_model=SearchResponse)
async def search_memory(
    data: SearchRequest,
    _: None = Depends(verify_token),
) -> SearchResponse:
    """Search observations with hybrid search."""
    result = await search_service.search(
        query=data.query,
        limit=data.limit,
        type_filter=data.type,
        source_filter=data.source,
        days_back=data.days_back,
        search_mode=data.search_mode,
    )

    return SearchResponse(
        results=[
            ObservationSummary(
                observation_id=r["observation_id"],
                title=r["title"],
                type=r["type"],
                source=r["source"],
                event_time=r["event_time"],
                relevance_score=r.get("relevance_score"),
            )
            for r in result["results"]
        ],
        total_count=result["total_count"],
        search_mode=result["search_mode"],
        query=result["query"],
    )


@router.post("/timeline", response_model=TimelineResponse)
async def get_timeline(
    data: TimelineRequest,
    _: None = Depends(verify_token),
) -> TimelineResponse:
    """Get temporal context around a point in time."""
    result = await search_service.get_timeline(
        anchor_id=data.anchor_id,
        anchor_date=data.anchor_date,
        depth_before=data.depth_before,
        depth_after=data.depth_after,
    )

    return TimelineResponse(
        observations=[
            ObservationSummary(
                observation_id=obs["observation_id"],
                title=obs["title"],
                type=obs["type"],
                source=obs["source"],
                event_time=obs["event_time"],
            )
            for obs in result["observations"]
        ],
        anchor_ts=result.get("anchor_ts"),
    )


@router.get("/stats", response_model=MemoryStats)
async def get_stats(
    _: None = Depends(verify_token),
) -> MemoryStats:
    """Get memory system statistics."""
    stats = await search_service.get_stats()

    return MemoryStats(
        total_observations=stats["total_observations"],
        observations_by_type=stats["by_type"],
        observations_by_source=stats["by_source"],
        chroma_synced=stats.get("chroma_synced", 0),
        pending_sync=stats["pending_chroma_sync"],
        chroma_available=stats.get("chroma_available", False),
        chroma_collection_count=stats.get("chroma_count", 0),
    )


@router.post("/sync/process", response_model=SyncTriggerResponse)
async def trigger_process_events(
    window_minutes: int = 60,
    _: None = Depends(verify_token),
) -> SyncTriggerResponse:
    """Trigger processing of recent events into observations."""
    job_id = await jobs_repo.create_job(
        "memory.process_events",
        {"window_minutes": window_minutes},
    )
    await enqueue_job(job_id)

    return SyncTriggerResponse(
        job_id=job_id,
        message=f"Processing events from last {window_minutes} minutes",
    )


@router.post("/sync/chroma", response_model=SyncTriggerResponse)
async def trigger_chroma_sync(
    _: None = Depends(verify_token),
) -> SyncTriggerResponse:
    """Trigger synchronization of observations to ChromaDB."""
    job_id = await jobs_repo.create_job(
        "memory.chroma_sync",
        {},
    )
    await enqueue_job(job_id)

    return SyncTriggerResponse(
        job_id=job_id,
        message="ChromaDB sync started",
    )


@router.post("/sync/github")
async def sync_github_activity(
    data: dict,
    _: None = Depends(verify_token),
) -> dict:
    """
    Sync GitHub activity to memory.

    Expected data format:
    {
        "prs": {
            "authored": [...],
            "reviewed": [...]
        },
        "commits": [...]
    }
    """
    prs = data.get("prs", {})
    prs_authored = prs.get("authored", [])
    prs_reviewed = prs.get("reviewed", [])
    commits = data.get("commits", [])

    results = await memory_service.batch_process_github(
        prs_authored=prs_authored,
        prs_reviewed=prs_reviewed,
        commits=commits,
    )

    return {
        "success": True,
        "processed": results,
        "total": sum(results.values()),
    }


@router.post("/sync/claude-sessions")
async def sync_claude_sessions(
    data: dict,
    _: None = Depends(verify_token),
) -> dict:
    """
    Sync Claude Code sessions to memory.

    Expected data format:
    {
        "sessions": [...]
    }
    """
    sessions = data.get("sessions", [])

    count = await memory_service.batch_process_claude_sessions(sessions)

    return {
        "success": True,
        "processed": count,
    }
