from typing import Any, Dict

from fastapi import APIRouter, Depends

from app.api.deps import verify_token
from app.utils.time import utc_now

router = APIRouter()


@router.get("/health")
async def health(_: None = Depends(verify_token)) -> Dict[str, Any]:
    return {"status": "ok", "time": utc_now()}

