from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import HTMLResponse

from app.api.deps import verify_token
from app.core.config import GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
from app.db import calendar_repo, jobs_repo
from app.schemas.calendar import (
    CalendarAccount,
    CalendarAccountCreate,
    CalendarAccountsResponse,
    CalendarProvider,
    CalendarProviderInfo,
    OAuthCallbackRequest,
    OAuthCompleteResponse,
    OAuthStartResponse,
    ProvidersResponse,
)
from app.services.google_oauth import (
    exchange_code_for_tokens,
    get_pending_state,
    get_pending_state_without_remove,
    get_user_email,
    start_oauth_flow,
    SCOPES,
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


# =============================================================================
# Google OAuth Endpoints
# =============================================================================


@router.post("/oauth/google/start", response_model=OAuthStartResponse)
async def start_google_oauth(
    request: Request,
    _: None = Depends(verify_token),
) -> OAuthStartResponse:
    """
    Start Google OAuth flow.
    Returns auth URL that frontend should open in user's default browser.
    """
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise HTTPException(
            status_code=500,
            detail="Google OAuth not configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
        )

    # Get the backend port from the request
    backend_port = request.url.port or 80

    try:
        result = start_oauth_flow(backend_port)
        return OAuthStartResponse(**result)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/oauth/google/callback", response_class=HTMLResponse)
async def google_oauth_callback(
    code: str = None,
    state: str = None,
    error: str = None,
):
    """
    Handle OAuth callback from Google.
    This is called by Google after user authorizes.
    """
    # Error from Google
    if error:
        return HTMLResponse(
            content=f"""
            <!DOCTYPE html>
            <html>
            <head><title>Authorization Failed</title></head>
            <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center;">
                    <h1 style="color: #dc2626;">Authorization Failed</h1>
                    <p>Error: {error}</p>
                    <p>You can close this window.</p>
                </div>
            </body>
            </html>
            """,
            status_code=400,
        )

    if not code or not state:
        return HTMLResponse(
            content="""
            <!DOCTYPE html>
            <html>
            <head><title>Authorization Failed</title></head>
            <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center;">
                    <h1 style="color: #dc2626;">Authorization Failed</h1>
                    <p>Missing authorization code or state.</p>
                    <p>You can close this window.</p>
                </div>
            </body>
            </html>
            """,
            status_code=400,
        )

    # Retrieve pending state
    state_data = get_pending_state(state)
    if not state_data:
        return HTMLResponse(
            content="""
            <!DOCTYPE html>
            <html>
            <head><title>Authorization Failed</title></head>
            <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center;">
                    <h1 style="color: #dc2626;">Authorization Failed</h1>
                    <p>Invalid or expired OAuth state. Please try again.</p>
                    <p>You can close this window.</p>
                </div>
            </body>
            </html>
            """,
            status_code=400,
        )

    try:
        # Exchange authorization code for tokens
        tokens = await exchange_code_for_tokens(
            code=code,
            code_verifier=state_data["code_verifier"],
            redirect_uri=state_data["redirect_uri"],
        )

        # Get user email from Google
        email = await get_user_email(tokens["access_token"])

        # Store credentials
        credentials_payload = {
            "access_token": tokens["access_token"],
            "refresh_token": tokens.get("refresh_token"),
            "expires_in": tokens.get("expires_in"),
        }

        # Create calendar account
        await calendar_repo.create_account(
            provider="google",
            display_name=email or "Google Calendar",
            email=email,
            credentials=credentials_payload,
            config={"scopes": SCOPES},
        )

        return HTMLResponse(
            content=f"""
            <!DOCTYPE html>
            <html>
            <head><title>Authorization Successful</title></head>
            <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0fdf4;">
                <div style="text-align: center;">
                    <h1 style="color: #16a34a;">Authorization Successful!</h1>
                    <p>Google Calendar ({email or 'account'}) has been connected.</p>
                    <p style="color: #666;">You can close this window and return to the app.</p>
                </div>
            </body>
            </html>
            """
        )

    except Exception as e:
        return HTMLResponse(
            content=f"""
            <!DOCTYPE html>
            <html>
            <head><title>Authorization Failed</title></head>
            <body style="font-family: system-ui; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0;">
                <div style="text-align: center;">
                    <h1 style="color: #dc2626;">Authorization Failed</h1>
                    <p>Error: {str(e)}</p>
                    <p>You can close this window and try again.</p>
                </div>
            </body>
            </html>
            """,
            status_code=500,
        )


@router.post("/oauth/google/complete", response_model=OAuthCompleteResponse)
async def complete_google_oauth(
    request: OAuthCallbackRequest,
    _: None = Depends(verify_token),
) -> OAuthCompleteResponse:
    """
    Complete OAuth flow by exchanging code for tokens.
    Called by frontend after receiving callback from Google.
    (This is now optional - the callback endpoint handles everything)
    """
    # Retrieve and validate pending state
    state_data = get_pending_state(request.state)
    if not state_data:
        raise HTTPException(status_code=400, detail="Invalid or expired OAuth state")

    try:
        # Exchange authorization code for tokens
        tokens = await exchange_code_for_tokens(
            code=request.code,
            code_verifier=state_data["code_verifier"],
            redirect_uri=state_data["redirect_uri"],
        )
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Token exchange failed: {str(e)}")

    # Get user email from Google
    email = await get_user_email(tokens["access_token"])

    # Store credentials
    credentials_payload = {
        "access_token": tokens["access_token"],
        "refresh_token": tokens.get("refresh_token"),
        "expires_in": tokens.get("expires_in"),
    }

    # Create calendar account
    account = await calendar_repo.create_account(
        provider="google",
        display_name=email or "Google Calendar",
        email=email,
        credentials=credentials_payload,
        config={"scopes": SCOPES},
    )

    public_account = calendar_repo.to_public_account(account)

    return OAuthCompleteResponse(
        account=CalendarAccount(**public_account),
        success=True,
        message="Google Calendar connected successfully",
    )
