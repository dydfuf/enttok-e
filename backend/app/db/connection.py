import asyncio
import sqlite3
from typing import Any, Optional

from app.core.config import DB_PATH

db_lock = asyncio.Lock()
db_conn: sqlite3.Connection | None = None


def init_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        create table if not exists jobs (
          job_id text primary key,
          type text not null,
          status text not null,
          created_at text not null,
          updated_at text not null,
          progress real,
          message text,
          payload_json text,
          result_json text,
          error_json text
        );
        """
    )
    conn.execute(
        """
        create table if not exists job_events (
          event_id integer primary key,
          job_id text not null,
          created_at text not null,
          level text not null,
          message text not null,
          meta_json text
        );
        """
    )
    conn.execute(
        """
        create table if not exists sync_state (
          connector text primary key,
          cursor text,
          last_sync_at text
        );
        """
    )
    conn.commit()


async def connect_db() -> None:
    global db_conn
    db_conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    db_conn.row_factory = sqlite3.Row
    init_db(db_conn)


async def close_db() -> None:
    if db_conn:
        db_conn.close()


def _ensure_conn() -> sqlite3.Connection:
    if db_conn is None:
        raise RuntimeError("database not initialized")
    return db_conn


async def execute(query: str, params: tuple[Any, ...] = ()) -> None:
    async with db_lock:
        await asyncio.to_thread(_execute_sync, query, params)


def _execute_sync(query: str, params: tuple[Any, ...]) -> None:
    conn = _ensure_conn()
    conn.execute(query, params)
    conn.commit()


async def fetchone(
    query: str, params: tuple[Any, ...] = ()
) -> Optional[sqlite3.Row]:
    async with db_lock:
        return await asyncio.to_thread(_fetchone_sync, query, params)


def _fetchone_sync(
    query: str, params: tuple[Any, ...]
) -> Optional[sqlite3.Row]:
    conn = _ensure_conn()
    cur = conn.execute(query, params)
    return cur.fetchone()


async def fetchall(
    query: str, params: tuple[Any, ...] = ()
) -> list[sqlite3.Row]:
    async with db_lock:
        return await asyncio.to_thread(_fetchall_sync, query, params)


def _fetchall_sync(
    query: str, params: tuple[Any, ...]
) -> list[sqlite3.Row]:
    conn = _ensure_conn()
    cur = conn.execute(query, params)
    return cur.fetchall()
