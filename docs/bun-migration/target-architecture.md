# Target Architecture (Bun)

## Overview

Bun 기반의 TypeScript 백엔드로 마이그레이션하며, **Elysia** 프레임워크를 사용합니다. 핵심 목표는 **단일 실행 파일로 크로스 컴파일**하여 배포를 단순화하는 것입니다.

## Technology Stack

| Layer | Technology | Reason |
|-------|------------|--------|
| Runtime | **Bun** | 단일 바이너리 컴파일, 내장 SQLite/WebSocket |
| Framework | **Elysia** | Bun-first, FastAPI와 유사한 DX, 타입 안전성 |
| Database | **bun:sqlite** | 내장, 의존성 없음, 동기식 고성능 |
| Validation | **TypeBox** | Elysia 내장, Pydantic과 유사 |
| HTTP Client | **fetch** | Bun 내장 |
| WebSocket | **Bun.serve** | 내장 Pub/Sub API |

## Directory Structure

```
backend-bun/
├── src/
│   ├── index.ts              # 엔트리포인트, 서버 설정
│   ├── app.ts                # Elysia 앱 팩토리
│   ├── routes/               # Route handlers
│   │   ├── health.ts
│   │   ├── status.ts
│   │   ├── jobs.ts
│   │   ├── claude.ts
│   │   ├── calendar.ts
│   │   ├── jira.ts
│   │   ├── confluence.ts
│   │   ├── activity.ts
│   │   └── events.ts         # WebSocket
│   ├── services/             # Business logic
│   │   ├── jobs.ts           # Job queue worker
│   │   ├── claude.ts         # Claude CLI subprocess
│   │   ├── sessions.ts       # Session manager
│   │   ├── calendar/
│   │   │   ├── sync.ts       # Calendar sync orchestration
│   │   │   ├── google.ts     # Google Calendar API
│   │   │   └── oauth.ts      # OAuth PKCE flow
│   │   ├── jira.ts
│   │   ├── confluence.ts
│   │   └── scheduler.ts
│   ├── db/
│   │   ├── connection.ts     # SQLite connection
│   │   ├── schema.ts         # Table definitions
│   │   ├── jobs.ts           # Jobs repository
│   │   ├── calendar.ts       # Calendar repository
│   │   └── atlassian.ts      # Atlassian repository
│   ├── schemas/              # TypeBox schemas
│   │   ├── jobs.ts
│   │   ├── claude.ts
│   │   ├── calendar.ts
│   │   └── activity.ts
│   ├── middleware/
│   │   └── auth.ts           # Token verification
│   ├── websocket/
│   │   └── manager.ts        # WebSocket broadcast
│   └── lib/
│       ├── config.ts         # Environment config
│       └── time.ts           # Time utilities
├── package.json
├── tsconfig.json
├── bunfig.toml               # Bun configuration
└── build.ts                  # Cross-compile script
```

## Core Implementation Examples

### Entry Point (src/index.ts)
```typescript
import { createApp } from "./app";
import { initDatabase } from "./db/connection";
import { startWorkers } from "./services/jobs";
import { startScheduler } from "./services/scheduler";

const port = parseInt(Bun.env.BACKEND_PORT ?? "49671");
const app = createApp();

// Initialize
await initDatabase();
await startWorkers();
await startScheduler();

console.log(`Backend running on port ${port}`);
export default {
  port,
  fetch: app.fetch,
  websocket: app.websocket,
};
```

### App Factory (src/app.ts)
```typescript
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";
import { healthRoutes } from "./routes/health";
import { jobsRoutes } from "./routes/jobs";
import { calendarRoutes } from "./routes/calendar";
import { eventsRoutes } from "./routes/events";
import { authMiddleware } from "./middleware/auth";

export function createApp() {
  return new Elysia()
    .use(cors({
      origin: [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "app://.",
      ],
      credentials: true,
    }))
    .use(authMiddleware)
    .use(healthRoutes)
    .use(jobsRoutes)
    .use(calendarRoutes)
    .use(eventsRoutes)
    .onError(({ error }) => {
      console.error("Unhandled error:", error);
      return {
        detail: error.message,
        type: error.name,
      };
    });
}
```

