# Technology Stack Mapping

## Python → TypeScript/Bun 매핑

이 문서는 현재 Python 백엔드의 각 구성요소를 Bun/TypeScript 생태계의 대응 기술로 매핑합니다.

## Runtime & Framework

| Category | Python | Bun/TypeScript | Notes |
|----------|--------|----------------|-------|
| Runtime | Python 3.11+ | Bun | 단일 바이너리 컴파일 지원 |
| Web Framework | FastAPI | Elysia | Bun-first, 타입 안전, 고성능 |
| ASGI Server | Uvicorn | Bun.serve | 내장 HTTP 서버 |
| Package Manager | uv | bun | 내장 패키지 매니저 |

## Database

| Category | Python | Bun/TypeScript | Notes |
|----------|--------|----------------|-------|
| SQLite Driver | aiosqlite | bun:sqlite | 내장, 의존성 없음 |
| ORM/Query | Raw SQL | Raw SQL / Drizzle | 선택적 ORM 사용 가능 |
| Async Model | 비동기 (aiosqlite) | 동기 (더 빠름) | WAL 모드 권장 |

### SQLite 코드 비교

**Python (현재)**
```python
# db/connection.py
import aiosqlite

async def get_db():
    return await aiosqlite.connect(DB_PATH)

async def execute(query: str, params: tuple = ()):
    async with await get_db() as db:
        cursor = await db.execute(query, params)
        await db.commit()
        return cursor
```

**TypeScript (목표)**
```typescript
// db/connection.ts
import { Database } from "bun:sqlite";

const db = new Database("data/index.db");
db.exec("PRAGMA journal_mode = WAL");

export function execute(query: string, params: any[] = []) {
  return db.run(query, params);
}

export function query<T>(sql: string, params: any[] = []): T[] {
  return db.query(sql).all(params) as T[];
}
```

## Validation & Schemas

| Category | Python | Bun/TypeScript | Notes |
|----------|--------|----------------|-------|
| Schema Definition | Pydantic | TypeBox | Elysia 내장, JSON Schema 호환 |
| Runtime Validation | Pydantic | TypeBox | 컴파일 타임 + 런타임 |
| Email Validation | pydantic[email] | TypeBox Format | 내장 포맷 검증 |

### Schema 코드 비교

**Python (현재)**
```python
# schemas/jobs.py
from pydantic import BaseModel
from typing import Optional
from datetime import datetime

class JobCreate(BaseModel):
    type: str
    payload: Optional[dict] = None

class JobResponse(BaseModel):
    job_id: str
    type: str
    status: str
    created_at: datetime
    progress: float = 0
    message: Optional[str] = None
```

**TypeScript (목표)**
```typescript
// schemas/jobs.ts
import { t, Static } from "elysia";

export const JobCreate = t.Object({
  type: t.String(),
  payload: t.Optional(t.Record(t.String(), t.Unknown())),
});

export const JobResponse = t.Object({
  job_id: t.String(),
  type: t.String(),
  status: t.String(),
  created_at: t.String({ format: "date-time" }),
  progress: t.Number({ default: 0 }),
  message: t.Optional(t.String()),
});

export type JobCreate = Static<typeof JobCreate>;
export type JobResponse = Static<typeof JobResponse>;
```

## HTTP Client

| Category | Python | Bun/TypeScript | Notes |
|----------|--------|----------------|-------|
| HTTP Client | httpx | fetch | Bun 내장 |
| Async Requests | httpx.AsyncClient | fetch + async/await | 네이티브 Promise |

### HTTP 코드 비교

**Python (현재)**
```python
# services/atlassian_client.py
import httpx

async def fetch_jira_issues(base_url: str, auth: str):
    async with httpx.AsyncClient() as client:
        response = await client.get(
            f"{base_url}/rest/api/3/search",
            headers={"Authorization": f"Basic {auth}"},
            timeout=30.0
        )
        response.raise_for_status()
        return response.json()
```

