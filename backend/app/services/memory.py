"""Memory capture service for converting events to observations."""

import logging
import time
from datetime import datetime
from typing import Any, Dict, List, Optional

from app.db import memory_repo
from app.db import atlassian_repo
from app.db import calendar_repo
from app.services import chroma
from app.utils.time import utc_now, parse_iso_to_ts

logger = logging.getLogger(__name__)

# Observation type mappings
EVENT_TYPE_TO_OBS_TYPE = {
    # Calendar events
    "calendar_event": "meeting",
    # Jira events
    "issue_created": "task",
    "issue_updated": "task",
    "issue_commented": "task",
    "issue_status_changed": "task",
    # Confluence events
    "page_created": "note",
    "page_updated": "note",
    "comment_added": "note",
    # GitHub events
    "pr_authored": "task",
    "pr_reviewed": "task",
    "commit": "activity",
    # Claude Code events
    "claude_session": "activity",
}


async def create_observation(
    title: str,
    narrative: str,
    type: str,
    source: str,
    event_time: str,
    event_ts: Optional[int] = None,
    facts: Optional[List[str]] = None,
    concepts: Optional[List[str]] = None,
    source_event_id: Optional[str] = None,
    project_path: Optional[str] = None,
) -> str:
    """
    Create a new observation and queue for ChromaDB sync.

    Returns:
        The observation_id of the created observation
    """
    # Parse event_ts if not provided
    if event_ts is None:
        event_ts = parse_iso_to_ts(event_time)

    observation_id = await memory_repo.create_observation(
        title=title,
        narrative=narrative,
        type=type,
        source=source,
        event_time=event_time,
        event_ts=event_ts,
        facts=facts,
        concepts=concepts,
        source_event_id=source_event_id,
        project_path=project_path,
    )

    logger.info(f"Created observation {observation_id}: {title[:50]}")

    # Try to sync to ChromaDB immediately if available
    if chroma.is_available():
        try:
            obs = await memory_repo.fetch_observation(observation_id)
            if obs:
                text = chroma.compose_embedding_text(obs)
                metadata = {
                    "type": obs["type"],
                    "source": obs["source"],
                    "project_path": obs.get("project_path") or "",
                    "event_ts": obs["event_ts"],
                }
                await chroma.sync_observation(observation_id, text, metadata)
                await memory_repo.mark_chroma_synced([observation_id])
        except Exception as e:
            logger.warning(f"Failed to sync observation to ChromaDB: {e}")

    return observation_id


async def process_calendar_event(event: Dict[str, Any]) -> Optional[str]:
    """
    Convert a calendar event into an observation.

    Args:
        event: Calendar event dict with title, description, start_time, etc.

    Returns:
        observation_id if created, None if already processed or skipped
    """
    # Build unique source ID
    source_id = f"{event.get('account_id', 'unknown')}:{event.get('calendar_id', '')}:{event.get('event_id', '')}"

    # Check if already processed
    if await memory_repo.is_event_processed("calendar_event", source_id):
        return None

    # Skip cancelled events
    if event.get("status") == "cancelled":
        return None

    # Skip events without title
    title = event.get("title") or "Untitled Meeting"

    # Build narrative
    narrative_parts = [f"Meeting: {title}"]

    if event.get("description"):
        desc = event["description"][:500]  # Limit description length
        narrative_parts.append(f"Description: {desc}")

    if event.get("location"):
        narrative_parts.append(f"Location: {event['location']}")

    if event.get("conference_url"):
        narrative_parts.append(f"Conference: {event['conference_url']}")

    # Extract attendees
    attendees = event.get("attendees") or []
    if attendees:
        attendee_names = [a.get("email", a.get("displayName", "unknown")) for a in attendees[:10]]
        narrative_parts.append(f"Attendees: {', '.join(attendee_names)}")

    narrative = "\n".join(narrative_parts)

    # Extract facts
    facts = []
    if event.get("all_day"):
        facts.append("All-day event")
    if event.get("conference_url"):
        facts.append("Has video conference")
    if len(attendees) > 1:
        facts.append(f"{len(attendees)} attendees")

    # Determine event time
    event_time = event.get("start_time") or event.get("end_time") or utc_now()
    event_ts = event.get("start_ts") or parse_iso_to_ts(event_time)

    observation_id = await create_observation(
        title=title,
        narrative=narrative,
        type="meeting",
        source="calendar",
        event_time=event_time,
        event_ts=event_ts,
        facts=facts if facts else None,
        concepts=None,
        source_event_id=event.get("event_id"),
    )

    await memory_repo.record_event_processed("calendar_event", source_id, observation_id)
    return observation_id


