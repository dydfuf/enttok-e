"""Repository for memory observations and FTS search."""

import json
import uuid
from typing import Any, Dict, List, Optional, Tuple

from app.db.connection import execute, executemany, fetchall, fetchone
from app.utils.time import utc_now


def _row_to_observation(row: Any) -> Dict[str, Any]:
    """Convert a database row to an observation dictionary."""
    facts = json.loads(row["facts"]) if row["facts"] else None
    concepts = json.loads(row["concepts"]) if row["concepts"] else None
    return {
        "observation_id": row["observation_id"],
        "title": row["title"],
        "narrative": row["narrative"],
        "facts": facts,
        "concepts": concepts,
        "type": row["type"],
        "source": row["source"],
        "source_event_id": row["source_event_id"],
        "project_path": row["project_path"],
        "event_time": row["event_time"],
        "event_ts": row["event_ts"],
        "created_at": row["created_at"],
        "updated_at": row["updated_at"],
        "embedding_version": row["embedding_version"],
        "chroma_synced": bool(row["chroma_synced"]),
    }


def _observation_to_summary(obs: Dict[str, Any]) -> Dict[str, Any]:
    """Convert full observation to a compact summary for progressive disclosure."""
    return {
        "observation_id": obs["observation_id"],
        "title": obs["title"],
        "type": obs["type"],
        "source": obs["source"],
        "event_time": obs["event_time"],
    }


async def create_observation(
    title: str,
    narrative: str,
    type: str,
    source: str,
    event_time: str,
    event_ts: int,
    facts: Optional[List[str]] = None,
    concepts: Optional[List[str]] = None,
    source_event_id: Optional[str] = None,
    project_path: Optional[str] = None,
    embedding_version: Optional[str] = None,
) -> str:
    """Create a new observation and add to FTS index."""
    observation_id = f"obs_{uuid.uuid4().hex}"
    now = utc_now()
    facts_json = json.dumps(facts) if facts else None
    concepts_json = json.dumps(concepts) if concepts else None

    # Insert into main table
    await execute(
        """
        insert into observations (
            observation_id, title, narrative, facts, concepts, type, source,
            source_event_id, project_path, event_time, event_ts,
            created_at, updated_at, embedding_version, chroma_synced
        ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)
        """,
        (
            observation_id,
            title,
            narrative,
            facts_json,
            concepts_json,
            type,
            source,
            source_event_id,
            project_path,
            event_time,
            event_ts,
            now,
            now,
            embedding_version,
        ),
    )

    # Insert into FTS index
    await execute(
        """
        insert into observations_fts (
            observation_id, title, narrative, facts, concepts
        ) values (?, ?, ?, ?, ?)
        """,
        (
            observation_id,
            title,
            narrative,
            facts_json or "",
            concepts_json or "",
        ),
    )

    return observation_id


async def update_observation(
    observation_id: str,
    title: Optional[str] = None,
    narrative: Optional[str] = None,
    facts: Optional[List[str]] = None,
    concepts: Optional[List[str]] = None,
) -> None:
    """Update an observation and refresh FTS index."""
    now = utc_now()
    updates = ["updated_at = ?"]
    params: List[Any] = [now]

    if title is not None:
        updates.append("title = ?")
        params.append(title)
    if narrative is not None:
        updates.append("narrative = ?")
        params.append(narrative)
    if facts is not None:
        updates.append("facts = ?")
        params.append(json.dumps(facts))
    if concepts is not None:
        updates.append("concepts = ?")
        params.append(json.dumps(concepts))

    # Reset chroma sync status if content changed
    if title or narrative or facts or concepts:
        updates.append("chroma_synced = 0")

    params.append(observation_id)
    await execute(
        f"update observations set {', '.join(updates)} where observation_id = ?",
        tuple(params),
    )

    # Update FTS index
    obs = await fetch_observation(observation_id)
    if obs:
        await execute(
            "delete from observations_fts where observation_id = ?",
            (observation_id,),
        )
        await execute(
            """
            insert into observations_fts (
                observation_id, title, narrative, facts, concepts
            ) values (?, ?, ?, ?, ?)
            """,
            (
                observation_id,
                obs["title"],
                obs["narrative"],
                json.dumps(obs["facts"]) if obs["facts"] else "",
                json.dumps(obs["concepts"]) if obs["concepts"] else "",
            ),
        )


