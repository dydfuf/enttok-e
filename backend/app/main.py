from __future__ import annotations

import os
import traceback
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# Load .env file from backend directory
_backend_dir = Path(__file__).resolve().parent.parent
load_dotenv(_backend_dir / ".env")

from app.api import activity, calendar, claude, confluence, events, health, jira, jobs, memory, status
from app.core.config import ensure_dirs
from app.core.logging import configure_logging
from app.db.connection import close_db, connect_db
from app.services.jobs import start_workers
from app.services.scheduler import start_scheduler
from app.websocket.manager import manager


def create_app() -> FastAPI:
    configure_logging()
    ensure_dirs()

    app = FastAPI(title="Enttok Backend", version="0.1.0")

    # CORS middleware for Electron app (localhost dev server)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "app://.",  # Electron production
        ],
        allow_credentials=True,
        allow_methods=["*"],
        allow_headers=["*", "X-Backend-Token", "Content-Type"],
        expose_headers=["*"],
    )

    app.include_router(health.router)
    app.include_router(status.router)
    app.include_router(jobs.router)
    app.include_router(claude.router)
    app.include_router(events.router)
    app.include_router(calendar.router)
    app.include_router(jira.router)
    app.include_router(confluence.router)
    app.include_router(activity.router)
    app.include_router(memory.router)

    @app.exception_handler(Exception)
    async def global_exception_handler(request: Request, exc: Exception) -> JSONResponse:
        """Catch all unhandled exceptions and return JSON with proper error info."""
        error_detail = str(exc)
        tb = traceback.format_exc()
        print(f"Unhandled exception: {error_detail}\n{tb}")
        return JSONResponse(
            status_code=500,
            content={"detail": error_detail, "type": type(exc).__name__},
        )

    @app.on_event("startup")
    async def on_startup() -> None:
        await connect_db()
        await start_workers()
        await start_scheduler()
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
