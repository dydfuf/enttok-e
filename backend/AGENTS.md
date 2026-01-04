# BACKEND KNOWLEDGE BASE

## OVERVIEW
FastAPI backend for enttok-E managing SQLite persistence, Google Calendar synchronization, and Claude AI conversation sessions.

## STRUCTURE
```
backend/
├── app/
│   ├── main.py           # FastAPI app factory and router registration
│   ├── api/              # Route handlers
│   │   ├── deps.py       # Auth dependencies (verify_token)
│   │   └── ...           # health, status, jobs, claude, calendar, events
│   ├── services/         # Business logic (jobs, claude, sessions, calendar)
│   ├── db/               # Repository pattern (SQLite + aiosqlite)
│   ├── schemas/          # Pydantic models for request/response
│   ├── websocket/        # Real-time event broadcasting (manager.py)
│   ├── core/             # Configuration (config.py) and logging
│   └── utils/            # Time and formatting helpers
└── pyproject.toml        # uv project configuration
```

## WHERE TO LOOK
| Task | Location |
|------|----------|
| Add API endpoint | `app/api/` (register in `main.py`) |
| Add business logic | `app/services/` |
| Modify Auth/Deps | `app/api/deps.py` |
| Database operations | `app/db/` |
| AI Session Logic | `app/services/sessions.py` |
| Change config | `app/core/config.py` |

## API ROUTES
| Prefix | Router | Purpose |
|--------|--------|---------|
| `/health` | health.py | System health check |
| `/status` | status.py | Backend application status |
| `/jobs` | jobs.py | Background task queue management |
| `/claude` | claude.py | Claude AI integration and sessions |
| `/calendar` | calendar.py | Google Calendar CRUD operations |
| `/events` | events.py | WebSocket log and event stream |

## PATTERNS
**Authentication:**
All protected routes must use the `verify_token` dependency for security.
```python
@router.post("/secure")
async def secure_route(_: None = Depends(verify_token)):
    return {"status": "ok"}
```

**AI Session Management:**
`app/services/sessions.py` handles history and limits (max chars/messages).
```python
session = session_manager.get_session(session_id)
await session.add_message("user", content)
```

**Service Layer:**
Keep route handlers thin. Delegate all complexity to services.
```python
@router.post("/process")
async def process(data: MySchema, service: MyService = Depends()):
    return await service.execute(data)
```

## CONVENTIONS
- **Async Everywhere**: Use `await` for all I/O (DB, HTTP, File).
- **Repository Pattern**: Abstract DB operations into repository classes in `app/db/`.
- **Pydantic Validation**: Strict typing for all request bodies and response models.
- **WebSocket Broadcast**: Use `WebSocketManager.broadcast()` for UI notifications.

## CONFIGURATION
| Env Var | Default | Purpose |
|---------|---------|---------|
| `BACKEND_PORT` | 49671 | Server port |
| `GOOGLE_CLIENT_ID` | - | OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | - | OAuth secret |
Config is loaded from `backend/.env` via `app/core/config.py`.

## ANTI-PATTERNS
- **Sync Blocking**: Never use `time.sleep()` or sync `requests`; use `asyncio.sleep` or `httpx`.
- **Logic in Routes**: Do not perform DB queries or complex logic directly in handlers.
- **Auth Bypass**: Avoid exposing endpoints without `verify_token` unless public.
- **Hardcoded Secrets**: Never put API keys in code; use environment variables.

## RUN & DEPENDENCIES
```bash
# Managed by uv
uv run python -m app.main
```
Key deps: FastAPI, Pydantic, aiosqlite, httpx, google-api-python-client.