**TypeScript (목표)**
```typescript
// services/atlassian.ts
export async function fetchJiraIssues(baseUrl: string, auth: string) {
  const response = await fetch(`${baseUrl}/rest/api/3/search`, {
    headers: { Authorization: `Basic ${auth}` },
    signal: AbortSignal.timeout(30000),
  });

  if (!response.ok) {
    throw new Error(`Jira API error: ${response.status}`);
  }

  return response.json();
}
```

## WebSocket

| Category | Python | Bun/TypeScript | Notes |
|----------|--------|----------------|-------|
| WebSocket Server | FastAPI WebSocket | Bun.serve websocket | 내장, Pub/Sub 지원 |
| Broadcasting | Custom Manager | Built-in Pub/Sub | 토픽 기반 브로드캐스트 |

### WebSocket 코드 비교

**Python (현재)**
```python
# websocket/manager.py
from fastapi import WebSocket

class WebSocketManager:
    def __init__(self):
        self.connections: set[WebSocket] = set()

    async def connect(self, ws: WebSocket):
        await ws.accept()
        self.connections.add(ws)

    async def broadcast(self, event: str, data: dict):
        message = json.dumps({"event": event, "data": data})
        for ws in self.connections.copy():
            try:
                await ws.send_text(message)
            except:
                self.connections.discard(ws)
```

**TypeScript (목표)**
```typescript
// websocket/manager.ts
type WSClient = { send(data: string): void };

class WebSocketManager {
  private clients = new Set<WSClient>();

  add(ws: WSClient) {
    this.clients.add(ws);
  }

  remove(ws: WSClient) {
    this.clients.delete(ws);
  }

  broadcast(event: string, data: unknown) {
    const message = JSON.stringify({ event, data, timestamp: new Date().toISOString() });
    for (const client of this.clients) {
      try {
        client.send(message);
      } catch {
        this.clients.delete(client);
      }
    }
  }
}

export const wsManager = new WebSocketManager();
```

## External APIs

### Google Calendar

| Category | Python | Bun/TypeScript | Notes |
|----------|--------|----------------|-------|
| OAuth Library | google-auth-oauthlib | Custom PKCE impl | 또는 @hono/oauth-providers |
| Calendar API | google-api-python-client | googleapis | npm 패키지 |

**Python (현재)**
```python
# services/google_calendar.py
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials

def get_calendar_service(credentials_json: dict):
    credentials = Credentials.from_authorized_user_info(credentials_json)
    return build("calendar", "v3", credentials=credentials)

async def list_events(service, calendar_id: str, time_min: str, time_max: str):
    events = service.events().list(
        calendarId=calendar_id,
        timeMin=time_min,
        timeMax=time_max,
        singleEvents=True,
        orderBy="startTime"
    ).execute()
    return events.get("items", [])
```

**TypeScript (목표)**
```typescript
// services/calendar/google.ts
import { google, calendar_v3 } from "googleapis";
import { OAuth2Client } from "google-auth-library";

export function getCalendarService(credentials: { access_token: string; refresh_token: string }) {
  const oauth2Client = new OAuth2Client(
    Bun.env.GOOGLE_CLIENT_ID,
    Bun.env.GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials(credentials);
  return google.calendar({ version: "v3", auth: oauth2Client });
}

export async function listEvents(
  service: calendar_v3.Calendar,
  calendarId: string,
  timeMin: string,
  timeMax: string
) {
  const response = await service.events.list({
    calendarId,
    timeMin,
    timeMax,
    singleEvents: true,
    orderBy: "startTime",
  });
  return response.data.items ?? [];
}
```

### Jira / Confluence

| Category | Python | Bun/TypeScript | Notes |
|----------|--------|----------------|-------|
| Jira Client | httpx (custom) | jira.js | 타입 안전 클라이언트 |
| Confluence Client | httpx (custom) | confluence.js | 타입 안전 클라이언트 |

