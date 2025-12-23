from typing import List, Optional

from pydantic import BaseModel, Field


class ClaudeSpawnRequest(BaseModel):
    args: List[str] = Field(default_factory=list)
    prompt: Optional[str] = None
    stdin: Optional[str] = None
    session_id: Optional[str] = None
    timeout_ms: Optional[int] = None


class ClaudeSessionResponse(BaseModel):
    session_id: str

