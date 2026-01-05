import json
import uuid
from typing import Any, Dict, List, Optional

from app.db.connection import execute, executemany, fetchall, fetchone
from app.utils.time import utc_now


def build_base_url(org: str) -> str:
    return f"https://{org}.atlassian.net"


def _row_to_account(row: Any) -> Dict[str, Any]:
    return {
        "account_id": row["account_id"],
        "service": row["service"],
        "org": row["org"],
        "base_url": row["base_url"],
        "email": row["email"],
        "api_token": row["api_token"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
    }


def _connector_key(service: str, account_id: str) -> str:
    return f"{service}:{account_id}"


async def _attach_sync_state(account: Dict[str, Any]) -> Dict[str, Any]:
    connector = _connector_key(account["service"], account["account_id"])
    row = await fetchone(
        "select last_sync_at from sync_state where connector = ?",
        (connector,),
    )
    account["last_sync_at"] = row["last_sync_at"] if row else None
    return account


def to_public_account(account: Dict[str, Any]) -> Dict[str, Any]:
    public = {key: value for key, value in account.items() if key != "api_token"}
    return public


async def create_account(
    service: str,
    org: str,
    email: str,
    api_token: str,
) -> Dict[str, Any]:
    account_id = f"atl_{uuid.uuid4().hex}"
    now = utc_now()
    base_url = build_base_url(org)
    await execute(
        """
        insert into atlassian_accounts (
          account_id, service, org, base_url, email, api_token, created_at, updated_at
        ) values (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (account_id, service, org, base_url, email, api_token, now, now),
    )
    account = await fetch_account(account_id)
    if not account:  # pragma: no cover - safety guard
        raise RuntimeError("failed to fetch created atlassian account")
    return account


async def list_accounts(
    service: Optional[str] = None, public: bool = False
) -> List[Dict[str, Any]]:
    if service:
        rows = await fetchall(
            "select * from atlassian_accounts where service = ? order by created_at desc",
            (service,),
        )
    else:
        rows = await fetchall(
            "select * from atlassian_accounts order by created_at desc",
        )
    accounts: list[Dict[str, Any]] = []
    for row in rows:
        account = await _attach_sync_state(_row_to_account(row))
        accounts.append(to_public_account(account) if public else account)
    return accounts


async def fetch_account(
    account_id: str, public: bool = False
) -> Optional[Dict[str, Any]]:
    row = await fetchone(
        "select * from atlassian_accounts where account_id = ?",
        (account_id,),
    )
    if not row:
        return None
    account = await _attach_sync_state(_row_to_account(row))
    return to_public_account(account) if public else account


async def delete_account(account_id: str) -> None:
    await execute(
        "delete from atlassian_accounts where account_id = ?",
        (account_id,),
    )
    await execute(
        "delete from activity_events where account_id = ?",
        (account_id,),
    )
    await execute(
        "delete from sync_state where connector like ?",
        (f"%:{account_id}",),
    )


async def fetch_sync_state(connector: str) -> Optional[Dict[str, Any]]:
    row = await fetchone(
        "select cursor, last_sync_at from sync_state where connector = ?",
        (connector,),
    )
    if not row:
        return None
    return {"cursor": row["cursor"], "last_sync_at": row["last_sync_at"]}


async def update_sync_state(connector: str, cursor: Optional[str]) -> str:
    last_sync_at = utc_now()
    await execute(
        """
        insert into sync_state (connector, cursor, last_sync_at)
        values (?, ?, ?)
        on conflict(connector) do update set
          cursor = excluded.cursor,
          last_sync_at = excluded.last_sync_at
        """,
        (connector, cursor, last_sync_at),
    )
    return last_sync_at


def _row_to_event(row: Any) -> Dict[str, Any]:
    raw = json.loads(row["raw_json"]) if row["raw_json"] else None
    return {
        "event_id": row["event_id"],
        "source": row["source"],
        "account_id": row["account_id"],
        "event_type": row["event_type"],
        "title": row["title"],
        "description": row["description"],
        "url": row["url"],
        "actor": row["actor"],
        "event_time": row["event_time"],
        "event_ts": row["event_ts"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "raw": raw,
    }


async def upsert_events(events: List[Dict[str, Any]]) -> None:
    if not events:
        return
    now = utc_now()
    params: list[tuple[Any, ...]] = []
    for event in events:
        params.append(
            (
                event["event_id"],
                event["source"],
                event["account_id"],
                event["event_type"],
                event["title"],
                event.get("description"),
                event.get("url"),
                event.get("actor"),
                event["event_time"],
                event["event_ts"],
                now,
                now,
                json.dumps(event.get("raw")) if event.get("raw") else None,
            )
        )
    await executemany(
        """
        insert into activity_events (
          event_id, source, account_id, event_type, title, description, url, actor,
          event_time, event_ts, created_at, updated_at, raw_json
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        on conflict(event_id) do update set
          source = excluded.source,
          account_id = excluded.account_id,
          event_type = excluded.event_type,
          title = excluded.title,
          description = excluded.description,
          url = excluded.url,
          actor = excluded.actor,
          event_time = excluded.event_time,
          event_ts = excluded.event_ts,
          updated_at = excluded.updated_at,
          raw_json = excluded.raw_json
        """,
        params,
    )


async def list_events(
    start_ts: int,
    end_ts: int,
    sources: Optional[List[str]] = None,
    limit: int = 200,
) -> List[Dict[str, Any]]:
    where_clauses = ["event_ts >= ?", "event_ts <= ?"]
    params: list[Any] = [start_ts, end_ts]
    if sources:
        placeholders = ", ".join(["?"] * len(sources))
        where_clauses.append(f"source in ({placeholders})")
        params.extend(sources)
    params.append(limit)
    rows = await fetchall(
        f"""
        select *
        from activity_events
        where {' and '.join(where_clauses)}
        order by event_ts desc
        limit ?
        """,
        tuple(params),
    )
    return [_row_to_event(row) for row in rows]

