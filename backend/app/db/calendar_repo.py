import json
import uuid
from typing import Any, Dict, List, Optional

from app.db.connection import execute, fetchall, fetchone
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


def _connector_key(account_id: str) -> str:
    return f"{CONNECTOR_PREFIX}{account_id}"


async def _attach_sync_state(account: Dict[str, Any]) -> Dict[str, Any]:
    sync_row = await fetchone(
        "select cursor, last_sync_at from sync_state where connector = ?",
        (_connector_key(account["account_id"]),),
    )
    if sync_row:
        account["sync_cursor"] = sync_row["cursor"]
        account["last_sync_at"] = sync_row["last_sync_at"]
    else:
        account["sync_cursor"] = None
        account["last_sync_at"] = None
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
    await execute("delete from sync_state where connector = ?", (_connector_key(account_id),))


async def update_sync_state(account_id: str, cursor: Optional[str]) -> str:
    last_sync_at = utc_now()
    await execute(
        """
        insert into sync_state (connector, cursor, last_sync_at)
        values (?, ?, ?)
        on conflict(connector) do update set
          cursor = excluded.cursor,
          last_sync_at = excluded.last_sync_at
        """,
        (_connector_key(account_id), cursor, last_sync_at),
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
