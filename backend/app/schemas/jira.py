from typing import Any, Dict, Optional

from pydantic import BaseModel, Field


class JiraDebugRequest(BaseModel):
    account_id: str = Field(min_length=1)


class JiraDebugRequestInfo(BaseModel):
    url: str
    method: str
    params: Optional[Dict[str, str]] = None
    body: Optional[Dict[str, Any]] = None


class JiraDebugResponseInfo(BaseModel):
    status: int
    ok: bool
    body: Optional[Any] = None
    error: Optional[str] = None


class JiraDebugAttempt(BaseModel):
    request: JiraDebugRequestInfo
    response: JiraDebugResponseInfo


class JiraDebugResponse(BaseModel):
    account_id: str
    primary: JiraDebugAttempt
    fallback: Optional[JiraDebugAttempt] = None
