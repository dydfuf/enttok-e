from __future__ import annotations

import os

from fastapi import FastAPI

from app.api import claude, events, health, jobs, status
from app.core.config import ensure_dirs
from app.core.logging import configure_logging
from app.db.connection import close_db, connect_db
from app.services.jobs import start_workers
from app.websocket.manager import manager


def create_app() -> FastAPI:
    configure_logging()
    ensure_dirs()

    app = FastAPI(title="Enttok Backend", version="0.1.0")
    app.include_router(health.router)
    app.include_router(status.router)
    app.include_router(jobs.router)
    app.include_router(claude.router)
    app.include_router(events.router)

    @app.on_event("startup")
    async def on_startup() -> None:
        await connect_db()
        await start_workers()
        await manager.emit_log("info", "backend started")

    @app.on_event("shutdown")
    async def on_shutdown() -> None:
        await close_db()

    return app


app = create_app()


def run() -> None:
    import uvicorn

    port = int(os.environ.get("BACKEND_PORT", "49671"))
    uvicorn.run(
        "app.main:app",
        host="127.0.0.1",
        port=port,
        log_level="info",
    )


if __name__ == "__main__":
    run()