### Route Example (src/routes/jobs.ts)
```typescript
import { Elysia, t } from "elysia";
import { JobsRepository } from "../db/jobs";
import { JobsService } from "../services/jobs";

const jobSchema = t.Object({
  type: t.String(),
  payload: t.Optional(t.Record(t.String(), t.Unknown())),
});

export const jobsRoutes = new Elysia({ prefix: "/jobs" })
  .post("/", async ({ body }) => {
    const job = await JobsService.create(body);
    return job;
  }, { body: jobSchema })

  .get("/", async () => {
    return await JobsRepository.list(200);
  })

  .get("/:jobId", async ({ params }) => {
    return await JobsRepository.get(params.jobId);
  })

  .post("/:jobId/cancel", async ({ params }) => {
    return await JobsService.cancel(params.jobId);
  });
```

### Database (src/db/connection.ts)
```typescript
import { Database } from "bun:sqlite";
import { schema } from "./schema";

let db: Database | null = null;

export function getDb(): Database {
  if (!db) {
    throw new Error("Database not initialized");
  }
  return db;
}

export async function initDatabase(): Promise<void> {
  const dataDir = Bun.env.APP_DATA_DIR ?? "./data";
  await Bun.write(`${dataDir}/.gitkeep`, "");

  db = new Database(`${dataDir}/index.db`);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  // Create tables
  for (const sql of schema) {
    db.exec(sql);
  }
}

export function closeDatabase(): void {
  db?.close();
  db = null;
}
```

### WebSocket (src/routes/events.ts)
```typescript
import { Elysia } from "elysia";
import { wsManager } from "../websocket/manager";

export const eventsRoutes = new Elysia()
  .ws("/events", {
    open(ws) {
      const token = ws.data.query.token;
      if (!verifyToken(token)) {
        ws.close(4001, "Unauthorized");
        return;
      }
      wsManager.add(ws);
    },
    message(ws, message) {
      // Handle incoming messages if needed
    },
    close(ws) {
      wsManager.remove(ws);
    },
  });
```

### WebSocket Manager (src/websocket/manager.ts)
```typescript
type WebSocketClient = {
  send(data: string): void;
  close(): void;
};

class WebSocketManager {
  private clients = new Set<WebSocketClient>();

  add(ws: WebSocketClient) {
    this.clients.add(ws);
  }

  remove(ws: WebSocketClient) {
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

  async emitLog(level: string, message: string) {
    this.broadcast("log", { level, message });
  }
}

export const wsManager = new WebSocketManager();
```

### OAuth PKCE (src/services/calendar/oauth.ts)
```typescript
import { randomBytes, createHash } from "crypto";

interface OAuthState {
  codeVerifier: string;
  createdAt: number;
}

const states = new Map<string, OAuthState>();

export function generatePKCE() {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return { codeVerifier, codeChallenge };
}

export async function startGoogleOAuth(): Promise<{ url: string; state: string }> {
  const { codeVerifier, codeChallenge } = generatePKCE();
  const state = randomBytes(16).toString("hex");

  states.set(state, { codeVerifier, createdAt: Date.now() });

  const params = new URLSearchParams({
    client_id: Bun.env.GOOGLE_CLIENT_ID!,
    redirect_uri: `http://127.0.0.1:${Bun.env.OAUTH_PORT}/callback`,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/calendar.readonly",
    access_type: "offline",
    state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return {
    url: `https://accounts.google.com/o/oauth2/v2/auth?${params}`,
    state,
  };
}
```

### Claude CLI Subprocess (src/services/claude.ts)
```typescript
import { spawn } from "bun";
import { wsManager } from "../websocket/manager";

