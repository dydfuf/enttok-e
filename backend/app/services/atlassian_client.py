import asyncio
import base64
from typing import Any, Dict, Optional

import httpx


DEFAULT_TIMEOUT = httpx.Timeout(20.0, connect=10.0)


def build_auth_headers(email: str, api_token: str) -> Dict[str, str]:
    token = base64.b64encode(f"{email}:{api_token}".encode()).decode()
    return {
        "Authorization": f"Basic {token}",
        "Accept": "application/json",
        "Content-Type": "application/json",
    }


async def request_json(
    client: httpx.AsyncClient,
    method: str,
    url: str,
    headers: Dict[str, str],
    params: Optional[Dict[str, Any]] = None,
    json_body: Optional[Dict[str, Any]] = None,
    retries: int = 2,
) -> Any:
    attempt = 0
    while True:
        response = await client.request(
            method,
            url,
            headers=headers,
            params=params,
            json=json_body,
        )
        if response.status_code == 429 and attempt < retries:
            retry_after = response.headers.get("Retry-After")
            delay = 1.0
            if retry_after and retry_after.isdigit():
                delay = max(1.0, float(retry_after))
            await asyncio.sleep(delay)
            attempt += 1
            continue
        if response.status_code >= 500 and attempt < retries:
            await asyncio.sleep(0.5 * (attempt + 1))
            attempt += 1
            continue
        if response.status_code >= 400:
            detail = response.text.strip() or response.reason_phrase
            raise RuntimeError(f"Atlassian API error {response.status_code}: {detail}")
        if not response.content:
            return None
        return response.json()
