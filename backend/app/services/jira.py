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


def _build_jql() -> str:
    return (
        "(creator = currentUser() OR reporter = currentUser() OR assignee = currentUser() "
        "OR commenter = currentUser()) "
        f"AND updated >= -{DEFAULT_LOOKBACK_DAYS}d ORDER BY updated DESC"
    )


def _build_search_payload(next_page_token: Optional[str] = None) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "jql": _build_jql(),
        "maxResults": MAX_RESULTS,
        "fieldsByKeys": False,
        "fields": [
            "summary",
            "created",
            "updated",
            "status",
            "creator",
            "reporter",
            "assignee",
            "comment",
        ],
    }
    if next_page_token:
        payload["nextPageToken"] = next_page_token
    return payload


async def validate_jira_credentials(org: str, email: str, api_token: str) -> dict:
    base_url = build_base_url(org)
    headers = build_auth_headers(email, api_token)
    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        data = await request_json(
            client,
            "GET",
            f"{base_url}/rest/api/3/myself",
            headers,
            params={"expand": "groups,applicationRoles"},
        )
    if not isinstance(data, dict) or not data.get("accountId"):
        raise RuntimeError("Unexpected Jira response")
    return {
        "base_url": base_url,
        "account_id": data.get("accountId"),
        "display_name": data.get("displayName"),
    }


def _connector_key(account_id: str) -> str:
    return f"jira:{account_id}"


def _compute_since_ts(last_sync_at: Optional[str], force: bool) -> int:
    lookback_ts = int(
        (datetime.now(timezone.utc) - timedelta(days=DEFAULT_LOOKBACK_DAYS)).timestamp()
    )
    if force:
        return lookback_ts
    if last_sync_at:
        try:
            return parse_iso_to_epoch(last_sync_at)
        except ValueError:
            pass
    return lookback_ts


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
        "source": "jira",
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


def _build_issue_url(base_url: str, issue_key: Optional[str]) -> Optional[str]:
    if not issue_key:
        return None
    return f"{base_url}/browse/{issue_key}"


def _parse_debug_body(response: httpx.Response) -> Any:
    if not response.content:
        return None
    try:
        return response.json()
    except ValueError:
        return response.text


def _is_invalid_payload(body: Any) -> bool:
    if isinstance(body, dict):
        messages = body.get("errorMessages")
        if isinstance(messages, list):
            return any(
                "Invalid request payload" in str(message) for message in messages
            )
    if isinstance(body, str) and "Invalid request payload" in body:
        return True
    return False


