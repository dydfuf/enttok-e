"""MCP server for enttok-e memory system using FastMCP."""

import asyncio
import logging
import sys
from typing import Optional

logger = logging.getLogger(__name__)

# Try to import FastMCP, provide fallback info if not available
try:
    from mcp.server.fastmcp import FastMCP
    MCP_AVAILABLE = True
except ImportError:
    MCP_AVAILABLE = False
    FastMCP = None

# Create MCP server instance
mcp = None
if MCP_AVAILABLE:
    mcp = FastMCP(
        "enttok-memory",
        instructions="""
# Enttok Memory System

This MCP server provides access to your work journal memory system.
Use these tools to search and retrieve observations from your work history.

## Available Tools

1. **search_memory** - Search observations using hybrid search (keyword + semantic)
   - Use this first to find relevant observations
   - Returns compact summaries for token efficiency

2. **get_observations** - Get full details for specific observation IDs
   - Use after search_memory to get complete information
   - Always batch multiple IDs for efficiency

3. **timeline** - Get temporal context around a point in time
   - Useful for understanding event sequences
   - Shows observations before and after an anchor

4. **memory_stats** - Get statistics about the memory system
   - Shows counts by type and source
   - Includes sync status information

## Progressive Disclosure Workflow

For optimal token efficiency, follow this workflow:

1. Call search_memory() with your query (~100 tokens per result)
2. Review the compact summaries
3. Call get_observations() for IDs you need (~500-1000 tokens each)

This approach saves 50-80% of tokens compared to loading all details upfront.

## Observation Types

- **meeting**: Calendar events and meetings
- **task**: Jira issues and work items
- **note**: Confluence pages and documentation
- **decision**: Important decisions captured
- **activity**: General activity events

## Sources

- **calendar**: Google Calendar events
- **jira**: Jira issues and updates
- **confluence**: Confluence pages and comments
- **manual**: Manually created observations
""",
    )

    # Import tools and register them
    from app.mcp.tools import (
        search_memory,
        get_observations,
        timeline,
        memory_stats,
    )

    @mcp.tool()
    async def search_memory_tool(
        query: str,
        type: Optional[str] = None,
        source: Optional[str] = None,
        limit: int = 10,
        days_back: int = 90,
    ) -> dict:
        """
        Search memory observations using hybrid search (keyword + semantic).

        Returns compact index of matching observations. Use get_observations()
        to retrieve full details for specific IDs.

        Args:
            query: Search query text
            type: Filter by type (meeting, task, decision, note)
            source: Filter by source (calendar, jira, confluence, manual)
            limit: Max results (default 10)
            days_back: Days to search back (default 90)
        """
        return await search_memory(
            query=query,
            type=type,
            source=source,
            limit=limit,
            days_back=days_back,
        )

    @mcp.tool()
    async def get_observations_tool(ids: list[str]) -> dict:
        """
        Get full details for specific observations by ID.

        Always batch multiple IDs in a single call for efficiency.

        Args:
            ids: List of observation IDs to retrieve
        """
        return await get_observations(ids=ids)

    @mcp.tool()
    async def timeline_tool(
        anchor_id: Optional[str] = None,
        anchor_date: Optional[str] = None,
        depth_before: int = 5,
        depth_after: int = 5,
    ) -> dict:
        """
        Get observations around a specific point in time.

        Provide anchor_id or anchor_date, or omit both for current time.

        Args:
            anchor_id: Observation ID to anchor timeline
            anchor_date: ISO date to anchor timeline
            depth_before: Observations before anchor (default 5)
            depth_after: Observations after anchor (default 5)
        """
        return await timeline(
            anchor_id=anchor_id,
            anchor_date=anchor_date,
            depth_before=depth_before,
            depth_after=depth_after,
        )

    @mcp.tool()
    async def memory_stats_tool() -> dict:
        """
        Get statistics about the memory system.

        Returns counts by type/source, date range, and sync status.
        """
        return await memory_stats()


async def init_services():
    """Initialize required services before running MCP server."""
    from app.core.config import ensure_dirs
    from app.db.connection import connect_db
    from app.services import chroma

    ensure_dirs()
    await connect_db()

    if chroma.is_available():
        try:
            await chroma.initialize()
            logger.info("ChromaDB initialized for MCP server")
        except Exception as e:
            logger.warning(f"ChromaDB initialization failed: {e}")


def run_server():
    """Run the MCP server with stdio transport."""
    if not MCP_AVAILABLE:
        print("Error: mcp package not installed. Run: uv add mcp", file=sys.stderr)
        sys.exit(1)

    async def main():
        await init_services()
        logger.info("Starting enttok-memory MCP server...")

    # Initialize services
    asyncio.run(main())

    # Run MCP server
    mcp.run(transport="stdio")


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    run_server()
