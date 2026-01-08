# Current Architecture Analysis

## Overview

현재 백엔드는 **Python 3.11+ / FastAPI** 기반으로 구현되어 있으며, Electron 앱에서 서브프로세스로 실행됩니다.

## Directory Structure

```
backend/
├── app/
│   ├── main.py              # FastAPI 앱 팩토리, 라우터 등록
│   ├── api/                  # Route handlers
│   │   ├── deps.py          # 인증 의존성 (verify_token)
│   │   ├── health.py        # GET /health
│   │   ├── status.py        # GET /status
│   │   ├── jobs.py          # /jobs CRUD
│   │   ├── claude.py        # /claude spawn/session
│   │   ├── calendar.py      # /calendar OAuth, sync
│   │   ├── jira.py          # /jira accounts, sync
│   │   ├── confluence.py    # /confluence accounts, sync
│   │   ├── activity.py      # /activity events
│   │   └── events.py        # WebSocket /events
│   ├── services/             # Business logic
│   │   ├── jobs.py          # Job queue worker
│   │   ├── claude.py        # Claude CLI subprocess
│   │   ├── sessions.py      # In-memory session manager
│   │   ├── calendar.py      # Calendar sync orchestration
│   │   ├── google_calendar.py # Google Calendar API
│   │   ├── google_oauth.py  # OAuth PKCE flow
│   │   ├── jira.py          # Jira integration
│   │   ├── confluence.py    # Confluence integration
│   │   ├── atlassian_client.py # Shared Atlassian HTTP client
│   │   └── scheduler.py     # Background job scheduler
│   ├── db/                   # Repository pattern
│   │   ├── connection.py    # SQLite connection management
│   │   ├── jobs_repo.py     # Jobs table operations
│   │   ├── calendar_repo.py # Calendar tables operations
│   │   └── atlassian_repo.py # Atlassian tables operations
│   ├── schemas/              # Pydantic models
│   │   ├── jobs.py
│   │   ├── claude.py
│   │   ├── calendar.py
│   │   ├── atlassian.py
│   │   ├── jira.py
│   │   └── activity.py
│   ├── websocket/
│   │   └── manager.py       # WebSocket broadcast manager
│   ├── core/
│   │   ├── config.py        # Environment configuration
│   │   └── logging.py       # Logging setup
│   └── utils/
│       └── time.py          # Time utilities
└── pyproject.toml            # uv dependencies
```

## Dependencies

```toml
# pyproject.toml
dependencies = [
  "fastapi>=0.115.0",
  "uvicorn[standard]>=0.30.0",
  "pydantic[email]>=2.0.0",
  "python-dotenv>=1.0.0",
  "google-auth>=2.29.0",
  "google-auth-oauthlib>=1.2.0",
  "google-api-python-client>=2.127.0",
  "httpx>=0.27.0"
]
```

## API Endpoints

### Health & Status
| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | 시스템 헬스체크 |
| GET | `/status` | 백엔드 상태 (uptime, queue depth) |

### Jobs
| Method | Path | Description |
|--------|------|-------------|
| POST | `/jobs` | 작업 생성 및 큐잉 |
| GET | `/jobs` | 작업 목록 조회 |
| GET | `/jobs/{job_id}` | 특정 작업 조회 |
| POST | `/jobs/{job_id}/cancel` | 작업 취소 |

### Claude AI
| Method | Path | Description |
|--------|------|-------------|
| POST | `/claude/spawn` | Claude CLI 실행 작업 큐잉 |
| POST | `/claude/session` | 새 대화 세션 생성 |

### Calendar
| Method | Path | Description |
|--------|------|-------------|
| GET | `/calendar/providers` | 지원 캘린더 제공자 목록 |
| POST | `/calendar/accounts` | 캘린더 계정 생성 |
| GET | `/calendar/accounts` | 계정 목록 조회 |
| GET | `/calendar/accounts/{id}` | 특정 계정 조회 |
| DELETE | `/calendar/accounts/{id}` | 계정 삭제 |
| GET | `/calendar/calendars` | 캘린더 목록 조회 |
| PATCH | `/calendar/calendars/{account_id}/{calendar_id}` | 캘린더 선택 토글 |
| GET | `/calendar/events` | 이벤트 조회 (날짜 범위) |
| POST | `/calendar/accounts/{id}/sync` | 캘린더 동기화 |
| POST | `/calendar/oauth/google/start` | Google OAuth 시작 |
| GET | `/calendar/oauth/google/callback` | OAuth 콜백 |
| POST | `/calendar/oauth/google/complete` | OAuth 완료 |

### Jira
| Method | Path | Description |
|--------|------|-------------|
| GET | `/jira/accounts` | Jira 계정 목록 |
| POST | `/jira/accounts` | Jira 계정 추가 |
| DELETE | `/jira/accounts/{id}` | 계정 삭제 |
| POST | `/jira/accounts/{id}/sync` | Jira 동기화 |

### Confluence
| Method | Path | Description |
|--------|------|-------------|
| GET | `/confluence/accounts` | Confluence 계정 목록 |
| POST | `/confluence/accounts` | 계정 추가 |
| DELETE | `/confluence/accounts/{id}` | 계정 삭제 |
| POST | `/confluence/accounts/{id}/sync` | Confluence 동기화 |

### Activity
| Method | Path | Description |
|--------|------|-------------|
| GET | `/activity/events` | 활동 이벤트 조회 |

