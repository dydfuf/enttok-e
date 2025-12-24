"""Google Calendar API client for fetching events."""

import asyncio
from datetime import date as date_cls
from datetime import datetime, time as time_cls, timedelta, timezone
from typing import Any, Dict, List, Optional
from zoneinfo import ZoneInfo

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.core.config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
from app.db import calendar_repo
from app.services.google_oauth import GOOGLE_TOKEN_URI, refresh_access_token

# Scopes for read-only calendar access
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]


def _parse_expires_at(value: Optional[str]) -> Optional[datetime]:
    if not value:
        return None
    normalized = value.replace("Z", "+00:00") if value.endswith("Z") else value
    try:
        dt = datetime.fromisoformat(normalized)
    except ValueError:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _compute_expires_at(expires_in: Optional[int]) -> Optional[str]:
    if not expires_in:
        return None
    return (
        datetime.now(timezone.utc) + timedelta(seconds=int(expires_in))
    ).isoformat().replace("+00:00", "Z")


def _needs_refresh(expires_at: Optional[datetime]) -> bool:
    if not expires_at:
        return True
    now = datetime.now(timezone.utc)
    refresh_buffer = timedelta(seconds=60)
    return expires_at <= now + refresh_buffer


async def get_credentials(account: Dict[str, Any]) -> Credentials:
    """Build Credentials from stored tokens, refreshing if needed."""
    creds_data = account.get("credentials", {})

    access_token = creds_data.get("access_token")
    refresh_token = creds_data.get("refresh_token")

    if not access_token:
        raise ValueError("No access token found for this account")

    expiry = _parse_expires_at(creds_data.get("expires_at"))

    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri=GOOGLE_TOKEN_URI,
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )

    # Check if token is expired and refresh if needed
    if refresh_token and _needs_refresh(expiry):
        try:
            new_tokens = await refresh_access_token(refresh_token)
            expires_at = _compute_expires_at(new_tokens.get("expires_in"))
            expiry = _parse_expires_at(expires_at)
            creds = Credentials(
                token=new_tokens["access_token"],
                refresh_token=refresh_token,  # Keep original refresh token
                token_uri=GOOGLE_TOKEN_URI,
                client_id=GOOGLE_CLIENT_ID,
                client_secret=GOOGLE_CLIENT_SECRET,
                scopes=SCOPES,
            )

            # Update stored credentials
            new_creds = {
                "access_token": new_tokens["access_token"],
                "refresh_token": refresh_token,
                "token_uri": GOOGLE_TOKEN_URI,
                "expires_in": new_tokens.get("expires_in"),
                "expires_at": expires_at,
            }
            await calendar_repo.update_credentials(account["account_id"], new_creds)
        except Exception as e:
            raise ValueError(
                "Google Calendar authorization expired. Please reconnect the account."
            ) from e
    elif not refresh_token and expiry and _needs_refresh(expiry):
        raise ValueError(
            "Google Calendar refresh token is missing. Please reconnect the account."
        )

    return creds


def _build_service(credentials: Credentials):
    """Build Google Calendar API service."""
    return build("calendar", "v3", credentials=credentials, cache_discovery=False)


async def fetch_calendar_events(
    account: Dict[str, Any],
    calendar_id: str,
    calendar_timezone: Optional[str] = None,
    time_min: Optional[datetime] = None,
    time_max: Optional[datetime] = None,
    sync_token: Optional[str] = None,
    max_results: int = 250,
) -> Dict[str, Any]:
    """
    Fetch events from Google Calendar.

    Args:
        account: Calendar account dict with credentials
        calendar_id: Calendar ID to fetch
        calendar_timezone: Calendar time zone for all-day normalization
        time_min: Minimum event start time (default: 30 days ago)
        time_max: Maximum event start time (default: 90 days from now)
        sync_token: Token for incremental sync
        max_results: Maximum events per page

    Returns:
        {
            "events": List[Dict],
            "next_sync_token": Optional[str],
            "time_min": Optional[datetime],
            "time_max": Optional[datetime],
            "full_sync": bool,
        }
    """
    creds = await get_credentials(account)

    # Default time range: 30 days ago to 90 days from now
    if not time_min:
        time_min = datetime.now(timezone.utc) - timedelta(days=30)
    if not time_max:
        time_max = datetime.now(timezone.utc) + timedelta(days=90)

    # Run the synchronous Google API calls in a thread pool
    def _fetch_events():
        service = _build_service(creds)
        all_events = []
        page_token = None
        next_sync_token = None

        while True:
            request_params = {
                "calendarId": calendar_id,
                "singleEvents": True,
                "orderBy": "startTime",
                "maxResults": max_results,
                "showDeleted": True,
            }

            if sync_token:
                # Incremental sync using sync token
                request_params["syncToken"] = sync_token
            else:
                # Full sync with time range
                request_params["timeMin"] = time_min.isoformat()
                request_params["timeMax"] = time_max.isoformat()

            if page_token:
                request_params["pageToken"] = page_token

            try:
                result = service.events().list(**request_params).execute()
            except HttpError as e:
                if e.resp.status == 410:
                    # Sync token expired, need full sync
                    # Return empty to trigger full sync
                    return {"events": [], "sync_token_expired": True}
                raise

            events = result.get("items", [])
            all_events.extend(
                [_parse_event(e, calendar_id, calendar_timezone) for e in events]
            )

            page_token = result.get("nextPageToken")
            if not page_token:
                next_sync_token = result.get("nextSyncToken")
                break

        return {
            "events": all_events,
            "next_sync_token": next_sync_token,
            "time_min": time_min,
            "time_max": time_max,
            "full_sync": sync_token is None,
        }

    result = await asyncio.to_thread(_fetch_events)

    # If sync token expired, retry with full sync
    if result.get("sync_token_expired"):
        return await fetch_calendar_events(
            account,
            calendar_id=calendar_id,
            calendar_timezone=calendar_timezone,
            time_min=time_min,
            time_max=time_max,
            sync_token=None,
            max_results=max_results,
        )

    return result


