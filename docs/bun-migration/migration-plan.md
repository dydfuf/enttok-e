# Migration Plan

## Overview

Python/FastAPI 백엔드를 Bun/Elysia로 마이그레이션하는 단계별 계획입니다. 각 단계는 독립적으로 테스트 가능하며, 점진적으로 기능을 이전합니다.

## Phase 1: Foundation

### 1.1 프로젝트 초기화

```bash
# 새 디렉토리 생성
mkdir backend-bun
cd backend-bun

# Bun 프로젝트 초기화
bun init

# 핵심 의존성 설치
bun add elysia @elysiajs/cors

# 개발 의존성
bun add -d @types/bun typescript
```

**산출물:**
- [ ] `package.json` 설정
- [ ] `tsconfig.json` 설정
- [ ] `bunfig.toml` 설정
- [ ] 디렉토리 구조 생성

### 1.2 기본 서버 설정

```typescript
// src/index.ts
import { Elysia } from "elysia";
import { cors } from "@elysiajs/cors";

const app = new Elysia()
  .use(cors())
  .get("/health", () => ({ status: "ok", timestamp: new Date().toISOString() }))
  .listen(parseInt(Bun.env.BACKEND_PORT ?? "49671"));

console.log(`Server running on port ${app.server?.port}`);
```

**산출물:**
- [ ] 기본 Elysia 서버
- [ ] CORS 설정
- [ ] Health 엔드포인트
- [ ] 환경변수 로딩

### 1.3 데이터베이스 레이어

```typescript
// src/db/connection.ts
import { Database } from "bun:sqlite";

let db: Database | null = null;

export function initDatabase(dataDir: string) {
  db = new Database(`${dataDir}/index.db`);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  // Run migrations
  createTables(db);
}
```

**산출물:**
- [ ] SQLite 연결 관리
- [ ] 스키마 마이그레이션
- [ ] 기본 CRUD 헬퍼

### 1.4 인증 미들웨어

```typescript
// src/middleware/auth.ts
import { Elysia } from "elysia";

export const authMiddleware = new Elysia()
  .derive(({ headers }) => {
    const token = headers["x-backend-token"];
    return { token };
  })
  .macro(({ onBeforeHandle }) => ({
    requireAuth(enabled: boolean) {
      if (!enabled) return;
      onBeforeHandle(({ token, error }) => {
        if (token !== Bun.env.BACKEND_TOKEN) {
          return error(401, "Unauthorized");
        }
      });
    },
  }));
```

**산출물:**
- [ ] 토큰 검증 미들웨어
- [ ] 인증 데코레이터/매크로

---

## Phase 2: Core Features

### 2.1 Jobs System

**마이그레이션 순서:**
1. Jobs 스키마 정의 (TypeBox)
2. Jobs Repository 구현
3. Jobs Service (큐, 워커)
4. Jobs API 라우트

**Python 원본:**
- `app/schemas/jobs.py`
- `app/db/jobs_repo.py`
- `app/services/jobs.py`
- `app/api/jobs.py`

**TypeScript 대상:**
- `src/schemas/jobs.ts`
- `src/db/jobs.ts`
- `src/services/jobs.ts`
- `src/routes/jobs.ts`

**산출물:**
- [ ] Job 생성/조회/취소 API
- [ ] Job Queue 구현
- [ ] Worker Pool 구현
- [ ] Job 상태 업데이트

### 2.2 WebSocket Events

**마이그레이션 순서:**
1. WebSocket Manager 구현
2. Elysia WebSocket 라우트
3. 브로드캐스트 기능

**산출물:**
- [ ] WebSocket 연결 관리
- [ ] 이벤트 브로드캐스트
- [ ] 클라이언트 인증

### 2.3 Status & Logging

**산출물:**
- [ ] `/status` 엔드포인트
- [ ] 로깅 시스템
- [ ] 에러 핸들링

---

## Phase 3: External Integrations

### 3.1 Claude CLI Integration

**마이그레이션 순서:**
1. Subprocess spawning (Bun.spawn)
2. Session 관리
3. Claude API 라우트

**산출물:**
- [ ] Claude CLI 실행
- [ ] 세션 히스토리 관리
- [ ] `/claude/spawn` 엔드포인트
- [ ] `/claude/session` 엔드포인트

### 3.2 Google Calendar

**마이그레이션 순서:**
1. OAuth PKCE 구현
2. Token 관리
3. Calendar API 래퍼
4. Calendar 라우트

**의존성:**
```bash
bun add googleapis
```

**산출물:**
- [ ] OAuth 시작/콜백
- [ ] 토큰 저장/갱신
- [ ] 캘린더 목록 조회
- [ ] 이벤트 조회/동기화
- [ ] 계정 관리

### 3.3 Jira Integration

**의존성:**
```bash
bun add jira.js
```

**산출물:**
- [ ] Jira 계정 관리
- [ ] 이슈 검색
- [ ] 활동 이벤트 수집
- [ ] 동기화 작업

### 3.4 Confluence Integration

**의존성:**
```bash
bun add confluence.js
```

**산출물:**
- [ ] Confluence 계정 관리
- [ ] 페이지 활동 수집
- [ ] 동기화 작업

### 3.5 Activity Stream

**산출물:**
- [ ] Activity Repository
- [ ] Activity 조회 API
- [ ] 소스별 필터링

### 3.6 Scheduler

