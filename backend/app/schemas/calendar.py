from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, EmailStr, Field


class CalendarProvider(str, Enum):
    google = "google"
    apple = "apple"


class CalendarProviderInfo(BaseModel):
    id: CalendarProvider
    label: str
    auth_method: str
    scopes: List[str] = Field(default_factory=list)
    notes: Optional[str] = None


class CalendarAccountCreate(BaseModel):
    provider: CalendarProvider
    display_name: Optional[str] = None
    email: Optional[EmailStr] = None
    credentials: Dict[str, Any] = Field(
        default_factory=dict,
        description="Provider-specific auth payload (OAuth tokens or CalDAV password).",
    )
    config: Dict[str, Any] = Field(
        default_factory=dict,
        description="Additional configuration such as server URLs or selected calendars.",
    )


class CalendarAccount(BaseModel):
    account_id: str
    provider: CalendarProvider
    display_name: Optional[str] = None
    email: Optional[EmailStr] = None
    connected: bool
    created_at: str
    updated_at: str
    last_sync_at: Optional[str] = None
    sync_cursor: Optional[str] = None


class CalendarAccountsResponse(BaseModel):
    accounts: List[CalendarAccount]


class ProvidersResponse(BaseModel):
    providers: List[CalendarProviderInfo]
