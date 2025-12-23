from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.deps import verify_ws_token
from app.utils.time import utc_now
from app.websocket.manager import manager

router = APIRouter()


@router.websocket("/events")
async def events(websocket: WebSocket) -> None:
    if not await verify_ws_token(websocket):
        return
    await manager.connect(websocket)
    await websocket.send_json({"type": "connected", "timestamp": utc_now()})
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        manager.disconnect(websocket)
