"""Google Calendar API client for fetching events."""

import asyncio
from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from app.core.config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
from app.db import calendar_repo
from app.services.google_oauth import GOOGLE_TOKEN_URI, refresh_access_token

# Scopes for read-only calendar access
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]


async def get_credentials(account: Dict[str, Any]) -> Credentials:
    """Build Credentials from stored tokens, refreshing if needed."""
    creds_data = account.get("credentials", {})

    if not creds_data.get("access_token"):
        raise ValueError("No access token found for this account")

    creds = Credentials(
        token=creds_data.get("access_token"),
        refresh_token=creds_data.get("refresh_token"),
        token_uri=GOOGLE_TOKEN_URI,
        client_id=GOOGLE_CLIENT_ID,
        client_secret=GOOGLE_CLIENT_SECRET,
        scopes=SCOPES,
    )

    # Check if token is expired and refresh if needed
    if creds.expired and creds.refresh_token:
        try:
            new_tokens = await refresh_access_token(creds.refresh_token)
            creds = Credentials(
                token=new_tokens["access_token"],
                refresh_token=creds.refresh_token,  # Keep original refresh token
                token_uri=GOOGLE_TOKEN_URI,
                client_id=GOOGLE_CLIENT_ID,
                client_secret=GOOGLE_CLIENT_SECRET,
                scopes=SCOPES,
            )

            # Update stored credentials
            new_creds = {
                "access_token": new_tokens["access_token"],
                "refresh_token": creds.refresh_token,
                "token_uri": GOOGLE_TOKEN_URI,
                "expires_in": new_tokens.get("expires_in"),
            }
            await calendar_repo.update_credentials(account["account_id"], new_creds)
        except Exception as e:
            raise ValueError(f"Failed to refresh token: {e}")

    return creds


def _build_service(credentials: Credentials):
    """Build Google Calendar API service."""
    return build("calendar", "v3", credentials=credentials, cache_discovery=False)


async def fetch_calendar_events(
    account: Dict[str, Any],
    time_min: Optional[datetime] = None,
    time_max: Optional[datetime] = None,
    sync_token: Optional[str] = None,
    max_results: int = 250,
) -> Dict[str, Any]:
    """
    Fetch events from Google Calendar.

    Args:
        account: Calendar account dict with credentials
        time_min: Minimum event start time (default: 30 days ago)
        time_max: Maximum event start time (default: 90 days from now)
        sync_token: Token for incremental sync
        max_results: Maximum events per page

    Returns:
        {
            "events": List[Dict],
            "next_sync_token": Optional[str],
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
                "calendarId": "primary",
                "singleEvents": True,
                "orderBy": "startTime",
                "maxResults": max_results,
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
            all_events.extend([_parse_event(e) for e in events])

            page_token = result.get("nextPageToken")
            if not page_token:
                next_sync_token = result.get("nextSyncToken")
                break

        return {
            "events": all_events,
            "next_sync_token": next_sync_token,
        }

    result = await asyncio.to_thread(_fetch_events)

    # If sync token expired, retry with full sync
    if result.get("sync_token_expired"):
        return await fetch_calendar_events(
            account, time_min, time_max, sync_token=None, max_results=max_results
        )

    return result


async def fetch_calendars(account: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Fetch list of calendars for an account."""
    creds = await get_credentials(account)

    def _fetch():
        service = _build_service(creds)
        result = service.calendarList().list().execute()
        calendars = result.get("items", [])
        return [
            {
                "calendar_id": cal["id"],
                "summary": cal.get("summary", ""),
                "description": cal.get("description"),
                "primary": cal.get("primary", False),
                "access_role": cal.get("accessRole"),
                "background_color": cal.get("backgroundColor"),
                "foreground_color": cal.get("foregroundColor"),
            }
            for cal in calendars
        ]

    return await asyncio.to_thread(_fetch)


def _parse_event(event: Dict[str, Any]) -> Dict[str, Any]:
    """Parse Google Calendar event to our schema."""
    start = event.get("start", {})
    end = event.get("end", {})

    # Handle all-day vs timed events
    all_day = "date" in start
    start_time = start.get("date") or start.get("dateTime")
    end_time = end.get("date") or end.get("dateTime")

    return {
        "event_id": event["id"],
        "calendar_id": event.get("organizer", {}).get("email", "primary"),
        "title": event.get("summary", "(No title)"),
        "description": event.get("description"),
        "start_time": start_time,
        "end_time": end_time,
        "all_day": all_day,
        "location": event.get("location"),
        "recurring": bool(event.get("recurringEventId")),
        "status": event.get("status", "confirmed"),
        "created_at": event.get("created"),
        "updated_at": event.get("updated"),
    }
