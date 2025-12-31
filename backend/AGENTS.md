# BACKEND KNOWLEDGE BASE

## OVERVIEW

FastAPI backend for enttok-E. Runs as subprocess from Electron. SQLite database, Google Calendar sync, Claude AI integration.

## STRUCTURE

```
backend/
├── app/
│   ├── main.py           # FastAPI app factory, startup/shutdown
│   ├── api/              # Route handlers
│   │   ├── health.py     # /health endpoint
│   │   ├── status.py     # /status endpoint  
│   │   ├── jobs.py       # /jobs/* job queue endpoints
│   │   ├── claude.py     # /claude/* AI endpoints
│   │   ├── calendar.py   # /calendar/* Google Calendar
│   │   └── events.py     # /events WebSocket endpoint
│   ├── services/         # Business logic
│   │   ├── jobs.py       # Background job processing
│   │   ├── claude.py     # Claude API interaction
│   │   ├── calendar.py   # Calendar event processing
│   │   ├── google_calendar.py  # Google API wrapper
│   │   └── google_oauth.py     # OAuth flow
│   ├── db/               # Database layer
│   │   ├── connection.py # SQLite connection management
│   │   ├── jobs_repo.py  # Jobs table operations
│   │   └── calendar_repo.py  # Calendar table operations
│   ├── schemas/          # Pydantic models
│   ├── core/             # Config, logging
│   ├── websocket/        # WebSocket manager
│   └── utils/            # Helpers
└── pyproject.toml        # uv project config
```

## WHERE TO LOOK

| Task | Location |
|------|----------|
| Add API endpoint | `app/api/` (register in `main.py`) |
| Add business logic | `app/services/` |
| Add Pydantic model | `app/schemas/` |
| Add DB operation | `app/db/` |
| Change config | `app/core/config.py` |

## API ROUTES

| Prefix | Router | Purpose |
|--------|--------|---------|
| `/health` | health.py | Health check |
| `/status` | status.py | App status |
| `/jobs` | jobs.py | Background jobs |
| `/claude` | claude.py | AI spawn/session |
| `/calendar` | calendar.py | Google Calendar CRUD |
| `/events` | events.py | WebSocket stream |

## PATTERNS

**Adding an endpoint:**
```python
# app/api/myfeature.py
from fastapi import APIRouter

router = APIRouter(prefix="/myfeature", tags=["myfeature"])

@router.get("/")
async def get_items():
    return {"items": []}

# app/main.py
from app.api import myfeature
app.include_router(myfeature.router)
```

**Service layer:**
```python
# Keep routes thin, logic in services
@router.post("/process")
async def process(data: ProcessRequest):
    return await my_service.process(data)
```

## CONVENTIONS

- Async everywhere (FastAPI + aiosqlite)
- Pydantic for all request/response models
- Services hold business logic, routes just wire
- Database uses repository pattern

## CONFIGURATION

| Env Var | Default | Purpose |
|---------|---------|---------|
| `BACKEND_PORT` | 49671 | Server port |
| `GOOGLE_CLIENT_ID` | - | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | - | OAuth secret |

Config loaded from `backend/.env` (not committed).

## ANTI-PATTERNS

- Never put business logic in route handlers
- Never use sync DB operations (always async)
- Never hardcode secrets (use .env)
- Never skip Pydantic validation

## RUN

```bash
# Standalone (usually Electron spawns this)
uv run python -m app.main

# With custom port
BACKEND_PORT=8080 uv run python -m app.main
```

## DEPENDENCIES

Managed by uv (see `pyproject.toml`):
- FastAPI + Uvicorn
- Pydantic
- Google API Client
- httpx (async HTTP)