async def process_activity_event(event: Dict[str, Any]) -> Optional[str]:
    """
    Convert an activity event (Jira/Confluence) into an observation.

    Args:
        event: Activity event dict with source, event_type, title, etc.

    Returns:
        observation_id if created, None if already processed or skipped
    """
    source_id = event.get("event_id", "")
    source_type = f"{event.get('source', 'unknown')}_{event.get('event_type', 'unknown')}"

    # Check if already processed
    if await memory_repo.is_event_processed(source_type, source_id):
        return None

    title = event.get("title", "Untitled Activity")

    # Build narrative
    narrative_parts = [f"{event.get('event_type', 'Activity')}: {title}"]

    if event.get("description"):
        desc = event["description"][:500]
        narrative_parts.append(f"Description: {desc}")

    if event.get("url"):
        narrative_parts.append(f"Link: {event['url']}")

    if event.get("actor"):
        narrative_parts.append(f"By: {event['actor']}")

    narrative = "\n".join(narrative_parts)

    # Determine observation type
    event_type_key = event.get("event_type", "unknown")
    obs_type = EVENT_TYPE_TO_OBS_TYPE.get(event_type_key, "activity")

    # Determine source
    source = event.get("source", "unknown")

    event_time = event.get("event_time") or utc_now()
    event_ts = event.get("event_ts") or parse_iso_to_ts(event_time)

    observation_id = await create_observation(
        title=title,
        narrative=narrative,
        type=obs_type,
        source=source,
        event_time=event_time,
        event_ts=event_ts,
        facts=None,
        concepts=None,
        source_event_id=source_id,
    )

    await memory_repo.record_event_processed(source_type, source_id, observation_id)
    return observation_id


async def process_github_pr(pr: Dict[str, Any], pr_type: str = "authored") -> Optional[str]:
    """
    Convert a GitHub PR into an observation.

    Args:
        pr: PR dict with number, title, url, state, repository, createdAt, updatedAt
        pr_type: "authored" or "reviewed"

    Returns:
        observation_id if created, None if already processed
    """
    source_id = f"github:pr:{pr_type}:{pr.get('repository', '')}:{pr.get('number', '')}"

    # Check if already processed
    if await memory_repo.is_event_processed("github_pr", source_id):
        return None

    title = pr.get("title", "Untitled PR")
    repo = pr.get("repository", "unknown")
    number = pr.get("number", 0)
    state = pr.get("state", "open")
    url = pr.get("url", "")

    # Build narrative
    action = "Created" if pr_type == "authored" else "Reviewed"
    narrative_parts = [
        f"{action} PR #{number} in {repo}",
        f"Title: {title}",
        f"State: {state}",
    ]
    if url:
        narrative_parts.append(f"URL: {url}")

    narrative = "\n".join(narrative_parts)

    # Extract facts
    facts = [
        f"PR #{number}",
        f"Repository: {repo}",
        f"Type: {pr_type}",
    ]
    if state:
        facts.append(f"State: {state}")

    # Determine event time
    event_time = pr.get("updatedAt") or pr.get("createdAt") or utc_now()
    event_ts = parse_iso_to_ts(event_time)

    observation_id = await create_observation(
        title=f"PR: {title}",
        narrative=narrative,
        type="task",
        source="github",
        event_time=event_time,
        event_ts=event_ts,
        facts=facts,
        concepts=["pull-request", repo.split("/")[-1] if "/" in repo else repo],
        source_event_id=source_id,
    )

    await memory_repo.record_event_processed("github_pr", source_id, observation_id)
    return observation_id