async def fetch_calendars(account: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Fetch list of calendars for an account."""
    creds = await get_credentials(account)

    def _fetch():
        service = _build_service(creds)
        calendars = []
        page_token = None
        while True:
            result = service.calendarList().list(pageToken=page_token).execute()
            calendars.extend(result.get("items", []))
            page_token = result.get("nextPageToken")
            if not page_token:
                break
        return [
            {
                "calendar_id": cal["id"],
                "summary": cal.get("summary", ""),
                "description": cal.get("description"),
                "primary": cal.get("primary", False),
                "access_role": cal.get("accessRole"),
                "background_color": cal.get("backgroundColor"),
                "foreground_color": cal.get("foregroundColor"),
                "time_zone": cal.get("timeZone"),
            }
            for cal in calendars
        ]

    return await asyncio.to_thread(_fetch)


def _normalize_timezone(tz_value: Optional[str]) -> Optional[str]:
    if not tz_value:
        return None
    try:
        ZoneInfo(tz_value)
    except Exception:
        return None
    return tz_value


def _parse_datetime(value: str, tz_value: Optional[str]) -> datetime:
    normalized = value.replace("Z", "+00:00") if value.endswith("Z") else value
    dt = datetime.fromisoformat(normalized)
    if dt.tzinfo is None:
        tzinfo = ZoneInfo(tz_value) if tz_value else timezone.utc
        dt = dt.replace(tzinfo=tzinfo)
    return dt


def _parse_all_day_datetime(value: str, tz_value: Optional[str]) -> datetime:
    date_value = date_cls.fromisoformat(value)
    tzinfo = ZoneInfo(tz_value) if tz_value else timezone.utc
    return datetime.combine(date_value, time_cls.min, tzinfo=tzinfo)


def _to_epoch_seconds(value: str, tz_value: Optional[str], is_all_day: bool) -> int:
    if is_all_day:
        dt = _parse_all_day_datetime(value, tz_value)
    else:
        dt = _parse_datetime(value, tz_value)
    return int(dt.astimezone(timezone.utc).timestamp())


def _extract_conference_url(event: Dict[str, Any]) -> Optional[str]:
    if event.get("hangoutLink"):
        return event["hangoutLink"]
    conference = event.get("conferenceData", {})
    for entry in conference.get("entryPoints", []):
        uri = entry.get("uri")
        if uri:
            return uri
    return None


def _parse_event(
    event: Dict[str, Any], calendar_id: str, calendar_timezone: Optional[str]
) -> Dict[str, Any]:
    """Parse Google Calendar event to our schema."""
    status = event.get("status", "confirmed")
    if status == "cancelled":
        return {
            "event_id": event["id"],
            "calendar_id": calendar_id,
            "status": status,
            "updated_at": event.get("updated"),
        }
    start = event.get("start", {})
    end = event.get("end", {})

    # Handle all-day vs timed events
    all_day = "date" in start
    start_time = start.get("date") or start.get("dateTime")
    end_time = end.get("date") or end.get("dateTime")
    event_tz = (
        _normalize_timezone(start.get("timeZone"))
        or _normalize_timezone(end.get("timeZone"))
        or _normalize_timezone(calendar_timezone)
        or "UTC"
    )

    start_ts = (
        _to_epoch_seconds(start_time, event_tz, all_day) if start_time else None
    )
    end_ts = _to_epoch_seconds(end_time, event_tz, all_day) if end_time else None

    return {
        "event_id": event["id"],
        "calendar_id": calendar_id,
        "title": event.get("summary", "(No title)"),
        "description": event.get("description"),
        "start_time": start_time,
        "end_time": end_time,
        "start_ts": start_ts,
        "end_ts": end_ts,
        "all_day": all_day,
        "location": event.get("location"),
        "status": event.get("status", "confirmed"),
        "visibility": event.get("visibility"),
        "organizer": event.get("organizer"),
        "attendees": event.get("attendees"),
        "html_link": event.get("htmlLink"),
        "conference_url": _extract_conference_url(event),
        "time_zone": event_tz,
        "created_at": event.get("created"),
        "updated_at": event.get("updated"),
    }
