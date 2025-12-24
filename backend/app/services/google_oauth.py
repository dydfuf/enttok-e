"""Google OAuth2 PKCE flow for desktop apps."""

import hashlib
import base64
import secrets
import socket
from typing import Dict, Optional, Tuple
from urllib.parse import urlencode

import httpx

from app.core.config import (
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET,
    GOOGLE_REDIRECT_PORT_MIN,
    GOOGLE_REDIRECT_PORT_MAX,
)
from app.utils.time import utc_now

# Google OAuth endpoints
GOOGLE_AUTH_URI = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URI = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URI = "https://www.googleapis.com/oauth2/v2/userinfo"

# Read-only calendar scope
SCOPES = ["https://www.googleapis.com/auth/calendar.readonly"]

# In-memory storage for pending OAuth states
# Format: {state: {"code_verifier": str, "port": int, "redirect_uri": str, "created_at": str}}
pending_oauth_states: Dict[str, Dict] = {}


def find_available_port() -> int:
    """Find an available port in the configured range."""
    for port in range(GOOGLE_REDIRECT_PORT_MIN, GOOGLE_REDIRECT_PORT_MAX + 1):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise RuntimeError(
        f"No available ports in range {GOOGLE_REDIRECT_PORT_MIN}-{GOOGLE_REDIRECT_PORT_MAX}"
    )


def generate_pkce_pair() -> Tuple[str, str]:
    """Generate PKCE code_verifier and code_challenge (S256)."""
    # Generate a random code_verifier (43-128 characters)
    code_verifier = secrets.token_urlsafe(64)

    # Create S256 code_challenge
    digest = hashlib.sha256(code_verifier.encode()).digest()
    code_challenge = base64.urlsafe_b64encode(digest).rstrip(b"=").decode()

    return code_verifier, code_challenge


def create_auth_url(redirect_uri: str, state: str, code_challenge: str) -> str:
    """Build the Google OAuth authorization URL."""
    if not GOOGLE_CLIENT_ID:
        raise ValueError("GOOGLE_CLIENT_ID is not configured")

    params = {
        "client_id": GOOGLE_CLIENT_ID,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": " ".join(SCOPES),
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        "access_type": "offline",
        "prompt": "consent",  # Force consent to always get refresh_token
    }
    return f"{GOOGLE_AUTH_URI}?{urlencode(params)}"


def start_oauth_flow(backend_port: int) -> Dict:
    """
    Start the OAuth flow.
    Returns auth_url, state, redirect_uri, and port for the callback server.
    """
    if not GOOGLE_CLIENT_ID or not GOOGLE_CLIENT_SECRET:
        raise ValueError("Google OAuth credentials not configured")

    # Use the backend's own port for the callback
    redirect_uri = f"http://127.0.0.1:{backend_port}/calendar/oauth/google/callback"
    state = secrets.token_urlsafe(32)
    code_verifier, code_challenge = generate_pkce_pair()

    # Store state for later verification
    pending_oauth_states[state] = {
        "code_verifier": code_verifier,
        "port": backend_port,
        "redirect_uri": redirect_uri,
        "created_at": utc_now(),
    }

    auth_url = create_auth_url(redirect_uri, state, code_challenge)

    return {
        "auth_url": auth_url,
        "state": state,
        "redirect_uri": redirect_uri,
        "port": backend_port,
    }


def get_pending_state_without_remove(state: str) -> Optional[Dict]:
    """Get pending OAuth state without removing it."""
    return pending_oauth_states.get(state)


def get_pending_state(state: str) -> Optional[Dict]:
    """Get and remove pending OAuth state."""
    return pending_oauth_states.pop(state, None)


async def exchange_code_for_tokens(
    code: str,
    code_verifier: str,
    redirect_uri: str,
) -> Dict:
    """Exchange authorization code for access and refresh tokens."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            GOOGLE_TOKEN_URI,
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "code": code,
                "code_verifier": code_verifier,
                "grant_type": "authorization_code",
                "redirect_uri": redirect_uri,
            },
        )
        if response.status_code != 200:
            error_data = response.json() if response.content else {}
            error_msg = error_data.get("error_description", response.text)
            raise ValueError(f"Token exchange failed: {error_msg}")
        return response.json()


async def get_user_email(access_token: str) -> Optional[str]:
    """Fetch user's email from Google userinfo endpoint."""
    async with httpx.AsyncClient() as client:
        response = await client.get(
            GOOGLE_USERINFO_URI,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        if response.status_code == 200:
            return response.json().get("email")
    return None


async def refresh_access_token(refresh_token: str) -> Dict:
    """Refresh an expired access token."""
    async with httpx.AsyncClient() as client:
        response = await client.post(
            GOOGLE_TOKEN_URI,
            data={
                "client_id": GOOGLE_CLIENT_ID,
                "client_secret": GOOGLE_CLIENT_SECRET,
                "refresh_token": refresh_token,
                "grant_type": "refresh_token",
            },
        )
        if response.status_code != 200:
            error_data = response.json() if response.content else {}
            error_msg = error_data.get("error_description", response.text)
            raise ValueError(f"Token refresh failed: {error_msg}")
        return response.json()


def cleanup_expired_states(max_age_seconds: int = 600) -> None:
    """Remove OAuth states older than max_age_seconds."""
    from datetime import datetime, timedelta, timezone

    cutoff = datetime.now(timezone.utc) - timedelta(seconds=max_age_seconds)
    expired = [
        state
        for state, data in pending_oauth_states.items()
        if datetime.fromisoformat(data["created_at"].replace("Z", "+00:00")) < cutoff
    ]
    for state in expired:
        pending_oauth_states.pop(state, None)
