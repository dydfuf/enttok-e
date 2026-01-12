"""Pydantic models for memory system."""

from pydantic import BaseModel, Field


class ObservationBase(BaseModel):
    """Base fields for observation."""

    title: str
    narrative: str
    type: str = Field(description="meeting, task, decision, note, activity")
    source: str = Field(description="calendar, jira, confluence, manual")
    event_time: str


class ObservationCreate(ObservationBase):
    """Request model for creating an observation."""

    facts: list[str] | None = None
    concepts: list[str] | None = None
    source_event_id: str | None = None
    project_path: str | None = None
    event_ts: int | None = Field(
        default=None, description="Unix timestamp, auto-generated if not provided"
    )


class ObservationSummary(BaseModel):
    """Compact representation for list results (progressive disclosure layer 1)."""

    observation_id: str
    title: str
    type: str
    source: str
    event_time: str
    relevance_score: float | None = None


class SearchResultItem(BaseModel):
    """Search result item with snippet for display."""

    observation_id: str
    title: str
    snippet: str
    type: str
    source: str
    event_time: str
    score: float


class Observation(ObservationBase):
    """Full observation detail (progressive disclosure layer 2)."""

    observation_id: str
    facts: list[str] | None = None
    concepts: list[str] | None = None
    source_event_id: str | None = None
    project_path: str | None = None
    event_ts: int
    created_at: str
    updated_at: str
    chroma_synced: bool = False


class SearchRequest(BaseModel):
    """Request model for hybrid search."""

    query: str
    type: str | None = Field(default=None, description="Filter by observation type")
    source: str | None = Field(default=None, description="Filter by source")
    limit: int = Field(default=20, ge=1, le=100)
    days_back: int = Field(default=90, ge=1, le=365)
    search_mode: str = Field(
        default="hybrid", description="hybrid, fts, or vector"
    )


class SearchResponse(BaseModel):
    """Response model for search."""

    results: list[SearchResultItem]
    total: int
    mode: str
    query: str


class TimelineRequest(BaseModel):
    """Request model for timeline query."""

    anchor_id: str | None = Field(
        default=None, description="Observation ID to anchor timeline"
    )
    anchor_date: str | None = Field(
        default=None, description="ISO date to anchor timeline"
    )
    depth_before: int = Field(default=5, ge=0, le=50)
    depth_after: int = Field(default=5, ge=0, le=50)


class TimelineResponse(BaseModel):
    """Response model for timeline query."""

    observations: list[ObservationSummary]
    anchor_ts: int | None = None


class MemoryStats(BaseModel):
    """Statistics about the memory system."""

    total_observations: int
    observations_by_type: dict[str, int]
    observations_by_source: dict[str, int]
    chroma_synced: int
    pending_sync: int
    chroma_available: bool
    chroma_collection_count: int


class BatchObservationsRequest(BaseModel):
    """Request model for batch observation fetch."""

    ids: list[str] = Field(min_length=1, max_length=50)


class SyncTriggerResponse(BaseModel):
    """Response model for sync trigger."""

    job_id: str
    message: str
