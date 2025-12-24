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
    created_at: Optional[str] = None
    updated_at: Optional[str] = None
    last_sync_at: Optional[str] = None
    sync_cursor: Optional[str] = None


class CalendarAccountsResponse(BaseModel):
    accounts: List[CalendarAccount]


class ProvidersResponse(BaseModel):
    providers: List[CalendarProviderInfo]


# OAuth Flow Schemas
class OAuthStartResponse(BaseModel):
    auth_url: str
    state: str
    redirect_uri: str
    port: int


class OAuthCallbackRequest(BaseModel):
    code: str
    state: str


class OAuthCompleteResponse(BaseModel):
    account: CalendarAccount
    success: bool
    message: str


# Calendar Event Schema
class CalendarEvent(BaseModel):
    account_id: str
    event_id: str
    calendar_id: str
    title: str
    description: Optional[str] = None
    start_time: str
    end_time: str
    start_ts: int
    end_ts: int
    all_day: bool = False
    location: Optional[str] = None
    conference_url: Optional[str] = None
    visibility: Optional[str] = None
    status: str  # "confirmed", "tentative", "cancelled"
    organizer: Optional[Dict[str, Any]] = None
    attendees: Optional[List[Dict[str, Any]]] = None
    html_link: Optional[str] = None
    time_zone: Optional[str] = None
    created_at: str
    updated_at: str
    calendar_color: Optional[str] = None
    calendar_name: Optional[str] = None


class CalendarEventsResponse(BaseModel):
    events: List[CalendarEvent]


class CalendarListItem(BaseModel):
    account_id: str
    calendar_id: str
    provider: CalendarProvider
    name: str
    description: Optional[str] = None
    is_primary: bool = False
    access_role: Optional[str] = None
    background_color: Optional[str] = None
    foreground_color: Optional[str] = None
    time_zone: Optional[str] = None
    selected: bool = True
    created_at: str
    updated_at: str


class CalendarListResponse(BaseModel):
    calendars: List[CalendarListItem]


class CalendarSelectionUpdate(BaseModel):
    selected: bool
