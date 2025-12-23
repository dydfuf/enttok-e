from fastapi import APIRouter, Depends, HTTPException

from app.api.deps import verify_token
from app.db import calendar_repo, jobs_repo
from app.schemas.calendar import (
    CalendarAccount,
    CalendarAccountCreate,
    CalendarAccountsResponse,
    CalendarProvider,
    CalendarProviderInfo,
    ProvidersResponse,
)
from app.services.jobs import enqueue_job

router = APIRouter(prefix="/calendar")


SUPPORTED_PROVIDERS: list[CalendarProviderInfo] = [
    CalendarProviderInfo(
        id=CalendarProvider.google,
        label="Google Calendar",
        auth_method="oauth2_pkce",
        scopes=["https://www.googleapis.com/auth/calendar.readonly"],
        notes="Use installed-app OAuth with loopback redirect and refresh tokens stored locally.",
    ),
    CalendarProviderInfo(
        id=CalendarProvider.apple,
        label="Apple Calendar (CalDAV/iCloud)",
        auth_method="caldav_basic",
        scopes=[],
        notes="Use CalDAV endpoint with app-specific passwords; relies on sync tokens.",
    ),
]


@router.get("/providers", response_model=ProvidersResponse)
async def list_providers(_: None = Depends(verify_token)) -> ProvidersResponse:
    return ProvidersResponse(providers=SUPPORTED_PROVIDERS)


@router.post("/accounts", response_model=CalendarAccount)
async def create_account(
    request: CalendarAccountCreate, _: None = Depends(verify_token)
) -> CalendarAccount:
    account = await calendar_repo.create_account(
        request.provider.value,
        request.display_name,
        request.email,
        request.credentials,
        request.config,
    )
    public_account = calendar_repo.to_public_account(account)
    return CalendarAccount(**public_account)


@router.get("/accounts", response_model=CalendarAccountsResponse)
async def list_accounts(_: None = Depends(verify_token)) -> CalendarAccountsResponse:
    accounts = await calendar_repo.list_accounts(public=True)
    return CalendarAccountsResponse(accounts=[CalendarAccount(**account) for account in accounts])


@router.get("/accounts/{account_id}", response_model=CalendarAccount)
async def get_account(
    account_id: str, _: None = Depends(verify_token)
) -> CalendarAccount:
    account = await calendar_repo.fetch_account(account_id, public=True)
    if not account:
        raise HTTPException(status_code=404, detail="calendar account not found")
    return CalendarAccount(**account)


@router.delete("/accounts/{account_id}")
async def delete_account(account_id: str, _: None = Depends(verify_token)) -> dict:
    account = await calendar_repo.fetch_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="calendar account not found")
    await calendar_repo.delete_account(account_id)
    return {"ok": True}


@router.post("/accounts/{account_id}/sync")
async def sync_account(
    account_id: str,
    payload: dict,
    _: None = Depends(verify_token),
) -> dict:
    account = await calendar_repo.fetch_account(account_id)
    if not account:
        raise HTTPException(status_code=404, detail="calendar account not found")
    job_id = await jobs_repo.create_job(
        "connector.calendar.sync", {"account_id": account_id, **payload}
    )
    await enqueue_job(job_id)
    return {"job_id": job_id, "status": "queued"}
