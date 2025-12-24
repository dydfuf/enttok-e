import json
import uuid
from typing import Any, Dict, List, Optional

from app.db.connection import execute, executemany, fetchall, fetchone
from app.utils.time import utc_now

CONNECTOR_PREFIX = "calendar:"


def _row_to_account(row: Any) -> Dict[str, Any]:
    return {
        "account_id": row["account_id"],
        "provider": row["provider"],
        "email": row["email"],
        "display_name": row["display_name"],
        "credentials": json.loads(row["credentials_json"]) if row["credentials_json"] else {},
        "config": json.loads(row["config_json"]) if row["config_json"] else {},
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _account_connector_key(account_id: str) -> str:
    return f"{CONNECTOR_PREFIX}{account_id}"


def _calendar_connector_key(account_id: str, calendar_id: str) -> str:
    return f"{CONNECTOR_PREFIX}{account_id}:{calendar_id}"


def _calendar_connector_prefix(account_id: str) -> str:
    return f"{CONNECTOR_PREFIX}{account_id}:"


async def _attach_sync_state(account: Dict[str, Any]) -> Dict[str, Any]:
    account_id = account["account_id"]
    sync_row = await fetchone(
        """
        select max(last_sync_at) as last_sync_at
        from sync_state
        where connector like ? or connector = ?
        """,
        (f"{_calendar_connector_prefix(account_id)}%", _account_connector_key(account_id)),
    )
    account["sync_cursor"] = None
    account["last_sync_at"] = sync_row["last_sync_at"] if sync_row else None
    return account


def to_public_account(account: Dict[str, Any]) -> Dict[str, Any]:
    public = {key: value for key, value in account.items() if key not in {"credentials", "config"}}
    public["connected"] = bool(account.get("credentials"))
    return public


async def create_account(
    provider: str,
    display_name: Optional[str],
    email: Optional[str],
    credentials: Optional[Dict[str, Any]] = None,
    config: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    account_id = f"cal_{uuid.uuid4().hex}"
    now = utc_now()
    await execute(
        """
        insert into calendar_accounts (
          account_id, provider, email, display_name, credentials_json, config_json, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            account_id,
            provider,
            email,
            display_name,
            json.dumps(credentials or {}),
            json.dumps(config or {}),
            now,
            now,
        ),
    )
    account = await fetch_account(account_id)
    if not account:  # pragma: no cover - safety guard
        raise RuntimeError("failed to fetch created calendar account")
    return account


async def list_accounts(public: bool = False) -> List[Dict[str, Any]]:
    rows = await fetchall(
        "select * from calendar_accounts order by created_at desc",
    )
    accounts = []
    for row in rows:
        account = await _attach_sync_state(_row_to_account(row))
        accounts.append(to_public_account(account) if public else account)
    return accounts


async def fetch_account(account_id: str, public: bool = False) -> Optional[Dict[str, Any]]:
    row = await fetchone("select * from calendar_accounts where account_id = ?", (account_id,))
    if not row:
        return None
    account = await _attach_sync_state(_row_to_account(row))
    return to_public_account(account) if public else account


async def delete_account(account_id: str) -> None:
    await execute("delete from calendar_accounts where account_id = ?", (account_id,))
    await execute(
        "delete from sync_state where connector = ? or connector like ?",
        (_account_connector_key(account_id), f"{_calendar_connector_prefix(account_id)}%"),
    )
    await execute(
        "delete from calendar_calendars where account_id = ?",
        (account_id,),
    )
    await execute(
        "delete from calendar_events where account_id = ?",
        (account_id,),
    )


async def fetch_calendar_sync_state(
    account_id: str, calendar_id: str
) -> Optional[Dict[str, Any]]:
    row = await fetchone(
        "select cursor, last_sync_at from sync_state where connector = ?",
        (_calendar_connector_key(account_id, calendar_id),),
    )
    if not row:
        return None
    return {"cursor": row["cursor"], "last_sync_at": row["last_sync_at"]}


async def update_calendar_sync_state(
    account_id: str, calendar_id: str, cursor: Optional[str]
) -> str:
    last_sync_at = utc_now()
    await execute(
        """
        insert into sync_state (connector, cursor, last_sync_at)
        values (?, ?, ?)
        on conflict(connector) do update set
          cursor = excluded.cursor,
          last_sync_at = excluded.last_sync_at
        """,
        (_calendar_connector_key(account_id, calendar_id), cursor, last_sync_at),
    )
    return last_sync_at


async def update_credentials(
    account_id: str,
    credentials: Dict[str, Any],
) -> None:
    """Update stored credentials for an account (e.g., after token refresh)."""
    now = utc_now()
    await execute(
        """
        update calendar_accounts
        set credentials_json = ?, updated_at = ?
        where account_id = ?
        """,
        (json.dumps(credentials), now, account_id),
    )


def _row_to_calendar(row: Any) -> Dict[str, Any]:
    return {
        "account_id": row["account_id"],
        "calendar_id": row["calendar_id"],
        "provider": row["provider"],
        "name": row["name"] or "",
        "description": row["description"],
        "is_primary": bool(row["is_primary"]),
        "access_role": row["access_role"],
        "background_color": row["background_color"],
        "foreground_color": row["foreground_color"],
        "time_zone": row["time_zone"],
        "selected": bool(row["selected"]),
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _row_to_event(row: Any) -> Dict[str, Any]:
    organizer = json.loads(row["organizer_json"]) if row["organizer_json"] else None
    attendees = json.loads(row["attendees_json"]) if row["attendees_json"] else None
    keys = row.keys()
    return {
        "account_id": row["account_id"],
        "calendar_id": row["calendar_id"],
        "event_id": row["event_id"],
        "title": row["title"],
        "description": row["description"],
        "start_time": row["start_time"],
        "end_time": row["end_time"],
        "start_ts": row["start_ts"],
        "end_ts": row["end_ts"],
        "all_day": bool(row["all_day"]),
        "location": row["location"],
        "conference_url": row["conference_url"],
        "visibility": row["visibility"],
        "status": row["status"],
        "organizer": organizer,
        "attendees": attendees,
        "html_link": row["html_link"],
        "time_zone": row["time_zone"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "calendar_color": row["calendar_color"] if "calendar_color" in keys else None,
        "calendar_name": row["calendar_name"] if "calendar_name" in keys else None,
    }


async def upsert_calendars(
    account_id: str, provider: str, calendars: List[Dict[str, Any]]
) -> None:
    now = utc_now()
    rows = await fetchall(
        "select calendar_id, selected from calendar_calendars where account_id = ?",
        (account_id,),
    )
    selected_map = {row["calendar_id"]: row["selected"] for row in rows}

    params: list[tuple[Any, ...]] = []
    for calendar in calendars:
        calendar_id = calendar["calendar_id"]
        selected = selected_map.get(calendar_id, 1)
        params.append(
            (
                account_id,
                calendar_id,
                provider,
                calendar.get("summary", ""),
                calendar.get("description"),
                1 if calendar.get("primary") else 0,
                calendar.get("access_role"),
                calendar.get("background_color"),
                calendar.get("foreground_color"),
                calendar.get("time_zone"),
                selected,
                now,
                now,
            )
        )

    await executemany(
        """
        insert into calendar_calendars (
          account_id, calendar_id, provider, name, description, is_primary,
          access_role, background_color, foreground_color, time_zone, selected,
          created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(account_id, calendar_id) do update set
          provider = excluded.provider,
          name = excluded.name,
          description = excluded.description,
          is_primary = excluded.is_primary,
          access_role = excluded.access_role,
          background_color = excluded.background_color,
          foreground_color = excluded.foreground_color,
          time_zone = excluded.time_zone,
          updated_at = excluded.updated_at,
          selected = calendar_calendars.selected
        """,
        params,
    )


async def prune_calendars(account_id: str, keep_ids: List[str]) -> None:
    if keep_ids:
        placeholders = ", ".join(["?"] * len(keep_ids))
        await execute(
            f"""
            delete from calendar_calendars
            where account_id = ?
              and calendar_id not in ({placeholders})
            """,
            (account_id, *keep_ids),
        )
        await execute(
            f"""
            delete from calendar_events
            where account_id = ?
              and calendar_id not in ({placeholders})
            """,
            (account_id, *keep_ids),
        )
    else:
        await execute(
            "delete from calendar_calendars where account_id = ?",
            (account_id,),
        )
        await execute(
            "delete from calendar_events where account_id = ?",
            (account_id,),
        )


async def list_calendars(
    account_id: Optional[str] = None, selected_only: bool = False
) -> List[Dict[str, Any]]:
    where_clauses = []
    params: list[Any] = []
    if account_id:
        where_clauses.append("account_id = ?")
        params.append(account_id)
    if selected_only:
        where_clauses.append("selected = 1")
    where_sql = f"where {' and '.join(where_clauses)}" if where_clauses else ""

    rows = await fetchall(
        f"""
        select *
        from calendar_calendars
        {where_sql}
        order by is_primary desc, name asc
        """,
        tuple(params),
    )
    return [_row_to_calendar(row) for row in rows]


async def set_calendar_selected(
    account_id: str, calendar_id: str, selected: bool
) -> None:
    now = utc_now()
    await execute(
        """
        update calendar_calendars
        set selected = ?, updated_at = ?
        where account_id = ? and calendar_id = ?
        """,
        (1 if selected else 0, now, account_id, calendar_id),
    )


async def upsert_events(
    account_id: str, calendar_id: str, events: List[Dict[str, Any]]
) -> None:
    params: list[tuple[Any, ...]] = []
    for event in events:
        params.append(
            (
                account_id,
                calendar_id,
                event["event_id"],
                event.get("title"),
                event.get("description"),
                event.get("start_time"),
                event.get("end_time"),
                event.get("start_ts"),
                event.get("end_ts"),
                1 if event.get("all_day") else 0,
                event.get("location"),
                event.get("conference_url"),
                event.get("visibility"),
                event.get("status"),
                json.dumps(event.get("organizer")) if event.get("organizer") else None,
                json.dumps(event.get("attendees")) if event.get("attendees") else None,
                event.get("html_link"),
                event.get("time_zone"),
                event.get("created_at"),
                event.get("updated_at"),
            )
        )

    await executemany(
        """
        insert into calendar_events (
          account_id, calendar_id, event_id, title, description,
          start_time, end_time, start_ts, end_ts, all_day, location,
          conference_url, visibility, status, organizer_json, attendees_json,
          html_link, time_zone, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(account_id, calendar_id, event_id) do update set
          title = excluded.title,
          description = excluded.description,
          start_time = excluded.start_time,
          end_time = excluded.end_time,
          start_ts = excluded.start_ts,
          end_ts = excluded.end_ts,
          all_day = excluded.all_day,
          location = excluded.location,
          conference_url = excluded.conference_url,
          visibility = excluded.visibility,
          status = excluded.status,
          organizer_json = excluded.organizer_json,
          attendees_json = excluded.attendees_json,
          html_link = excluded.html_link,
          time_zone = excluded.time_zone,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
        """,
        params,
    )


async def delete_events(
    account_id: str, calendar_id: str, event_ids: List[str]
) -> None:
    if not event_ids:
        return
    placeholders = ", ".join(["?"] * len(event_ids))
    await execute(
        f"""
        delete from calendar_events
        where account_id = ?
          and calendar_id = ?
          and event_id in ({placeholders})
        """,
        (account_id, calendar_id, *event_ids),
    )


async def delete_events_in_range(
    account_id: str, calendar_id: str, start_ts: int, end_ts: int
) -> None:
    await execute(
        """
        delete from calendar_events
        where account_id = ?
          and calendar_id = ?
          and start_ts < ?
          and end_ts > ?
        """,
        (account_id, calendar_id, end_ts, start_ts),
    )


async def list_events(
    start_ts: int,
    end_ts: int,
    account_id: Optional[str] = None,
    calendar_ids: Optional[List[str]] = None,
    selected_only: bool = True,
) -> List[Dict[str, Any]]:
    where_clauses = ["e.start_ts < ? and e.end_ts > ?", "e.status != 'cancelled'"]
    params: list[Any] = [end_ts, start_ts]

    if account_id:
        where_clauses.append("e.account_id = ?")
        params.append(account_id)
    if calendar_ids:
        placeholders = ", ".join(["?"] * len(calendar_ids))
        where_clauses.append(f"e.calendar_id in ({placeholders})")
        params.extend(calendar_ids)
    if selected_only:
        where_clauses.append("c.selected = 1")

    where_sql = f"where {' and '.join(where_clauses)}"

    rows = await fetchall(
        f"""
        select
          e.*,
          c.background_color as calendar_color,
          c.name as calendar_name
        from calendar_events e
        join calendar_calendars c
          on c.account_id = e.account_id and c.calendar_id = e.calendar_id
        {where_sql}
        order by e.start_ts asc
        """,
        tuple(params),
    )
    return [_row_to_event(row) for row in rows]
