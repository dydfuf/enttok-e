from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class JobCreate(BaseModel):
    type: str = Field(..., min_length=1)
    payload: Dict[str, Any] = Field(default_factory=dict)


class JobResponse(BaseModel):
    job_id: str
    status: str


class JobRecord(BaseModel):
    job_id: str
    type: str
    status: str
    created_at: str
    updated_at: str
    progress: Optional[float] = None
    message: Optional[str] = None
    payload: Dict[str, Any] = Field(default_factory=dict)
    result: Optional[Dict[str, Any]] = None
    error: Optional[Dict[str, Any]] = None