interface ClaudeSpawnOptions {
  args?: string[];
  prompt?: string;
  stdin?: string;
  timeout?: number;
}

export async function spawnClaude(options: ClaudeSpawnOptions): Promise<string> {
  const claudePath = Bun.env.CLAUDE_CODE_CLI_PATH ?? "claude";
  const args = options.args ?? [];

  if (options.prompt) {
    args.push("--print", options.prompt);
  }

  const proc = spawn([claudePath, ...args], {
    stdin: options.stdin ? "pipe" : "ignore",
    stdout: "pipe",
    stderr: "pipe",
    env: process.env,
  });

  if (options.stdin && proc.stdin) {
    proc.stdin.write(options.stdin);
    proc.stdin.end();
  }

  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;

  if (exitCode !== 0) {
    throw new Error(`Claude CLI failed: ${stderr}`);
  }

  return stdout;
}
```

## Build Configuration

### bunfig.toml
```toml
[build]
target = "bun"
minify = true
sourcemap = "external"

[install]
production = true
```

### build.ts (Cross-compile script)
```typescript
import { $ } from "bun";

const targets = [
  { target: "bun-darwin-arm64", output: "backend-darwin-arm64" },
  { target: "bun-darwin-x64", output: "backend-darwin-x64" },
  { target: "bun-windows-x64", output: "backend-windows.exe" },
  { target: "bun-linux-x64", output: "backend-linux" },
];

for (const { target, output } of targets) {
  console.log(`Building for ${target}...`);
  await $`bun build --compile --target=${target} ./src/index.ts --outfile=dist/${output}`;
}

console.log("Build complete!");
```

### package.json
```json
{
  "name": "enttok-backend",
  "version": "0.1.0",
  "type": "module",
  "scripts": {
    "dev": "bun --watch src/index.ts",
    "start": "bun src/index.ts",
    "build": "bun run build.ts",
    "build:local": "bun build --compile ./src/index.ts --outfile=dist/backend",
    "test": "bun test",
    "typecheck": "tsc --noEmit"
  },
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

## Electron Integration Changes

### Updated backend.ts
```typescript
// electron/main/backend.ts (변경 후)

function getBackendCommand() {
  const baseDir = getBackendBaseDir();

  if (!app.isPackaged) {
    // 개발 모드: bun 직접 실행
    return {
      command: "bun",
      args: ["run", "src/index.ts"],
      cwd: baseDir,
    };
  }

  // 프로덕션: 컴파일된 바이너리
  const platform = process.platform;
  const arch = process.arch;

  let binaryName: string;
  if (platform === "win32") {
    binaryName = "backend-windows.exe";
  } else if (platform === "darwin") {
    binaryName = arch === "arm64" ? "backend-darwin-arm64" : "backend-darwin-x64";
  } else {
    binaryName = "backend-linux";
  }

  return {
    command: path.join(baseDir, binaryName),
    args: [],
    cwd: baseDir,
  };
}
```

## Performance Characteristics

| Metric | Python/FastAPI | Bun/Elysia |
|--------|---------------|------------|
| HTTP Requests/sec | ~15,000 | ~60,000 |
| WebSocket Connections | ~10,000 | ~70,000 |
| SQLite Query (simple) | ~50μs | ~15μs |
| Cold Start | ~500ms | ~50ms |
| Memory Usage | ~80MB | ~30MB |

## Key Differences from Python

| Aspect | Python | Bun/TypeScript |
|--------|--------|----------------|
| Async Model | asyncio (cooperative) | Event loop + Workers |
| SQLite | aiosqlite (async wrapper) | bun:sqlite (sync, fast) |
| Type Validation | Pydantic (runtime) | TypeBox (compile-time + runtime) |
| HTTP Client | httpx | fetch (built-in) |
| Package Manager | uv/pip | bun (built-in) |
| Deployment | Python runtime required | Single binary |
