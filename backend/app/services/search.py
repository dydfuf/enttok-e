"""Hybrid search service combining FTS5 and ChromaDB vector search."""

import logging
import time
from typing import Any, Dict, List, Optional, Tuple

from app.db import memory_repo
from app.services import chroma

logger = logging.getLogger(__name__)


def _merge_results_rrf(
    fts_results: List[Tuple[str, float]],
    vector_results: List[Tuple[str, float]],
    limit: int,
    k: int = 60,
) -> List[Tuple[str, float]]:
    """
    Merge results using Reciprocal Rank Fusion (RRF).

    RRF score = 1/(k + rank_fts) + 1/(k + rank_vector)

    Args:
        fts_results: List of (observation_id, score) from FTS5
        vector_results: List of (observation_id, distance) from ChromaDB
        limit: Maximum number of results to return
        k: RRF constant (default 60)

    Returns:
        List of (observation_id, rrf_score) sorted by score descending
    """
    scores: Dict[str, float] = {}

    # Add FTS scores (lower BM25 = better, so rank by position)
    for rank, (obs_id, _) in enumerate(fts_results):
        scores[obs_id] = scores.get(obs_id, 0) + 1 / (k + rank + 1)

    # Add vector scores (lower distance = better)
    for rank, (obs_id, _) in enumerate(vector_results):
        scores[obs_id] = scores.get(obs_id, 0) + 1 / (k + rank + 1)

    # Sort by RRF score descending
    sorted_results = sorted(scores.items(), key=lambda x: x[1], reverse=True)
    return sorted_results[:limit]


async def search(
    query: str,
    limit: int = 20,
    type_filter: Optional[str] = None,
    source_filter: Optional[str] = None,
    days_back: int = 90,
    search_mode: str = "hybrid",
) -> Dict[str, Any]:
    """
    Perform hybrid search combining FTS5 and vector search.

    Args:
        query: Search query text
        limit: Maximum number of results
        type_filter: Optional filter by observation type
        source_filter: Optional filter by source
        days_back: Number of days to look back (default 90)
        search_mode: "hybrid", "fts", or "vector"

    Returns:
        Dict with results, total_count, search_mode, and query
    """
    # Calculate time window
    end_ts = int(time.time() * 1000)
    start_ts = end_ts - (days_back * 24 * 60 * 60 * 1000)

    fts_results: List[Tuple[str, float]] = []
    vector_results: List[Tuple[str, float]] = []

    # FTS search
    if search_mode in ("hybrid", "fts"):
        try:
            fts_results = await memory_repo.search_fts(
                query=query,
                limit=limit * 2,  # Get more for merging
                type_filter=type_filter,
                source_filter=source_filter,
                start_ts=start_ts,
                end_ts=end_ts,
            )
            logger.debug(f"FTS returned {len(fts_results)} results")
        except Exception as e:
            logger.error(f"FTS search failed: {e}")

    # Vector search
    if search_mode in ("hybrid", "vector") and chroma.is_available():
        try:
            await chroma.initialize()

            # Build ChromaDB where filter
            where_filter: Dict[str, Any] = {}
            conditions = []

            if type_filter:
                conditions.append({"type": {"$eq": type_filter}})
            if source_filter:
                conditions.append({"source": {"$eq": source_filter}})
            if start_ts:
                conditions.append({"event_ts": {"$gte": start_ts}})
            if end_ts:
                conditions.append({"event_ts": {"$lte": end_ts}})

            if len(conditions) == 1:
                where_filter = conditions[0]
            elif len(conditions) > 1:
                where_filter = {"$and": conditions}

            chroma_results = await chroma.search(
                query_text=query,
                n_results=limit * 2,
                where=where_filter if where_filter else None,
            )

            # Convert to (id, distance) tuples
            vector_results = [
                (r["observation_id"], r["distance"])
                for r in chroma_results
            ]
            logger.debug(f"Vector search returned {len(vector_results)} results")

        except Exception as e:
            logger.error(f"Vector search failed: {e}")

    # Merge results based on mode
    if search_mode == "fts":
        merged = [(obs_id, score) for obs_id, score in fts_results[:limit]]
    elif search_mode == "vector":
        merged = [(obs_id, 1.0 - dist) for obs_id, dist in vector_results[:limit]]
    else:  # hybrid
        merged = _merge_results_rrf(fts_results, vector_results, limit)

    # Fetch observation summaries
    observation_ids = [obs_id for obs_id, _ in merged]
    score_map = {obs_id: score for obs_id, score in merged}

    if observation_ids:
        observations = await memory_repo.fetch_observations(observation_ids)
        results = []
        for obs in observations:
            # Create snippet from narrative (first 200 chars)
            narrative = obs.get("narrative", "")
            snippet = narrative[:200] + "..." if len(narrative) > 200 else narrative

            results.append({
                "observation_id": obs["observation_id"],
                "title": obs["title"],
                "snippet": snippet,
                "type": obs["type"],
                "source": obs["source"],
                "event_time": obs["event_time"],
                "score": score_map.get(obs["observation_id"], 0),
            })
        # Sort by score
        results.sort(key=lambda x: x["score"], reverse=True)
    else:
        results = []

    return {
        "results": results,
        "total": len(results),
        "mode": search_mode,
        "query": query,
    }


async def get_timeline(
    anchor_id: Optional[str] = None,
    anchor_date: Optional[str] = None,
    depth_before: int = 5,
    depth_after: int = 5,
) -> Dict[str, Any]:
    """
    Get observations around a specific point in time.

    Args:
        anchor_id: Observation ID to anchor timeline
        anchor_date: ISO date string to anchor timeline
        depth_before: Number of observations before anchor
        depth_after: Number of observations after anchor

    Returns:
        Dict with observations list and anchor_ts
    """
    from app.utils.time import parse_iso_to_ts

    anchor_ts = None

    # Determine anchor timestamp
    if anchor_id:
        obs = await memory_repo.fetch_observation(anchor_id)
        if obs:
            anchor_ts = obs["event_ts"]
    elif anchor_date:
        anchor_ts = parse_iso_to_ts(anchor_date)

    # Default to current time if no anchor
    if anchor_ts is None:
        anchor_ts = int(time.time() * 1000)

    observations = await memory_repo.get_timeline(
        anchor_ts=anchor_ts,
        depth_before=depth_before,
        depth_after=depth_after,
    )

    return {
        "observations": observations,
        "anchor_ts": anchor_ts,
    }


async def get_stats() -> Dict[str, Any]:
    """
    Get statistics about the memory system.

    Returns:
        Dict with observation stats and ChromaDB info
    """
    stats = await memory_repo.get_observation_stats()

    # Add ChromaDB stats if available
    stats["chroma_available"] = False
    stats["chroma_count"] = 0

    if chroma.is_available():
        try:
            await chroma.initialize()
            stats["chroma_count"] = await chroma.get_count()
            stats["chroma_available"] = True
        except Exception as e:
            logger.warning(f"Failed to get ChromaDB stats: {e}")

    return stats
