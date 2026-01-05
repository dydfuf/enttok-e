from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import verify_token
from app.db import atlassian_repo, jobs_repo
from app.schemas.atlassian import (
    AtlassianAccount,
    AtlassianAccountCreate,
    AtlassianAccountsResponse,
    AtlassianSyncResponse,
)
from app.services.jobs import enqueue_job
from app.services.confluence import validate_confluence_credentials

router = APIRouter(prefix="/confluence")


@router.get("/accounts", response_model=AtlassianAccountsResponse)
async def list_accounts(_: None = Depends(verify_token)) -> AtlassianAccountsResponse:
    accounts = await atlassian_repo.list_accounts(service="confluence", public=True)
    return AtlassianAccountsResponse(
        accounts=[AtlassianAccount(**account) for account in accounts]
    )


@router.post("/accounts", response_model=AtlassianAccount)
async def create_account(
    request: AtlassianAccountCreate, _: None = Depends(verify_token)
) -> AtlassianAccount:
    org = request.org.strip()
    try:
        await validate_confluence_credentials(org, request.email, request.api_token)
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail=f"Confluence connection failed: {exc}"
        ) from exc
    account = await atlassian_repo.create_account(
        "confluence", org, request.email, request.api_token
    )
    public_account = atlassian_repo.to_public_account(account)
    return AtlassianAccount(**public_account)


@router.delete("/accounts/{account_id}")
async def delete_account(
    account_id: str, _: None = Depends(verify_token)
) -> dict:
    account = await atlassian_repo.fetch_account(account_id)
    if not account or account.get("service") != "confluence":
        raise HTTPException(status_code=404, detail="confluence account not found")
    await atlassian_repo.delete_account(account_id)
    return {"ok": True}


@router.post("/accounts/{account_id}/sync", response_model=AtlassianSyncResponse)
async def sync_account(
    account_id: str, _: None = Depends(verify_token)
) -> AtlassianSyncResponse:
    account = await atlassian_repo.fetch_account(account_id)
    if not account or account.get("service") != "confluence":
        raise HTTPException(status_code=404, detail="confluence account not found")
    job_id = await jobs_repo.create_job(
        "connector.confluence.sync", {"account_id": account_id}
    )
    await enqueue_job(job_id)
    return AtlassianSyncResponse(job_id=job_id, status="queued")