async def delete_observation(observation_id: str) -> None:
    """Delete an observation and remove from FTS index."""
    await execute(
        "delete from observations where observation_id = ?",
        (observation_id,),
    )
    await execute(
        "delete from observations_fts where observation_id = ?",
        (observation_id,),
    )
    await execute(
        "delete from observation_sources where observation_id = ?",
        (observation_id,),
    )


async def fetch_observation(observation_id: str) -> Optional[Dict[str, Any]]:
    """Fetch a single observation by ID."""
    row = await fetchone(
        "select * from observations where observation_id = ?",
        (observation_id,),
    )
    if not row:
        return None
    return _row_to_observation(row)


async def fetch_observations(ids: List[str]) -> List[Dict[str, Any]]:
    """Batch fetch observations by IDs."""
    if not ids:
        return []
    placeholders = ", ".join(["?"] * len(ids))
    rows = await fetchall(
        f"select * from observations where observation_id in ({placeholders})",
        tuple(ids),
    )
    # Preserve order of input IDs
    obs_map = {_row_to_observation(row)["observation_id"]: _row_to_observation(row) for row in rows}
    return [obs_map[id] for id in ids if id in obs_map]


async def list_observations(
    start_ts: Optional[int] = None,
    end_ts: Optional[int] = None,
    type_filter: Optional[str] = None,
    source_filter: Optional[str] = None,
    project_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """List observations with optional filters."""
    where_clauses: List[str] = []
    params: List[Any] = []

    if start_ts is not None:
        where_clauses.append("event_ts >= ?")
        params.append(start_ts)
    if end_ts is not None:
        where_clauses.append("event_ts <= ?")
        params.append(end_ts)
    if type_filter:
        where_clauses.append("type = ?")
        params.append(type_filter)
    if source_filter:
        where_clauses.append("source = ?")
        params.append(source_filter)
    if project_filter:
        where_clauses.append("project_path = ?")
        params.append(project_filter)

    where_sql = f"where {' and '.join(where_clauses)}" if where_clauses else ""
    params.extend([limit, offset])

    rows = await fetchall(
        f"""
        select * from observations
        {where_sql}
        order by event_ts desc
        limit ? offset ?
        """,
        tuple(params),
    )
    return [_row_to_observation(row) for row in rows]


async def list_observation_summaries(
    start_ts: Optional[int] = None,
    end_ts: Optional[int] = None,
    type_filter: Optional[str] = None,
    source_filter: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
) -> List[Dict[str, Any]]:
    """List compact observation summaries for progressive disclosure."""
    observations = await list_observations(
        start_ts=start_ts,
        end_ts=end_ts,
        type_filter=type_filter,
        source_filter=source_filter,
        limit=limit,
        offset=offset,
    )
    return [_observation_to_summary(obs) for obs in observations]


async def search_fts(
    query: str,
    limit: int = 20,
    type_filter: Optional[str] = None,
    source_filter: Optional[str] = None,
    start_ts: Optional[int] = None,
    end_ts: Optional[int] = None,
) -> List[Tuple[str, float]]:
    """
    FTS5 full-text search returning (observation_id, bm25_score) tuples.
    Lower BM25 scores indicate better matches.
    """
    # Build filter conditions on main table
    join_conditions: List[str] = []
    params: List[Any] = [query]

    if type_filter:
        join_conditions.append("o.type = ?")
        params.append(type_filter)
    if source_filter:
        join_conditions.append("o.source = ?")
        params.append(source_filter)
    if start_ts is not None:
        join_conditions.append("o.event_ts >= ?")
        params.append(start_ts)
    if end_ts is not None:
        join_conditions.append("o.event_ts <= ?")
        params.append(end_ts)

    join_sql = f"and {' and '.join(join_conditions)}" if join_conditions else ""
    params.append(limit)

    rows = await fetchall(
        f"""
        select fts.observation_id, bm25(observations_fts) as score
        from observations_fts fts
        join observations o on o.observation_id = fts.observation_id
        where observations_fts match ?
        {join_sql}
        order by score
        limit ?
        """,
        tuple(params),
    )
    return [(row["observation_id"], row["score"]) for row in rows]


async def get_pending_chroma_sync(limit: int = 100) -> List[Dict[str, Any]]:
    """Get observations pending ChromaDB synchronization."""
    rows = await fetchall(
        """
        select * from observations
        where chroma_synced = 0
        order by created_at asc
        limit ?
        """,
        (limit,),
    )
    return [_row_to_observation(row) for row in rows]


async def mark_chroma_synced(observation_ids: List[str]) -> None:
    """Mark observations as synchronized to ChromaDB."""
    if not observation_ids:
        return
    placeholders = ", ".join(["?"] * len(observation_ids))
    await execute(
        f"update observations set chroma_synced = 1 where observation_id in ({placeholders})",
        tuple(observation_ids),
    )


async def is_event_processed(source_type: str, source_id: str) -> bool:
    """Check if an event has already been processed into an observation."""
    row = await fetchone(
        "select 1 from observation_sources where source_type = ? and source_id = ?",
        (source_type, source_id),
    )
    return row is not None


async def record_event_processed(
    source_type: str,
    source_id: str,
    observation_id: str,
) -> None:
    """Record that an event has been processed into an observation."""
    now = utc_now()
    await execute(
        """
        insert into observation_sources (source_type, source_id, observation_id, created_at)
        values (?, ?, ?, ?)
        on conflict(source_type, source_id) do update set
            observation_id = excluded.observation_id,
            created_at = excluded.created_at
        """,
        (source_type, source_id, observation_id, now),
    )


async def get_observation_stats() -> Dict[str, Any]:
    """Get statistics about observations."""
    # Total count
    total_row = await fetchone("select count(*) as cnt from observations", ())
    total = total_row["cnt"] if total_row else 0

    # By type
    type_rows = await fetchall(
        "select type, count(*) as cnt from observations group by type",
        (),
    )
    by_type = {row["type"]: row["cnt"] for row in type_rows}

    # By source
    source_rows = await fetchall(
        "select source, count(*) as cnt from observations group by source",
        (),
    )
    by_source = {row["source"]: row["cnt"] for row in source_rows}

    # Date range
    range_row = await fetchone(
        "select min(event_ts) as min_ts, max(event_ts) as max_ts from observations",
        (),
    )
    date_range = {
        "min_ts": range_row["min_ts"] if range_row else None,
        "max_ts": range_row["max_ts"] if range_row else None,
    }

    # Pending sync count
    pending_row = await fetchone(
        "select count(*) as cnt from observations where chroma_synced = 0",
        (),
    )
    pending_sync = pending_row["cnt"] if pending_row else 0

    # Chroma synced count
    synced_row = await fetchone(
        "select count(*) as cnt from observations where chroma_synced = 1",
        (),
    )
    chroma_synced = synced_row["cnt"] if synced_row else 0

    return {
        "total_observations": total,
        "by_type": by_type,
        "by_source": by_source,
        "date_range": date_range,
        "pending_chroma_sync": pending_sync,
        "chroma_synced": chroma_synced,
    }


async def get_timeline(
    anchor_ts: int,
    depth_before: int = 5,
    depth_after: int = 5,
) -> List[Dict[str, Any]]:
    """Get observations around a specific timestamp for timeline view."""
    # Get observations before anchor
    before_rows = await fetchall(
        """
        select * from observations
        where event_ts < ?
        order by event_ts desc
        limit ?
        """,
        (anchor_ts, depth_before),
    )

    # Get observations at and after anchor
    after_rows = await fetchall(
        """
        select * from observations
        where event_ts >= ?
        order by event_ts asc
        limit ?
        """,
        (anchor_ts, depth_after + 1),
    )

    # Combine and sort by timestamp
    all_rows = list(reversed(before_rows)) + list(after_rows)
    return [_observation_to_summary(_row_to_observation(row)) for row in all_rows]