**Python (현재)**
```python
# services/jira.py
import httpx
import base64

async def search_issues(base_url: str, email: str, token: str, jql: str):
    auth = base64.b64encode(f"{email}:{token}".encode()).decode()
    async with httpx.AsyncClient() as client:
        response = await client.post(
            f"{base_url}/rest/api/3/search",
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/json"
            },
            json={"jql": jql, "maxResults": 100}
        )
        return response.json()
```

**TypeScript (목표)**
```typescript
// services/jira.ts
import { Version3Client } from "jira.js";

export function createJiraClient(baseUrl: string, email: string, token: string) {
  return new Version3Client({
    host: baseUrl,
    authentication: {
      basic: { email, apiToken: token },
    },
  });
}

export async function searchIssues(client: Version3Client, jql: string) {
  return client.issueSearch.searchForIssuesUsingJql({
    jql,
    maxResults: 100,
  });
}
```

## Subprocess Execution

| Category | Python | Bun/TypeScript | Notes |
|----------|--------|----------------|-------|
| Subprocess | asyncio.subprocess | Bun.spawn | 네이티브 API |
| Shell Commands | asyncio.create_subprocess_exec | Bun.$ | Shell 템플릿 리터럴 |

**Python (현재)**
```python
# services/claude.py
import asyncio

async def spawn_claude(args: list[str], stdin: str | None = None):
    proc = await asyncio.create_subprocess_exec(
        "claude", *args,
        stdin=asyncio.subprocess.PIPE if stdin else None,
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE
    )
    stdout, stderr = await proc.communicate(stdin.encode() if stdin else None)
    return stdout.decode(), stderr.decode(), proc.returncode
```

**TypeScript (목표)**
```typescript
// services/claude.ts
export async function spawnClaude(args: string[], stdin?: string) {
  const proc = Bun.spawn(["claude", ...args], {
    stdin: stdin ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
  });

  if (stdin && proc.stdin) {
    proc.stdin.write(stdin);
    proc.stdin.end();
  }

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  return { stdout, stderr, exitCode };
}
```

## Configuration

| Category | Python | Bun/TypeScript | Notes |
|----------|--------|----------------|-------|
| Env Loading | python-dotenv | Bun.env | 내장 .env 지원 |
| Type-safe Config | Pydantic Settings | Custom + TypeBox | 환경변수 검증 |

**Python (현재)**
```python
# core/config.py
import os
from dotenv import load_dotenv

load_dotenv()

BACKEND_PORT = int(os.environ.get("BACKEND_PORT", "49671"))
BACKEND_TOKEN = os.environ.get("BACKEND_TOKEN", "")
GOOGLE_CLIENT_ID = os.environ.get("GOOGLE_CLIENT_ID", "")
```

**TypeScript (목표)**
```typescript
// lib/config.ts
export const config = {
  port: parseInt(Bun.env.BACKEND_PORT ?? "49671"),
  token: Bun.env.BACKEND_TOKEN ?? "",
  dataDir: Bun.env.APP_DATA_DIR ?? "./data",
  logDir: Bun.env.LOG_DIR ?? "./data/logs",
  google: {
    clientId: Bun.env.GOOGLE_CLIENT_ID ?? "",
    clientSecret: Bun.env.GOOGLE_CLIENT_SECRET ?? "",
  },
} as const;

// Validate required config
if (!config.google.clientId) {
  console.warn("GOOGLE_CLIENT_ID not set");
}
```

## Dependency Summary

### Python (현재)
```toml
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

### TypeScript (목표)
```json
{
  "dependencies": {
    "elysia": "^1.1.0",
    "@elysiajs/cors": "^1.1.0",
    "googleapis": "^140.0.0",
    "jira.js": "^4.0.0",
    "confluence.js": "^2.0.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "typescript": "^5.5.0"
  }
}
```

### 내장 기능 (의존성 불필요)
- HTTP Server: `Bun.serve`
- SQLite: `bun:sqlite`
- WebSocket: `Bun.serve` websocket
- Environment: `Bun.env`
- Subprocess: `Bun.spawn`, `Bun.$`
- File System: `Bun.file`, `Bun.write`
- Hashing: `Bun.hash`, `Bun.CryptoHasher`
