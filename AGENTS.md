# ENTTOKK-E PROJECT KNOWLEDGE BASE

**Generated:** 2026-01-03
**Commit:** [current]
**Branch:** main

## OVERVIEW

Desktop work journal app with AI-powered suggestions. Python FastAPI backend + Electron/React frontend. TanStack Router, shadcn/ui, SQLite, Google Calendar integration.

## STRUCTURE

```
enttokk-e/
├── backend/              # FastAPI backend (Python 3.11+)
│   ├── app/
│   │   ├── api/          # Route handlers
│   │   ├── services/      # Business logic
│   │   ├── db/           # SQLite repositories
│   │   ├── schemas/       # Pydantic models
│   │   ├── core/         # Config, logging
│   │   ├── websocket/     # WebSocket manager
│   │   └── utils/        # Time utilities
│   └── pyproject.toml     # uv package config
│
├── electron-app/          # Electron + React 19 frontend
│   ├── electron/          # Main process (TypeScript)
│   │   ├── main.ts       # App entry
│   │   ├── preload.ts     # contextBridge API
│   │   └── main/         # IPC, backend, window, runtime
│   ├── src/              # Renderer code
│   │   ├── routes/       # TanStack Router (file-based)
│   │   ├── components/    # shadcn/ui + custom
│   │   ├── contexts/      # React contexts
│   │   ├── hooks/        # Custom hooks
│   │   └── lib/          # Utilities
│   └── package.json       # npm config
│
├── docs/                 # Project documentation
└── KIRA_REFERENCE/       # Reference implementation (do NOT modify)
```

## WHERE TO LOOK

| Task | Location | Notes |
|------|----------|-------|
| Backend API endpoints | `backend/app/api/` | FastAPI routers |
| Backend business logic | `backend/app/services/` | Job processing, calendar sync |
| Add route | `electron-app/src/routes/_app/` | Auto-registered |
| Add component | `electron-app/src/components/` | Use shadcn for UI |
| Add hook | `electron-app/src/hooks/` | Prefixed `use` |
| IPC communication | `electron-app/electron/` | preload + main/ipc.ts |
| Database schema | `backend/app/db/` | Repository pattern |

## CODE MAP

Backend (Python):
- `FastAPI` app factory → `backend/app/main.py`
- `WebSocketManager` singleton → real-time broadcasts
- Job queue system → background processing
- OAuth flow → Google Calendar integration
- `asyncio` everywhere with aiosqlite

Frontend (TypeScript):
- `TanStackRouter` → file-based routing with hash history
- `React Contexts` → BackendContext, VaultContext, GitHubContext
- `shadcn/ui` → 53 pre-built components
- `CodeMirror` → Editor with live preview
- IPC bridge → contextBridge pattern

## CONVENTIONS

**Backend (Python/FastAPI):**
- Async everywhere (FastAPI + aiosqlite)
- Services hold business logic, routes just wire
- Repository pattern for database operations
- Pydantic for all request/response models
- UTC timestamps, ISO string format

**Frontend (React/TypeScript):**
- Components in PascalCase directories
- Hooks prefixed with `use`
- File-based routing (TanStack Router)
- shadcn/ui components untouched in `ui/`
- Custom components outside `ui/`
- Path aliases: `@/` for `src/`

**Monorepo:**
- Independent package management (uv for backend, npm for frontend)
- Backend spawned as subprocess from Electron
- No shared code between backend and frontend
- AGENTS.md per major subdirectory

## ANTI-PATTERNS (THIS PROJECT)

**Backend:**
- Never put business logic in route handlers
- Never use sync DB operations (always async)
- Never hardcode secrets (use .env)
- Never skip Pydantic validation

**Frontend:**
- Never import from `electron` in renderer (use preload bridge)
- Never edit `routeTree.gen.ts` (auto-generated)
- Never put business logic in components (use hooks/services)
- Never use relative imports across `src/` (use `@/` alias)

## COMMANDS

```bash
# Backend
cd backend
uv run python -m app.main          # Start server
uv sync                            # Install dependencies

# Frontend
cd electron-app
pnpm dev                           # Start Vite + Electron
pnpm build                          # Build React + Electron
pnpm package                        # Package installers
pnpm lint                           # Biome lint
pnpm format                         # Biome format
```

## NOTES

- No CI/CD configured (`.github/workflows/` is empty)
- No automated tests (dependencies present but not configured)
- Backend runs on port 49671 (configurable)
- KIRA_REFERENCE is a different project, only for reference
- All data stored locally (SQLite for backend, filesystem for notes)