### WebSocket
| Protocol | Path | Description |
|----------|------|-------------|
| WS | `/events` | 실시간 이벤트 스트림 |

## Database Schema

SQLite 기반, 8개 테이블:

### jobs
```sql
CREATE TABLE jobs (
  job_id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  progress REAL DEFAULT 0,
  message TEXT,
  payload_json TEXT,
  result_json TEXT,
  error_json TEXT
);
```

### job_events
```sql
CREATE TABLE job_events (
  event_id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  level TEXT NOT NULL,
  message TEXT NOT NULL,
  meta_json TEXT
);
```

### sync_state
```sql
CREATE TABLE sync_state (
  connector TEXT PRIMARY KEY,
  cursor TEXT,
  last_sync_at TEXT
);
```

### calendar_accounts
```sql
CREATE TABLE calendar_accounts (
  account_id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  email TEXT NOT NULL,
  display_name TEXT,
  credentials_json TEXT,
  config_json TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
```

### calendar_calendars
```sql
CREATE TABLE calendar_calendars (
  account_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  is_primary INTEGER DEFAULT 0,
  access_role TEXT,
  background_color TEXT,
  foreground_color TEXT,
  time_zone TEXT,
  selected INTEGER DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, calendar_id)
);
```

### calendar_events
```sql
CREATE TABLE calendar_events (
  account_id TEXT NOT NULL,
  calendar_id TEXT NOT NULL,
  event_id TEXT NOT NULL,
  title TEXT,
  description TEXT,
  start_time TEXT,
  end_time TEXT,
  start_ts INTEGER,
  end_ts INTEGER,
  all_day INTEGER DEFAULT 0,
  location TEXT,
  conference_url TEXT,
  visibility TEXT,
  status TEXT,
  organizer_json TEXT,
  attendees_json TEXT,
  html_link TEXT,
  time_zone TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  PRIMARY KEY (account_id, calendar_id, event_id)
);
CREATE INDEX idx_events_time ON calendar_events(start_ts, end_ts);
CREATE INDEX idx_events_account ON calendar_events(account_id, calendar_id);
```

### atlassian_accounts
```sql
CREATE TABLE atlassian_accounts (
  account_id TEXT PRIMARY KEY,
  service TEXT NOT NULL,
  org TEXT NOT NULL,
  base_url TEXT NOT NULL,
  email TEXT NOT NULL,
  api_token TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX idx_atlassian_service ON atlassian_accounts(service);
```

### activity_events
```sql
CREATE TABLE activity_events (
  event_id TEXT PRIMARY KEY,
  source TEXT NOT NULL,
  account_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  title TEXT,
  description TEXT,
  url TEXT,
  actor TEXT,
  event_time TEXT,
  event_ts INTEGER,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  raw_json TEXT
);
CREATE INDEX idx_activity_ts ON activity_events(event_ts);
CREATE INDEX idx_activity_source ON activity_events(source);
CREATE INDEX idx_activity_account ON activity_events(account_id);
```

## Key Patterns

### 1. Authentication
모든 보호된 라우트는 `verify_token` 의존성 사용:
```python
@router.get("/protected")
async def protected(_: None = Depends(verify_token)):
    return {"status": "ok"}
```

### 2. Repository Pattern
DB 작업은 repository 클래스로 추상화:
```python
# db/jobs_repo.py
async def create_job(job: JobCreate) -> JobRecord:
    ...
```

### 3. Service Layer
비즈니스 로직은 서비스 레이어에서 처리:
```python
# services/jobs.py
async def process_job(job_id: str) -> None:
    ...
```

### 4. WebSocket Broadcasting
실시간 업데이트는 WebSocketManager를 통해 브로드캐스트:
```python
await manager.broadcast("job:status", {"job_id": job_id, "status": "running"})
```

### 5. Async Everywhere
모든 I/O 작업은 비동기:
```python
async def fetch_data():
    async with httpx.AsyncClient() as client:
        response = await client.get(url)
```

## Electron Integration

### Backend Startup Flow
```
Electron Main Process
       │
       ▼
startBackend() ──────────────────────────────────────
       │
       ├── ensureBackendDirs()     # 데이터/로그 디렉토리 생성
       ├── getAvailablePort()      # 동적 포트 할당
       ├── generateToken()         # 인증 토큰 생성
       │
       ▼
spawn(command, args) ────────────────────────────────
       │
       ├── Dev:  uv run python -m app.main
       └── Prod: {bundled_python} -m app.main
       │
       ▼
waitForBackendReady() ───────────────────────────────
       │
       └── Health check polling until ready
```

### Environment Variables
| Variable | Description |
|----------|-------------|
| `BACKEND_PORT` | 서버 포트 (동적 할당) |
| `BACKEND_TOKEN` | 인증 토큰 (런타임 생성) |
| `APP_DATA_DIR` | SQLite DB 디렉토리 |
| `LOG_DIR` | 로그 파일 디렉토리 |
| `RUN_ENV` | 실행 환경 (dev/prod) |
| `GOOGLE_CLIENT_ID` | Google OAuth 클라이언트 ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 시크릿 |

## Code Metrics

| Category | Files | Approx. Lines |
|----------|-------|---------------|
| API Routes | 10 | ~600 |
| Services | 10 | ~1,200 |
| DB Repos | 4 | ~400 |
| Schemas | 6 | ~300 |
| Core/Utils | 4 | ~200 |
| **Total** | **34** | **~2,700** |
