from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.api.deps import verify_token
from app.services.jobs import status_snapshot

router = APIRouter()


@router.get("/status")
async def status(_: None = Depends(verify_token)) -> Dict[str, Any]:
    return status_snapshot()