async def _run_debug_request(
    client: httpx.AsyncClient,
    url: str,
    headers: Dict[str, str],
    params: Dict[str, str],
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    request_info = {
        "url": url,
        "method": "POST",
        "params": params,
        "body": payload,
    }
    try:
        response = await client.request(
            "POST",
            url,
            headers=headers,
            params=params,
            json=payload,
        )
        return {
            "request": request_info,
            "response": {
                "status": response.status_code,
                "ok": response.is_success,
                "body": _parse_debug_body(response),
            },
        }
    except Exception as exc:
        return {
            "request": request_info,
            "response": {
                "status": 0,
                "ok": False,
                "body": None,
                "error": str(exc),
            },
        }


async def _request_jql_page(
    client: httpx.AsyncClient,
    base_url: str,
    headers: Dict[str, str],
    payload: Dict[str, Any],
) -> Dict[str, Any]:
    url = f"{base_url}/rest/api/3/search/jql"
    params = {"expand": "changelog"}
    try:
        data = await request_json(
            client,
            "POST",
            url,
            headers,
            params=params,
            json_body=payload,
        )
        return data if isinstance(data, dict) else {}
    except RuntimeError as exc:
        message = str(exc)
        if "Invalid request payload" not in message:
            raise
        fallback_payload = {
            "jql": payload.get("jql"),
            "maxResults": payload.get("maxResults"),
        }
        if payload.get("nextPageToken"):
            fallback_payload["nextPageToken"] = payload["nextPageToken"]
        fallback_params = {"expand": "changelog"}
        fields = payload.get("fields") or []
        if fields:
            fallback_params["fields"] = ",".join(fields)
        data = await request_json(
            client,
            "POST",
            url,
            headers,
            params=fallback_params,
            json_body=fallback_payload,
        )
        return data if isinstance(data, dict) else {}


def _parse_issue_events(
    account_id: str,
    issue: Dict[str, Any],
    me_id: Optional[str],
    me_name: Optional[str],
    since_ts: int,
    base_url: str,
) -> List[Dict[str, Any]]:
    events: list[Dict[str, Any]] = []
    fields = issue.get("fields", {})
    issue_id = issue.get("id") or "unknown"
    issue_key = issue.get("key")
    summary = fields.get("summary") or "Untitled issue"
    issue_title = f"{issue_key}: {summary}" if issue_key else summary
    issue_url = _build_issue_url(base_url, issue_key)
    assignee = fields.get("assignee") or {}
    assigned_to_me = bool(me_id and assignee.get("accountId") == me_id)

    created = fields.get("created")
    creator = fields.get("creator") or {}
    updated = fields.get("updated")
    status = fields.get("status") or {}
    status_name = status.get("name")
    if created and creator.get("accountId") == me_id:
        try:
            created_ts = parse_iso_to_epoch(created)
            if created_ts >= since_ts:
                events.append(
                    _make_event(
                        account_id=account_id,
                        event_id=f"jira:issue:created:{issue_id}",
                        event_type="issue.created",
                        title=issue_title,
                        description="Issue created",
                        url=issue_url,
                        actor=creator.get("displayName") or me_name,
                        event_time=created,
                        event_ts=created_ts,
                        raw={"issue": issue_key, "summary": summary},
                    )
                )
        except ValueError:
            pass

    changelog = issue.get("changelog") or {}
    for history in changelog.get("histories", []):
        author = history.get("author") or {}
        if me_id and not assigned_to_me and author.get("accountId") != me_id:
            continue
        history_created = history.get("created")
        if not history_created:
            continue
        try:
            history_ts = parse_iso_to_epoch(history_created)
        except ValueError:
            continue
        if history_ts < since_ts:
            continue
        for item in history.get("items", []):
            if item.get("field") != "status":
                continue
            from_status = item.get("fromString") or "unknown"
            to_status = item.get("toString") or "unknown"
            item_key = item.get("to") or to_status
            events.append(
                _make_event(
                    account_id=account_id,
                    event_id=f"jira:status:{history.get('id')}:{issue_id}:{item_key}",
                    event_type="issue.status.changed",
                    title=issue_title,
                    description=f"Status: {from_status} -> {to_status}",
                    url=issue_url,
                    actor=author.get("displayName") or me_name,
                    event_time=history_created,
                    event_ts=history_ts,
                    raw={"issue": issue_key, "from": from_status, "to": to_status},
                )
            )

    comment_block = fields.get("comment") or {}
    for comment in comment_block.get("comments", []):
        author = comment.get("author") or {}
        if me_id and not assigned_to_me and author.get("accountId") != me_id:
            continue
        created_at = comment.get("created")
        if not created_at:
            continue
        try:
            created_ts = parse_iso_to_epoch(created_at)
        except ValueError:
            continue
        if created_ts < since_ts:
            continue
        comment_id = comment.get("id") or "unknown"
        events.append(
            _make_event(
                account_id=account_id,
                event_id=f"jira:comment:{comment_id}",
                event_type="issue.commented",
                title=issue_title,
                description="Comment added",
                url=issue_url,
                actor=author.get("displayName") or me_name,
                event_time=created_at,
                event_ts=created_ts,
                raw={"issue": issue_key, "comment_id": comment_id},
            )
        )

    if updated:
        try:
            updated_ts = parse_iso_to_epoch(updated)
        except ValueError:
            updated_ts = None
        if updated_ts is not None and updated_ts >= since_ts:
            description = (
                f"Updated (status: {status_name})" if status_name else "Updated"
            )
            events.append(
                _make_event(
                    account_id=account_id,
                    event_id=f"jira:issue:updated:{issue_id}:{updated_ts}",
                    event_type="issue.updated",
                    title=issue_title,
                    description=description,
                    url=issue_url,
                    actor=None,
                    event_time=updated,
                    event_ts=updated_ts,
                    raw={"issue": issue_key, "status": status_name},
                )
            )

    return events


async def _fetch_jira_events(
    account: Dict[str, Any], since_ts: int
) -> List[Dict[str, Any]]:
    base_url = account["base_url"]
    headers = build_auth_headers(account["email"], account["api_token"])

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        me = await request_json(
            client,
            "GET",
            f"{base_url}/rest/api/3/myself",
            headers,
        )
        me_id = me.get("accountId") if isinstance(me, dict) else None
        me_name = (
            me.get("displayName") if isinstance(me, dict) else None
        ) or account.get("email")

        events: list[Dict[str, Any]] = []
        next_page_token: str | None = None

        while True:
            payload = _build_search_payload(next_page_token)
            data = await _request_jql_page(client, base_url, headers, payload)
            issues = data.get("issues") or []
            if not issues:
                break
            for issue in issues:
                events.extend(
                    _parse_issue_events(
                        account["account_id"],
                        issue,
                        me_id,
                        me_name,
                        since_ts,
                        base_url,
                    )
                )
            next_page_token = data.get("nextPageToken")
            if data.get("isLast") or not next_page_token:
                break

    return events


async def debug_jira_search(account: Dict[str, Any]) -> Dict[str, Any]:
    base_url = account["base_url"]
    headers = build_auth_headers(account["email"], account["api_token"])
    url = f"{base_url}/rest/api/3/search/jql"
    params = {"expand": "changelog"}
    payload = _build_search_payload()

    async with httpx.AsyncClient(timeout=DEFAULT_TIMEOUT) as client:
        primary = await _run_debug_request(client, url, headers, params, payload)
        fallback = None
        response_body = primary.get("response", {}).get("body")
        response_status = primary.get("response", {}).get("status")
        if response_status == 400 and _is_invalid_payload(response_body):
            fallback_payload = {
                "jql": payload.get("jql"),
                "maxResults": payload.get("maxResults"),
            }
            fallback_params = {"expand": "changelog"}
            fields = payload.get("fields") or []
            if fields:
                fallback_params["fields"] = ",".join(fields)
            fallback = await _run_debug_request(
                client, url, headers, fallback_params, fallback_payload
            )

    return {
        "account_id": account["account_id"],
        "primary": primary,
        "fallback": fallback,
    }


async def run_jira_sync_job(job_id: str, payload: Dict[str, Any]) -> None:
    account_id = payload.get("account_id")
    if not account_id:
        await _fail_job(job_id, "account_id is required for jira sync")
        return

    account = await atlassian_repo.fetch_account(account_id)
    if not account or account.get("service") != "jira":
        await _fail_job(job_id, f"jira account not found: {account_id}")
        return

    await jobs_repo.update_job(
        job_id,
        status="running",
        progress=0.1,
        message="Starting Jira sync",
    )
    await manager.broadcast({"type": "job.status", "job_id": job_id, "status": "running"})
    await jobs_repo.record_event(job_id, "info", f"jira sync started for {account_id}")

    try:
        force = bool(payload.get("force"))
        since_ts = _compute_since_ts(account.get("last_sync_at"), force)
        events = await _fetch_jira_events(account, since_ts)
        await atlassian_repo.upsert_events(events)
        await atlassian_repo.update_sync_state(_connector_key(account_id), None)
        await manager.broadcast(
            {
                "type": "activity.sync",
                "source": "jira",
                "account_id": account_id,
                "synced_events": len(events),
                "timestamp": utc_now(),
            }
        )

        await jobs_repo.update_job(
            job_id,
            status="succeeded",
            progress=1.0,
            message=f"Synced {len(events)} Jira events",
            result={"account_id": account_id, "synced_events": len(events)},
        )
        await jobs_repo.record_event(
            job_id, "info", f"Synced {len(events)} Jira events"
        )
        await manager.broadcast(
            {"type": "job.status", "job_id": job_id, "status": "succeeded"}
        )
    except Exception as exc:
        await _fail_job(job_id, str(exc))


async def _fail_job(job_id: str, message: str) -> None:
    await jobs_repo.update_job(job_id, status="failed", error={"message": message})
    await jobs_repo.record_event(job_id, "error", message)
    await manager.emit_log("error", f"jira sync failed: {message} (job_id={job_id})")
    await manager.broadcast({"type": "job.status", "job_id": job_id, "status": "failed"})
