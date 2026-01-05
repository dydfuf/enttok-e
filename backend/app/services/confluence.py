from datetime import datetime, timedelta, timezone
from typing import Any, Dict, List, Optional

import httpx

from app.db.atlassian_repo import build_base_url
from app.db import atlassian_repo, jobs_repo
from app.services.atlassian_client import (
    DEFAULT_TIMEOUT,
    build_auth_headers,
    request_json,
)
from app.utils.time import parse_iso_to_epoch, utc_now
from app.websocket.manager import manager

DEFAULT_LOOKBACK_DAYS = 7
MAX_RESULTS = 50


async def validate_confluence_credentials(
    org: str, email: str, api_token: str
) -> dict:
    base_url = build_base_url(org)
    headers = build_auth_headers(email, api_token)
    api_base = f"{base_url}/wiki/rest/api"
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        data = await request_json(
            client,
            "GET",
            f"{api_base}/user/current",
            headers,
        )
    if not isinstance(data, dict) or not data.get("accountId"):
        raise RuntimeError("Unexpected Confluence response")
    return {
        "base_url": base_url,
        "account_id": data.get("accountId"),
        "display_name": data.get("displayName"),
    }


def _connector_key(account_id: str) -> str:
    return f"confluence:{account_id}"


def _compute_since_ts(last_sync_at: Optional[str]) -> int:
    if last_sync_at:
        try:
            return parse_iso_to_epoch(last_sync_at)
        except ValueError:
            pass
    return int(
        (datetime.now(timezone.utc) - timedelta(days=DEFAULT_LOOKBACK_DAYS)).timestamp()
    )


def _make_event(
    account_id: str,
    event_id: str,
    event_type: str,
    title: str,
    event_time: str,
    event_ts: int,
    description: Optional[str] = None,
    url: Optional[str] = None,
    actor: Optional[str] = None,
    raw: Optional[Dict[str, Any]] = None,
) -> Dict[str, Any]:
    normalized_time = (
        datetime.fromtimestamp(event_ts, tz=timezone.utc)
        .isoformat()
        .replace("+00:00", "Z")
    )
    return {
        "event_id": event_id,
        "source": "confluence",
        "account_id": account_id,
        "event_type": event_type,
        "title": title,
        "description": description,
        "url": url,
        "actor": actor,
        "event_time": normalized_time,
        "event_ts": event_ts,
        "raw": raw,
    }


def _build_web_url(base_url: str, webui: Optional[str]) -> Optional[str]:
    if not webui:
        return None
    if webui.startswith("http"):
        return webui
    return f"{base_url}{webui}"


def _parse_content_events(
    account_id: str,
    content: Dict[str, Any],
    me_id: Optional[str],
    me_name: Optional[str],
    since_ts: int,
    base_url: str,
) -> List[Dict[str, Any]]:
    events: list[Dict[str, Any]] = []
    content_id = content.get("id") or "unknown"
    content_type = content.get("type") or "page"
    title = content.get("title") or "Untitled page"
    links = content.get("_links") or {}
    url = _build_web_url(base_url, links.get("webui"))

    history = content.get("history") or {}
    created_by = history.get("createdBy") or {}
    created_date = history.get("createdDate")
    created_ts = None
    if created_date:
        try:
            created_ts = parse_iso_to_epoch(created_date)
        except ValueError:
            created_ts = None

    version = content.get("version") or {}
    updated_by = version.get("by") or {}
    updated_at = version.get("when")
    updated_ts = None
    if updated_at:
        try:
            updated_ts = parse_iso_to_epoch(updated_at)
        except ValueError:
            updated_ts = None

    if (
        created_date
        and created_ts is not None
        and created_ts >= since_ts
        and created_by.get("accountId") == me_id
    ):
        events.append(
            _make_event(
                account_id=account_id,
                event_id=f"confluence:created:{content_id}",
                event_type=f"{content_type}.created",
                title=title,
                description="Content created",
                url=url,
                actor=created_by.get("displayName") or me_name,
                event_time=created_date,
                event_ts=created_ts,
                raw={"content_id": content_id, "type": content_type},
            )
        )

    if (
        updated_at
        and updated_ts is not None
        and updated_ts >= since_ts
        and updated_by.get("accountId") == me_id
    ):
        if not created_ts or updated_ts != created_ts:
            version_number = version.get("number")
            version_suffix = (
                f":{version_number}" if isinstance(version_number, int) else ""
            )
            events.append(
                _make_event(
                    account_id=account_id,
                    event_id=f"confluence:updated:{content_id}{version_suffix}",
                    event_type=f"{content_type}.updated",
                    title=title,
                    description="Content updated",
                    url=url,
                    actor=updated_by.get("displayName") or me_name,
                    event_time=updated_at,
                    event_ts=updated_ts,
                    raw={"content_id": content_id, "type": content_type},
                )
            )

    return events


