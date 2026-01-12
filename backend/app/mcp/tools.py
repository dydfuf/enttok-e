"""MCP tool definitions for memory system."""

import asyncio
from typing import Any, Dict, List, Optional


async def search_memory(
    query: str,
    type: Optional[str] = None,
    source: Optional[str] = None,
    limit: int = 10,
    days_back: int = 90,
) -> Dict[str, Any]:
    """
    Search memory observations using hybrid search (keyword + semantic).

    This tool searches your work journal using both keyword matching (FTS5)
    and semantic similarity (vector embeddings) to find relevant observations.

    Use this tool first to get a compact index of matching observations,
    then use get_observations() to retrieve full details for specific IDs.

    Args:
        query: Search query text (supports natural language)
        type: Optional filter by observation type (meeting, task, decision, note)
        source: Optional filter by source (calendar, jira, confluence, manual)
        limit: Maximum results to return (default 10, max 50)
        days_back: How many days to search back (default 90)

    Returns:
        Dict with:
        - results: List of observation summaries with observation_id, title,
                   type, source, event_time, relevance_score
        - total_count: Number of results found
        - search_mode: The search mode used (hybrid)
        - query: The original query

    Example usage:
        # Step 1: Search for relevant observations
        results = search_memory(query="authentication bug", type="task", limit=20)

        # Step 2: Review results and identify relevant IDs

        # Step 3: Get full details
        observations = get_observations(ids=["obs_abc123", "obs_def456"])
    """
    from app.services import search as search_service

    limit = min(limit, 50)  # Cap at 50

    result = await search_service.search(
        query=query,
        limit=limit,
        type_filter=type,
        source_filter=source,
        days_back=days_back,
        search_mode="hybrid",
    )

    return result


async def get_observations(ids: List[str]) -> Dict[str, Any]:
    """
    Get full details for specific observations by ID.

    Use this tool after search_memory() to retrieve complete information
    about selected observations. Always batch multiple IDs in a single
    call for efficiency.

    Args:
        ids: List of observation IDs to retrieve (max 50)

    Returns:
        Dict with:
        - observations: List of full observation details including:
            - observation_id, title, narrative, facts, concepts
            - type, source, source_event_id
            - event_time, event_ts, created_at, updated_at

    Example:
        # After searching and identifying relevant IDs
        result = get_observations(ids=["obs_abc123", "obs_def456", "obs_ghi789"])
        for obs in result["observations"]:
            print(f"{obs['title']}: {obs['narrative']}")
    """
    from app.db import memory_repo

    if not ids:
        return {"observations": [], "count": 0}

    ids = ids[:50]  # Cap at 50
    observations = await memory_repo.fetch_observations(ids)

    return {
        "observations": observations,
        "count": len(observations),
    }


async def timeline(
    anchor_id: Optional[str] = None,
    anchor_date: Optional[str] = None,
    depth_before: int = 5,
    depth_after: int = 5,
) -> Dict[str, Any]:
    """
    Get observations around a specific point in time.

    This tool provides temporal context by showing observations that occurred
    before and after a specific point. Useful for understanding the sequence
    of events or finding related work.

    Provide either anchor_id (an observation ID) or anchor_date (ISO format).
    If neither is provided, uses current time as anchor.

    Args:
        anchor_id: Observation ID to anchor the timeline
        anchor_date: ISO date string to anchor timeline (e.g., "2024-01-15")
        depth_before: Number of observations to show before anchor (default 5)
        depth_after: Number of observations to show after anchor (default 5)

    Returns:
        Dict with:
        - observations: List of observation summaries in chronological order
        - anchor_ts: The timestamp used as anchor

    Example:
        # Get context around a specific observation
        result = timeline(anchor_id="obs_abc123", depth_before=10, depth_after=5)

        # Get observations around a specific date
        result = timeline(anchor_date="2024-01-15", depth_before=5, depth_after=5)
    """
    from app.services import search as search_service

    result = await search_service.get_timeline(
        anchor_id=anchor_id,
        anchor_date=anchor_date,
        depth_before=min(depth_before, 50),
        depth_after=min(depth_after, 50),
    )

    return result


async def memory_stats() -> Dict[str, Any]:
    """
    Get statistics about the memory system.

    Returns overview information about the stored observations including
    counts by type and source, date range covered, and sync status.

    Returns:
        Dict with:
        - total_observations: Total number of stored observations
        - by_type: Count breakdown by observation type
        - by_source: Count breakdown by source
        - date_range: Min and max timestamps covered
        - pending_chroma_sync: Observations waiting for vector indexing
        - chroma_available: Whether vector search is available
        - chroma_count: Number of observations in vector store

    Example:
        stats = memory_stats()
        print(f"Total observations: {stats['total_observations']}")
        print(f"By type: {stats['by_type']}")
    """
    from app.services import search as search_service

    return await search_service.get_stats()


# Registry of all available tools
TOOLS = {
    "search_memory": search_memory,
    "get_observations": get_observations,
    "timeline": timeline,
    "memory_stats": memory_stats,
}
