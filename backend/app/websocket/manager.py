from typing import Any, Dict, Optional

from fastapi import WebSocket

from app.core.logging import logger
from app.utils.time import utc_now


class WebSocketManager:
    def __init__(self) -> None:
        self.connections: set[WebSocket] = set()

    async def connect(self, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections.add(websocket)

    def disconnect(self, websocket: WebSocket) -> None:
        self.connections.discard(websocket)

    async def broadcast(self, payload: Dict[str, Any]) -> None:
        dead: list[WebSocket] = []
        for conn in self.connections:
            try:
                await conn.send_json(payload)
            except RuntimeError:
                dead.append(conn)
        for conn in dead:
            self.connections.discard(conn)

    async def emit_log(
        self, level: str, message: str, meta: Optional[Dict[str, Any]] = None
    ) -> None:
        log_message = message.strip()
        if not log_message:
            return
        if level == "error":
            logger.error(log_message)
        elif level == "warn":
            logger.warning(log_message)
        else:
            logger.info(log_message)
        await self.broadcast(
            {
                "type": "log",
                "level": level,
                "message": log_message,
                "timestamp": utc_now(),
                "meta": meta,
            }
        )


manager = WebSocketManager()