async def process_github_commit(commit: Dict[str, Any]) -> Optional[str]:
    """
    Convert a GitHub commit into an observation.

    Args:
        commit: Commit dict with sha, message, repository, url, createdAt

    Returns:
        observation_id if created, None if already processed
    """
    sha = commit.get("sha", "")[:7]  # Short SHA
    repo = commit.get("repository", "unknown")
    source_id = f"github:commit:{repo}:{sha}"

    # Check if already processed
    if await memory_repo.is_event_processed("github_commit", source_id):
        return None

    message = commit.get("message", "No message")
    # Take first line of commit message as title
    title_line = message.split("\n")[0][:100]
    url = commit.get("url", "")

    # Build narrative
    narrative_parts = [
        f"Committed to {repo}",
        f"Message: {message[:500]}",
    ]
    if url:
        narrative_parts.append(f"URL: {url}")

    narrative = "\n".join(narrative_parts)

    # Extract facts
    facts = [
        f"SHA: {sha}",
        f"Repository: {repo}",
    ]

    # Determine event time
    event_time = commit.get("createdAt") or utc_now()
    event_ts = parse_iso_to_ts(event_time)

    observation_id = await create_observation(
        title=f"Commit: {title_line}",
        narrative=narrative,
        type="activity",
        source="github",
        event_time=event_time,
        event_ts=event_ts,
        facts=facts,
        concepts=["commit", repo.split("/")[-1] if "/" in repo else repo],
        source_event_id=source_id,
    )

    await memory_repo.record_event_processed("github_commit", source_id, observation_id)
    return observation_id


async def process_claude_session(session: Dict[str, Any]) -> Optional[str]:
    """
    Convert a Claude Code session into an observation.

    Args:
        session: Session dict with id, summary, firstMessage, timestamp,
                 messageCount, gitBranch, projectPath

    Returns:
        observation_id if created, None if already processed
    """
    session_id = session.get("id", "")
    source_id = f"claude:session:{session_id}"

    # Check if already processed
    if await memory_repo.is_event_processed("claude_session", source_id):
        return None

    summary = session.get("summary", "")
    first_message = session.get("firstMessage", "")
    message_count = session.get("messageCount", 0)
    git_branch = session.get("gitBranch", "")
    project_path = session.get("projectPath", "")

    # Use summary or first message as title
    title = summary[:100] if summary else first_message[:100] if first_message else "Claude Session"

    # Build narrative
    narrative_parts = [f"Claude Code session"]
    if summary:
        narrative_parts.append(f"Summary: {summary}")
    if first_message and first_message != summary:
        narrative_parts.append(f"Initial request: {first_message[:300]}")
    if git_branch:
        narrative_parts.append(f"Branch: {git_branch}")
    if project_path:
        # Extract project name from path
        project_name = project_path.split("/")[-1] if "/" in project_path else project_path
        narrative_parts.append(f"Project: {project_name}")

    narrative = "\n".join(narrative_parts)

    # Extract facts
    facts = [f"{message_count} messages"]
    if git_branch:
        facts.append(f"Branch: {git_branch}")

    # Extract concepts
    concepts = ["claude-code"]
    if project_path:
        project_name = project_path.split("/")[-1] if "/" in project_path else project_path
        concepts.append(project_name)

    # Determine event time
    event_time = session.get("timestamp") or utc_now()
    event_ts = parse_iso_to_ts(event_time)

    observation_id = await create_observation(
        title=title,
        narrative=narrative,
        type="activity",
        source="claude",
        event_time=event_time,
        event_ts=event_ts,
        facts=facts,
        concepts=concepts,
        source_event_id=source_id,
        project_path=project_path,
    )

    await memory_repo.record_event_processed("claude_session", source_id, observation_id)
    return observation_id


async def batch_process_github(
    prs_authored: List[Dict[str, Any]],
    prs_reviewed: List[Dict[str, Any]],
    commits: List[Dict[str, Any]],
) -> Dict[str, int]:
    """
    Process GitHub activity into observations.

    Returns:
        Dict with counts of processed items
    """
    results = {"prs_authored": 0, "prs_reviewed": 0, "commits": 0}

    for pr in prs_authored:
        try:
            obs_id = await process_github_pr(pr, "authored")
            if obs_id:
                results["prs_authored"] += 1
        except Exception as e:
            logger.error(f"Error processing authored PR: {e}")

    for pr in prs_reviewed:
        try:
            obs_id = await process_github_pr(pr, "reviewed")
            if obs_id:
                results["prs_reviewed"] += 1
        except Exception as e:
            logger.error(f"Error processing reviewed PR: {e}")

    for commit in commits:
        try:
            obs_id = await process_github_commit(commit)
            if obs_id:
                results["commits"] += 1
        except Exception as e:
            logger.error(f"Error processing commit: {e}")

    total = sum(results.values())
    logger.info(f"Processed {total} GitHub items into observations: {results}")
    return results


