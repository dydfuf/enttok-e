from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import verify_token
from app.db import atlassian_repo, jobs_repo
from app.schemas.atlassian import (
    AtlassianAccount,
    AtlassianAccountCreate,
    AtlassianAccountsResponse,
    AtlassianSyncResponse,
)
from app.schemas.jira import JiraDebugRequest, JiraDebugResponse
from app.services.jobs import enqueue_job
from app.services.jira import debug_jira_search, validate_jira_credentials

router = APIRouter(prefix="/jira")


@router.get("/accounts", response_model=AtlassianAccountsResponse)
async def list_accounts(_: None = Depends(verify_token)) -> AtlassianAccountsResponse:
    accounts = await atlassian_repo.list_accounts(service="jira", public=True)
    return AtlassianAccountsResponse(
        accounts=[AtlassianAccount(**account) for account in accounts]
    )


@router.post("/accounts", response_model=AtlassianAccount)
async def create_account(
    request: AtlassianAccountCreate, _: None = Depends(verify_token)
) -> AtlassianAccount:
    org = request.org.strip()
    try:
        await validate_jira_credentials(org, request.email, request.api_token)
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Jira connection failed: {exc}"
        ) from exc
    account = await atlassian_repo.create_account(
        "jira", org, request.email, request.api_token
    )
    public_account = atlassian_repo.to_public_account(account)
    return AtlassianAccount(**public_account)


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: str, _: None = Depends(verify_token)
) -> dict:
    account = await atlassian_repo.fetch_account(account_id)
    if not account or account.get("service") != "jira":
        raise HTTPException(status_code=404, detail="jira account not found")
    await atlassian_repo.delete_account(account_id)
    return {"ok": True}


@router.post("/accounts/{account_id}/sync", response_model=AtlassianSyncResponse)
async def sync_account(
    account_id: str, force: bool = True, _: None = Depends(verify_token)
) -> AtlassianSyncResponse:
    account = await atlassian_repo.fetch_account(account_id)
    if not account or account.get("service") != "jira":
        raise HTTPException(status_code=404, detail="jira account not found")
    job_id = await jobs_repo.create_job(
        "connector.jira.sync", {"account_id": account_id, "force": force}
    )
    await enqueue_job(job_id)
    return AtlassianSyncResponse(job_id=job_id, status="queued")


@router.post("/dev/search", response_model=JiraDebugResponse)
async def debug_search(
    request: JiraDebugRequest, _: None = Depends(verify_token)
) -> JiraDebugResponse:
    account = await atlassian_repo.fetch_account(request.account_id)
    if not account or account.get("service") != "jira":
        raise HTTPException(status_code=404, detail="jira account not found")
    data = await debug_jira_search(account)
    return JiraDebugResponse(**data)