**산출물:**
- [ ] 백그라운드 스케줄러
- [ ] 자동 동기화 작업
- [ ] 중복 방지

---

## Phase 4: Integration & Deployment

### 4.1 Electron 통합

**변경 파일:**
- `electron-app/electron/main/backend.ts`
- `electron-app/electron/paths.ts`

**변경 내용:**
```typescript
// backend.ts 수정
function getBackendCommand() {
  if (!app.isPackaged) {
    return { command: "bun", args: ["run", "src/index.ts"], cwd: baseDir };
  }

  const binaryName = getBinaryName(process.platform, process.arch);
  return { command: path.join(baseDir, binaryName), args: [], cwd: baseDir };
}
```

**산출물:**
- [ ] 개발 모드 통합
- [ ] 프로덕션 바이너리 로딩
- [ ] 환경변수 전달

### 4.2 크로스 컴파일 설정

**build.ts:**
```typescript
const targets = [
  { target: "bun-darwin-arm64", output: "backend-darwin-arm64" },
  { target: "bun-darwin-x64", output: "backend-darwin-x64" },
  { target: "bun-windows-x64", output: "backend-windows.exe" },
  { target: "bun-linux-x64", output: "backend-linux" },
];

for (const { target, output } of targets) {
  await $`bun build --compile --target=${target} ./src/index.ts --outfile=dist/${output}`;
}
```

**산출물:**
- [ ] macOS ARM 바이너리
- [ ] macOS Intel 바이너리
- [ ] Windows 바이너리
- [ ] Linux 바이너리

### 4.3 CI/CD 설정

**.github/workflows/build-backend.yml:**
```yaml
name: Build Backend
on:
  push:
    paths: ['backend-bun/**']

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v1
      - run: cd backend-bun && bun install
      - run: cd backend-bun && bun run build
      - uses: actions/upload-artifact@v4
        with:
          name: backend-binaries
          path: backend-bun/dist/
```

**산출물:**
- [ ] GitHub Actions 워크플로우
- [ ] 빌드 아티팩트 업로드
- [ ] 릴리스 자동화

### 4.4 테스트 & 검증

**테스트 항목:**
- [ ] 모든 API 엔드포인트 동작 확인
- [ ] WebSocket 연결 테스트
- [ ] Google OAuth 플로우 테스트
- [ ] Jira/Confluence 동기화 테스트
- [ ] Claude CLI 실행 테스트
- [ ] Job Queue 동작 테스트
- [ ] 각 플랫폼 바이너리 테스트

**산출물:**
- [ ] 통합 테스트 스위트
- [ ] E2E 테스트
- [ ] 성능 벤치마크

---

## Phase 5: Cleanup & Finalization

### 5.1 Python 백엔드 제거

**주의:** 모든 기능이 검증된 후 진행

- [ ] `backend/` 디렉토리 삭제
- [ ] Python 관련 설정 제거
- [ ] 문서 업데이트

### 5.2 문서화

- [ ] CLAUDE.md 업데이트
- [ ] API 문서 업데이트
- [ ] 개발 가이드 업데이트
- [ ] README 업데이트

### 5.3 최종 검증

- [ ] 전체 앱 E2E 테스트
- [ ] 성능 비교 리포트
- [ ] 배포 테스트

---

## Migration Order Summary

```
┌─────────────────────────────────────────────────────────────┐
│ Phase 1: Foundation                                         │
│ ├── 1.1 Project Setup                                       │
│ ├── 1.2 Basic Server                                        │
│ ├── 1.3 Database Layer                                      │
│ └── 1.4 Auth Middleware                                     │
├─────────────────────────────────────────────────────────────┤
│ Phase 2: Core Features                                      │
│ ├── 2.1 Jobs System                                         │
│ ├── 2.2 WebSocket Events                                    │
│ └── 2.3 Status & Logging                                    │
├─────────────────────────────────────────────────────────────┤
│ Phase 3: External Integrations                              │
│ ├── 3.1 Claude CLI                                          │
│ ├── 3.2 Google Calendar                                     │
│ ├── 3.3 Jira                                                │
│ ├── 3.4 Confluence                                          │
│ ├── 3.5 Activity Stream                                     │
│ └── 3.6 Scheduler                                           │
├─────────────────────────────────────────────────────────────┤
│ Phase 4: Integration & Deployment                           │
│ ├── 4.1 Electron Integration                                │
│ ├── 4.2 Cross-Compile Setup                                 │
│ ├── 4.3 CI/CD Setup                                         │
│ └── 4.4 Testing & Validation                                │
├─────────────────────────────────────────────────────────────┤
│ Phase 5: Cleanup & Finalization                             │
│ ├── 5.1 Remove Python Backend                               │
│ ├── 5.2 Documentation                                       │
│ └── 5.3 Final Validation                                    │
└─────────────────────────────────────────────────────────────┘
```

## Parallel Development Strategy

마이그레이션 기간 동안 두 백엔드를 병렬로 유지할 수 있습니다:

```typescript
// electron/main/backend.ts
function getBackendCommand() {
  const useBun = Bun.env.USE_BUN_BACKEND === "true";

  if (useBun) {
    return getBunBackendCommand();
  }
  return getPythonBackendCommand();
}
```

이를 통해:
1. 기능별로 점진적 테스트 가능
2. 롤백이 쉬움
3. A/B 비교 테스트 가능