def _parse_comment_events(
    account_id: str,
    content: Dict[str, Any],
    me_id: Optional[str],
    me_name: Optional[str],
    since_ts: int,
    base_url: str,
) -> List[Dict[str, Any]]:
    events: list[Dict[str, Any]] = []
    content_id = content.get("id") or "unknown"
    title = content.get("title") or "Comment"
    links = content.get("_links") or {}
    url = _build_web_url(base_url, links.get("webui"))

    history = content.get("history") or {}
    created_by = history.get("createdBy") or {}
    created_date = history.get("createdDate")
    if not created_date:
        return events
    try:
        created_ts = parse_iso_to_epoch(created_date)
    except ValueError:
        return events
    if created_ts < since_ts:
        return events
    if me_id and created_by.get("accountId") != me_id:
        return events

    container = content.get("container") or {}
    container_title = container.get("title")
    description = (
        f"Commented on {container_title}" if container_title else "Comment added"
    )

    events.append(
        _make_event(
            account_id=account_id,
            event_id=f"confluence:comment:{content_id}",
            event_type="comment.created",
            title=title,
            description=description,
            url=url,
            actor=created_by.get("displayName") or me_name,
            event_time=created_date,
            event_ts=created_ts,
            raw={"content_id": content_id, "container": container_title},
        )
    )

    return events


async def _fetch_confluence_events(
    account: Dict[str, Any], since_ts: int
) -> List[Dict[str, Any]]:
    base_url = account["base_url"]
    api_base = f"{base_url}/wiki/rest/api"
    headers = build_auth_headers(account["email"], account["api_token"])

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        me = await request_json(client, "GET", f"{api_base}/user/current", headers)
        me_id = me.get("accountId") if isinstance(me, dict) else None
        me_name = (
            me.get("displayName") if isinstance(me, dict) else None
        ) or account.get("email")

        events: list[Dict[str, Any]] = []

        cql_content = (
            'type in ("page","blogpost") '
            "AND (creator = currentUser() OR lastmodifiedby = currentUser()) "
            f'AND lastmodified >= now("-{DEFAULT_LOOKBACK_DAYS}d") '
            "ORDER BY lastmodified DESC"
        )
        start = 0
        total = None
        while total is None or start < total:
            params = {
                "cql": cql_content,
                "start": start,
                "limit": MAX_RESULTS,
                "expand": "content.history,content.version,content._links",
            }
            data = await request_json(
                client, "GET", f"{api_base}/search", headers, params=params
            )
            if not isinstance(data, dict):
                break
            results = data.get("results") or []
            total = data.get("totalSize", 0)
            if not results:
                break
            for result in results:
                content = result.get("content") if isinstance(result, dict) else None
                if not content and isinstance(result, dict):
                    content = result
                if not isinstance(content, dict):
                    continue
                events.extend(
                    _parse_content_events(
                        account["account_id"],
                        content,
                        me_id,
                        me_name,
                        since_ts,
                        base_url,
                    )
                )
            start += len(results)

        cql_comments = (
            "type = comment AND creator = currentUser() "
            f'AND created >= now("-{DEFAULT_LOOKBACK_DAYS}d") '
            "ORDER BY created DESC"
        )
        start = 0
        total = None
        while total is None or start < total:
            params = {
                "cql": cql_comments,
                "start": start,
                "limit": MAX_RESULTS,
                "expand": "content.history,content.container,content._links",
            }
            data = await request_json(
                client, "GET", f"{api_base}/search", headers, params=params
            )
            if not isinstance(data, dict):
                break
            results = data.get("results") or []
            total = data.get("totalSize", 0)
            if not results:
                break
            for result in results:
                content = result.get("content") if isinstance(result, dict) else None
                if not content and isinstance(result, dict):
                    content = result
                if not isinstance(content, dict):
                    continue
                events.extend(
                    _parse_comment_events(
                        account["account_id"],
                        content,
                        me_id,
                        me_name,
                        since_ts,
                        base_url,
                    )
                )
            start += len(results)

    return events


async def run_confluence_sync_job(job_id: str, payload: Dict[str, Any]) -> None:
    account_id = payload.get("account_id")
    if not account_id:
        await _fail_job(job_id, "account_id is required for confluence sync")
        return

    account = await atlassian_repo.fetch_account(account_id)
    if not account or account.get("service") != "confluence":
        await _fail_job(job_id, f"confluence account not found: {account_id}")
        return

    await jobs_repo.update_job(
        job_id,
        status="running",
        progress=0.1,
        message="Starting Confluence sync",
    )
    await manager.broadcast({"type": "job.status", "job_id": job_id, "status": "running"})
    await jobs_repo.record_event(
        job_id, "info", f"confluence sync started for {account_id}"
    )

    try:
        since_ts = _compute_since_ts(account.get("last_sync_at"))
        events = await _fetch_confluence_events(account, since_ts)
        await atlassian_repo.upsert_events(events)
        await atlassian_repo.update_sync_state(_connector_key(account_id), None)
        await manager.broadcast(
            {
                "type": "activity.sync",
                "source": "confluence",
                "account_id": account_id,
                "synced_events": len(events),
                "timestamp": utc_now(),
            }
        )

        await jobs_repo.update_job(
            job_id,
            status="succeeded",
            progress=1.0,
            message=f"Synced {len(events)} Confluence events",
            result={"account_id": account_id, "synced_events": len(events)},
        )
        await jobs_repo.record_event(
            job_id, "info", f"Synced {len(events)} Confluence events"
        )
        await manager.broadcast(
            {"type": "job.status", "job_id": job_id, "status": "succeeded"}
        )
    except Exception as exc:
        await _fail_job(job_id, str(exc))


async def _fail_job(job_id: str, message: str) -> None:
    await jobs_repo.update_job(job_id, status="failed", error={"message": message})
    await jobs_repo.record_event(job_id, "error", message)
    await manager.emit_log(
        "error", f"confluence sync failed: {message} (job_id={job_id})"
    )
    await manager.broadcast({"type": "job.status", "job_id": job_id, "status": "failed"})
