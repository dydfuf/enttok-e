# Migration Checklist

## Pre-Migration

### 환경 준비
- [ ] Bun 최신 버전 설치 (`curl -fsSL https://bun.sh/install | bash`)
- [ ] Node.js 환경과 공존 확인
- [ ] 개발 환경에서 Bun 정상 동작 확인

### 현재 시스템 분석
- [ ] 모든 API 엔드포인트 문서화 완료
- [ ] 데이터베이스 스키마 덤프
- [ ] 환경변수 목록 정리
- [ ] 외부 API 인증 정보 확인 (Google, Jira, Confluence)

### 테스트 기준 수립
- [ ] 현재 백엔드 API 응답 스냅샷 저장
- [ ] 성능 베이스라인 측정
- [ ] E2E 테스트 시나리오 정의

---

## Phase 1: Foundation

### 1.1 Project Setup
- [ ] `backend-bun/` 디렉토리 생성
- [ ] `bun init` 실행
- [ ] `package.json` 설정
  - [ ] name, version, type: "module"
  - [ ] scripts 정의 (dev, start, build, test)
- [ ] `tsconfig.json` 설정
  - [ ] strict 모드 활성화
  - [ ] paths 별칭 설정
- [ ] `bunfig.toml` 설정
- [ ] `.gitignore` 추가
- [ ] 디렉토리 구조 생성
  ```
  src/
  ├── routes/
  ├── services/
  ├── db/
  ├── schemas/
  ├── middleware/
  ├── websocket/
  └── lib/
  ```

### 1.2 Basic Server
- [ ] Elysia 설치 (`bun add elysia @elysiajs/cors`)
- [ ] `src/index.ts` 엔트리포인트 생성
- [ ] `src/app.ts` 앱 팩토리 생성
- [ ] CORS 미들웨어 설정
- [ ] Global error handler 설정
- [ ] `bun run dev`로 서버 시작 확인

### 1.3 Database Layer
- [ ] `src/db/connection.ts` 생성
- [ ] SQLite 연결 설정 (bun:sqlite)
- [ ] WAL 모드 활성화
- [ ] `src/db/schema.ts` 테이블 정의
- [ ] 테이블 생성 스크립트
  - [ ] jobs
  - [ ] job_events
  - [ ] sync_state
  - [ ] calendar_accounts
  - [ ] calendar_calendars
  - [ ] calendar_events
  - [ ] atlassian_accounts
  - [ ] activity_events
- [ ] 인덱스 생성

### 1.4 Auth Middleware
- [ ] `src/middleware/auth.ts` 생성
- [ ] X-Backend-Token 헤더 검증
- [ ] requireAuth 매크로/데코레이터
- [ ] 인증 실패 시 401 응답

### 1.5 Config & Utils
- [ ] `src/lib/config.ts` 환경변수 로딩
- [ ] `src/lib/time.ts` 시간 유틸리티
- [ ] 필수 환경변수 검증

---

## Phase 2: Core Features

### 2.1 Jobs System

#### Schemas
- [ ] `src/schemas/jobs.ts` 생성
- [ ] JobCreate 스키마
- [ ] JobResponse 스키마
- [ ] JobStatus enum

#### Repository
- [ ] `src/db/jobs.ts` 생성
- [ ] createJob()
- [ ] getJob()
- [ ] listJobs()
- [ ] updateJobStatus()
- [ ] updateJobProgress()
- [ ] createJobEvent()

#### Service
- [ ] `src/services/jobs.ts` 생성
- [ ] Job Queue 구현
- [ ] Worker Pool 구현
- [ ] Job 타입별 핸들러 등록
- [ ] 진행률 업데이트
- [ ] 에러 핸들링

#### Routes
- [ ] `src/routes/jobs.ts` 생성
- [ ] POST /jobs - 작업 생성
- [ ] GET /jobs - 목록 조회
- [ ] GET /jobs/:jobId - 상세 조회
- [ ] POST /jobs/:jobId/cancel - 취소

#### 테스트
- [ ] Job 생성 테스트
- [ ] Job 상태 전이 테스트
- [ ] Worker 동작 테스트

### 2.2 WebSocket Events

#### Manager
- [ ] `src/websocket/manager.ts` 생성
- [ ] 클라이언트 연결 관리
- [ ] broadcast() 메서드
- [ ] emitLog() 메서드
- [ ] emitJobStatus() 메서드

#### Routes
- [ ] `src/routes/events.ts` 생성
- [ ] WebSocket 엔드포인트 (/events)
- [ ] 연결 시 인증 검증
- [ ] 연결 종료 시 정리

#### 테스트
- [ ] WebSocket 연결 테스트
- [ ] 브로드캐스트 테스트
- [ ] 인증 실패 테스트

### 2.3 Status & Health

#### Routes
- [ ] `src/routes/health.ts` 생성
- [ ] GET /health 엔드포인트
- [ ] `src/routes/status.ts` 생성
- [ ] GET /status 엔드포인트
  - [ ] uptime
  - [ ] queue depth
  - [ ] worker stats

---

## Phase 3: External Integrations

