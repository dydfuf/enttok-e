from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import verify_token
from app.db import atlassian_repo
from app.schemas.activity import ActivityEvent, ActivityEventsResponse
from app.utils.time import parse_iso_to_epoch

router = APIRouter(prefix="/activity")


@router.get("/events", response_model=ActivityEventsResponse)
async def list_activity_events(
    start: str,
    end: str,
    sources: str | None = None,
    limit: int = 200,
    _: None = Depends(verify_token),
) -> ActivityEventsResponse:
    try:
        start_ts = parse_iso_to_epoch(start)
        end_ts = parse_iso_to_epoch(end)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    if start_ts > end_ts:
        raise HTTPException(status_code=400, detail="start must be before end")

    source_list = [value for value in sources.split(",") if value] if sources else None
    events = await atlassian_repo.list_events(
        start_ts=start_ts, end_ts=end_ts, sources=source_list, limit=limit
    )
    return ActivityEventsResponse(
        events=[
            ActivityEvent(
                id=event["event_id"],
                source=event["source"],
                event_type=event["event_type"],
                title=event["title"],
                description=event.get("description"),
                url=event.get("url"),
                actor=event.get("actor"),
                event_time=event["event_time"],
            )
            for event in events
        ]
    )