async def batch_process_claude_sessions(
    sessions: List[Dict[str, Any]],
) -> int:
    """
    Process Claude Code sessions into observations.

    Returns:
        Count of processed sessions
    """
    count = 0
    for session in sessions:
        try:
            obs_id = await process_claude_session(session)
            if obs_id:
                count += 1
        except Exception as e:
            logger.error(f"Error processing Claude session: {e}")

    logger.info(f"Processed {count} Claude sessions into observations")
    return count


async def batch_process_events(
    start_ts: int,
    end_ts: int,
    sources: Optional[List[str]] = None,
) -> Dict[str, int]:
    """
    Process multiple events into observations.

    Args:
        start_ts: Start timestamp (Unix)
        end_ts: End timestamp (Unix)
        sources: Optional list of sources to process (calendar, jira, confluence)

    Returns:
        Dict with counts of processed events by source
    """
    results = {"calendar": 0, "jira": 0, "confluence": 0}

    if sources is None:
        sources = ["calendar", "jira", "confluence"]

    # Process calendar events
    if "calendar" in sources:
        try:
            calendar_events = await calendar_repo.list_events(
                start_ts=start_ts,
                end_ts=end_ts,
            )
            for event in calendar_events:
                obs_id = await process_calendar_event(event)
                if obs_id:
                    results["calendar"] += 1
        except Exception as e:
            logger.error(f"Error processing calendar events: {e}")

    # Process activity events (Jira, Confluence)
    if "jira" in sources or "confluence" in sources:
        try:
            activity_sources = []
            if "jira" in sources:
                activity_sources.append("jira")
            if "confluence" in sources:
                activity_sources.append("confluence")

            activity_events = await atlassian_repo.list_events(
                start_ts=start_ts,
                end_ts=end_ts,
                sources=activity_sources,
            )
            for event in activity_events:
                obs_id = await process_activity_event(event)
                if obs_id:
                    source = event.get("source", "unknown")
                    if source in results:
                        results[source] += 1
        except Exception as e:
            logger.error(f"Error processing activity events: {e}")

    total = sum(results.values())
    logger.info(f"Processed {total} events into observations: {results}")

    return results


async def run_memory_process_job(
    job_id: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Background job handler for processing events into observations.

    Args:
        job_id: The job ID for tracking
        payload: Job payload with optional window_minutes, sources

    Returns:
        Result dict with processed counts
    """
    from app.db import jobs_repo

    try:
        await jobs_repo.update_job(job_id, status="running", progress=0.1)

        # Determine time window
        window_minutes = payload.get("window_minutes", 60)
        end_ts = int(time.time() * 1000)  # Current time in ms
        start_ts = end_ts - (window_minutes * 60 * 1000)

        sources = payload.get("sources")  # None means all

        await jobs_repo.update_job(job_id, progress=0.2, message="Processing events...")

        results = await batch_process_events(start_ts, end_ts, sources)

        await jobs_repo.update_job(
            job_id,
            status="succeeded",
            progress=1.0,
            result=results,
            message=f"Processed {sum(results.values())} events",
        )

        return results

    except Exception as e:
        logger.error(f"Memory process job {job_id} failed: {e}")
        await jobs_repo.update_job(
            job_id,
            status="failed",
            error={"message": str(e)},
        )
        raise


async def run_chroma_sync_job(
    job_id: str,
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    """
    Background job handler for syncing observations to ChromaDB.

    Args:
        job_id: The job ID for tracking
        payload: Job payload (unused)

    Returns:
        Result dict with synced count
    """
    from app.db import jobs_repo

    try:
        await jobs_repo.update_job(job_id, status="running", progress=0.1)

        if not chroma.is_available():
            await jobs_repo.update_job(
                job_id,
                status="succeeded",
                progress=1.0,
                result={"synced": 0, "message": "ChromaDB not available"},
            )
            return {"synced": 0}

        await chroma.initialize()
        await jobs_repo.update_job(job_id, progress=0.3, message="Syncing to ChromaDB...")

        synced_count = await chroma.sync_pending_observations()

        await jobs_repo.update_job(
            job_id,
            status="succeeded",
            progress=1.0,
            result={"synced": synced_count},
            message=f"Synced {synced_count} observations",
        )

        return {"synced": synced_count}

    except Exception as e:
        logger.error(f"Chroma sync job {job_id} failed: {e}")
        await jobs_repo.update_job(
            job_id,
            status="failed",
            error={"message": str(e)},
        )
        raise