### 3.1 Claude CLI

#### Service
- [ ] `src/services/claude.ts` 생성
- [ ] spawnClaude() - Bun.spawn 사용
- [ ] stdin/stdout 처리
- [ ] 타임아웃 처리

#### Sessions
- [ ] `src/services/sessions.ts` 생성
- [ ] SessionManager 클래스
- [ ] 메시지 히스토리 관리
- [ ] 세션 제한 (max messages, max chars)

#### Routes
- [ ] `src/routes/claude.ts` 생성
- [ ] POST /claude/spawn
- [ ] POST /claude/session

#### 테스트
- [ ] Claude CLI 실행 테스트
- [ ] 세션 관리 테스트

### 3.2 Google Calendar

#### OAuth
- [ ] `src/services/calendar/oauth.ts` 생성
- [ ] PKCE 생성 (code_verifier, code_challenge)
- [ ] OAuth URL 생성
- [ ] Token 교환
- [ ] Token 갱신

#### Calendar API
- [ ] googleapis 설치 (`bun add googleapis`)
- [ ] `src/services/calendar/google.ts` 생성
- [ ] getCalendarService()
- [ ] listCalendars()
- [ ] listEvents()
- [ ] Token 자동 갱신

#### Sync
- [ ] `src/services/calendar/sync.ts` 생성
- [ ] 전체 동기화 로직
- [ ] 증분 동기화 (sync token)
- [ ] 이벤트 정규화

#### Repository
- [ ] `src/db/calendar.ts` 생성
- [ ] Account CRUD
- [ ] Calendar CRUD
- [ ] Event CRUD
- [ ] Sync state 관리

#### Routes
- [ ] `src/routes/calendar.ts` 생성
- [ ] GET /calendar/providers
- [ ] POST /calendar/accounts
- [ ] GET /calendar/accounts
- [ ] GET /calendar/accounts/:id
- [ ] DELETE /calendar/accounts/:id
- [ ] GET /calendar/calendars
- [ ] PATCH /calendar/calendars/:accountId/:calendarId
- [ ] GET /calendar/events
- [ ] POST /calendar/accounts/:id/sync
- [ ] POST /calendar/oauth/google/start
- [ ] GET /calendar/oauth/google/callback
- [ ] POST /calendar/oauth/google/complete

#### 테스트
- [ ] OAuth 플로우 테스트
- [ ] 캘린더 목록 조회 테스트
- [ ] 이벤트 동기화 테스트

### 3.3 Jira

#### Client
- [x] `src/services/atlassian/client.ts` 생성 (fetch 기반 구현, jira.js 불필요)
- [x] `src/services/atlassian/jira.ts` 생성
- [x] atlassianFetch() - HTTP 클라이언트
- [x] searchIssues() - JQL 검색
- [x] 활동 이벤트 추출 (created, status.changed, commented, updated)

#### Repository
- [x] `src/db/atlassian.ts` 생성 (또는 확장)
- [x] Jira account CRUD
- [x] Sync state 관리

#### Routes
- [x] `src/routes/jira.ts` 생성
- [x] GET /jira/accounts
- [x] POST /jira/accounts
- [x] DELETE /jira/accounts/:id
- [x] POST /jira/accounts/:id/sync

#### 테스트
- [ ] Jira 연결 테스트
- [ ] 이슈 검색 테스트
- [ ] 동기화 테스트

### 3.4 Confluence

#### Client
- [x] `src/services/atlassian/confluence.ts` 생성 (fetch 기반 구현, confluence.js 불필요)
- [x] atlassianFetch() - HTTP 클라이언트 (client.ts 공유)
- [x] searchContent() - CQL 검색
- [x] 페이지/블로그/코멘트 활동 조회

#### Routes
- [x] `src/routes/confluence.ts` 생성
- [x] GET /confluence/accounts
- [x] POST /confluence/accounts
- [x] DELETE /confluence/accounts/:id
- [x] POST /confluence/accounts/:id/sync

#### 테스트
- [ ] Confluence 연결 테스트
- [ ] 동기화 테스트

### 3.5 Activity Stream

#### Repository
- [x] Activity events 쿼리 함수
- [x] 시간 범위 필터링
- [x] 소스별 필터링
- [x] upsertActivityEvents() 배치 저장

#### Routes
- [x] `src/routes/activity.ts` 생성
- [x] GET /activity/events

### 3.6 Scheduler

#### Service
- [x] `src/services/scheduler.ts` 생성
- [x] 백그라운드 스케줄러
- [x] 자동 동기화 작업 큐잉
- [x] 중복 작업 방지

---

## Phase 4: Integration & Deployment

### 4.1 Electron Integration

#### Backend Launcher 수정
- [ ] `electron/main/backend.ts` 수정
- [ ] Bun 백엔드 커맨드 추가
- [ ] 플랫폼별 바이너리 경로
- [ ] 환경변수 전달

#### 개발 모드
- [ ] `bun run dev` 실행 확인
- [ ] 핫 리로드 동작 확인
- [ ] Electron과 통신 확인

### 4.2 Cross-Compile

