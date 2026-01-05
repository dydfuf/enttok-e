from pydantic import BaseModel


class ActivityEvent(BaseModel):
    id: str
    source: str
    event_type: str
    title: str
    description: str | None = None
    url: str | None = None
    actor: str | None = None
    event_time: str


class ActivityEventsResponse(BaseModel):
    events: list[ActivityEvent]
