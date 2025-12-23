from fastapi import HTTPException, Request, WebSocket

from app.core.config import BACKEND_TOKEN


async def verify_token(request: Request) -> None:
    if BACKEND_TOKEN and request.headers.get("X-Backend-Token") != BACKEND_TOKEN:
        raise HTTPException(status_code=401, detail="unauthorized")


async def verify_ws_token(websocket: WebSocket) -> bool:
    if BACKEND_TOKEN and websocket.headers.get("x-backend-token") != BACKEND_TOKEN:
        await websocket.close(code=1008)
        return False
    return True