#### Build Script
- [ ] `build.ts` 생성
- [ ] macOS ARM 빌드
- [ ] macOS Intel 빌드
- [ ] Windows 빌드
- [ ] Linux 빌드

#### 바이너리 테스트
- [ ] macOS ARM 바이너리 실행 테스트
- [ ] macOS Intel 바이너리 실행 테스트
- [ ] Windows 바이너리 실행 테스트 (VM 또는 실 환경)
- [ ] Linux 바이너리 실행 테스트 (Docker)

### 4.3 CI/CD

#### GitHub Actions
- [ ] `.github/workflows/build-backend.yml` 생성
- [ ] Bun 설치 step
- [ ] 의존성 설치 step
- [ ] 빌드 step
- [ ] 아티팩트 업로드

#### 릴리스 자동화
- [ ] 태그 기반 릴리스 트리거
- [ ] 바이너리 첨부

### 4.4 Testing

#### Unit Tests
- [ ] 각 서비스 단위 테스트
- [ ] Repository 테스트
- [ ] 유틸리티 테스트

#### Integration Tests
- [ ] API 엔드포인트 테스트
- [ ] WebSocket 테스트
- [ ] 데이터베이스 테스트

#### E2E Tests
- [ ] Electron 앱 전체 플로우
- [ ] 캘린더 동기화 플로우
- [ ] Jira/Confluence 동기화 플로우

#### Performance Tests
- [ ] 응답 시간 측정
- [ ] 동시 연결 테스트
- [ ] 메모리 사용량 측정

---

## Phase 5: Cleanup & Finalization

### 5.1 Python Backend 제거

**전제조건: 모든 기능이 완전히 검증됨**

- [ ] `backend/` 디렉토리 백업
- [ ] `backend/` 디렉토리 삭제
- [ ] Python 관련 설정 제거
- [ ] uv 관련 스크립트 제거

### 5.2 Documentation

- [ ] `/CLAUDE.md` 업데이트
- [ ] `/backend-bun/CLAUDE.md` 생성
- [ ] `/electron-app/CLAUDE.md` 업데이트
- [ ] API 문서 업데이트
- [ ] README.md 업데이트
- [ ] 개발 환경 설정 가이드 업데이트

### 5.3 Final Validation

- [ ] 전체 기능 수동 테스트
- [ ] 각 플랫폼 빌드 테스트
- [ ] 성능 비교 리포트 작성
- [ ] 팀 리뷰 및 승인

---

## Post-Migration

### 모니터링
- [ ] 에러 로깅 설정
- [ ] 성능 메트릭 수집

### 최적화
- [ ] 바이너리 크기 최적화
- [ ] 시작 시간 최적화
- [ ] 메모리 사용량 최적화

### 문서화
- [ ] 마이그레이션 회고록 작성
- [ ] 교훈 및 개선점 정리

---

## Quick Reference: API Parity Check

| Endpoint | Python | Bun | Tested |
|----------|--------|-----|--------|
| GET /health | ✅ | ✅ | ✅ |
| GET /status | ✅ | ✅ | ✅ |
| POST /jobs | ✅ | ✅ | ✅ |
| GET /jobs | ✅ | ✅ | ✅ |
| GET /jobs/:id | ✅ | ✅ | [ ] |
| POST /jobs/:id/cancel | ✅ | ✅ | [ ] |
| POST /claude/spawn | ✅ | ✅ | [ ] |
| POST /claude/session | ✅ | ✅ | [ ] |
| GET /calendar/providers | ✅ | ✅ | ✅ |
| POST /calendar/accounts | ✅ | ✅ | [ ] |
| GET /calendar/accounts | ✅ | ✅ | [ ] |
| GET /calendar/accounts/:id | ✅ | ✅ | [ ] |
| DELETE /calendar/accounts/:id | ✅ | ✅ | [ ] |
| GET /calendar/calendars | ✅ | ✅ | [ ] |
| PATCH /calendar/calendars/:aid/:cid | ✅ | ✅ | [ ] |
| GET /calendar/events | ✅ | ✅ | [ ] |
| POST /calendar/accounts/:id/sync | ✅ | ✅ | [ ] |
| POST /calendar/oauth/google/start | ✅ | ✅ | [ ] |
| GET /calendar/oauth/google/callback | ✅ | ✅ | [ ] |
| POST /calendar/oauth/google/complete | ✅ | ✅ | [ ] |
| GET /jira/accounts | ✅ | ✅ | ✅ |
| POST /jira/accounts | ✅ | ✅ | [ ] |
| DELETE /jira/accounts/:id | ✅ | ✅ | [ ] |
| POST /jira/accounts/:id/sync | ✅ | ✅ | [ ] |
| GET /confluence/accounts | ✅ | ✅ | ✅ |
| POST /confluence/accounts | ✅ | ✅ | [ ] |
| DELETE /confluence/accounts/:id | ✅ | ✅ | [ ] |
| POST /confluence/accounts/:id/sync | ✅ | ✅ | [ ] |
| GET /activity/events | ✅ | ✅ | [ ] |
| WS /events | ✅ | ✅ | [ ] |
