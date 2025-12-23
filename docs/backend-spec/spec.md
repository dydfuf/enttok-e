# Electron 연동 Python 백엔드 스펙 (Sidecar)

- 작성일: 2025-12-23
- 근거 문서: `docs/backend-spec/research.md`, `docs/my-spec/spec.md`, `docs/report.md`
- 패키징 전략: **uv 사용 + Electron 빌드에 함께 포함**

---

## 1) 목표/스코프

- Electron 앱과 함께 실행되는 **로컬 Python 백엔드**를 정의한다.
- Electron ↔ Python 간 **API 계약(REST/WS)** 을 확정한다.
- **Job 타입/상태/데이터 스키마**를 명시한다.
- **uv 기반 런타임을 Electron 빌드에 포함**시키는 패키징 전략을 고정한다.

---

## 2) 디렉터리/런타임 구조

### 2.1 저장소 구조(권장)

```text
enttok-e/
├── electron-app/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   ├── jobs/
│   │   ├── store/
│   │   └── utils/
│   ├── pyproject.toml
│   ├── uv.lock
│   └── .venv/                # 빌드 시 uv로 생성
└── docs/
```

### 2.2 앱 데이터 경로(런타임)

```text
<userData>/enttok-e/
├── backend/
│   ├── data/
│   │   └── index.db
│   ├── logs/
│   └── cache/
```

Electron main에서 `app.getPath("userData")`로 경로를 계산하고
Python에 `APP_DATA_DIR`로 전달한다.

---

## 3) Job 타입 정의

MVP는 “동기화/인덱싱/제안”을 최소 단위로 분리한다.

| Job Type               | 목적                               | payload 주요 필드                          |
| ---------------------- | ---------------------------------- | ------------------------------------------ |
| `vault.scan`           | 노트 파일 스캔/메타 갱신            | `vault_path`, `since`, `force_full`        |
| `index.rebuild`        | FTS/벡터 인덱스 전체 재생성          | `vault_path`, `embedding_model`            |
| `index.update`         | 변경분만 인덱싱(증분)               | `changed_paths`, `deleted_paths`           |
| `connector.github.sync`| GitHub 증분 동기화                  | `workspace_id`, `cursor`, `since`          |
| `suggest.generate`     | 일지 제안 생성                      | `note_date`, `note_path`, `context_limit`  |
| `maintenance.compact`  | DB 정리/정합성 검사                 | `vacuum`, `analyze`                        |

Job 타입은 추후 커넥터가 늘면 `connector.{source}.sync` 형태로 확장한다.

---

## 4) Job 상태/데이터 스키마

### 4.1 공통 상태 머신

```text
queued -> running -> succeeded
                   -> failed
                   -> canceled
```

### 4.2 Job 레코드(JSON)

```json
{
  "job_id": "job_20251223_001",
  "type": "index.update",
  "status": "running",
  "created_at": "2025-12-23T13:00:00Z",
  "updated_at": "2025-12-23T13:00:10Z",
  "progress": 0.35,
  "message": "indexing 42/120 chunks",
  "payload": {
    "changed_paths": ["/vault/daily/2025-12-23.md"],
    "deleted_paths": []
  },
  "result": null,
  "error": null
}
```

### 4.3 SQLite 스키마(권장)

```sql
create table if not exists jobs (
  job_id text primary key,
  type text not null,
  status text not null,
  created_at text not null,
  updated_at text not null,
  progress real,
  message text,
  payload_json text,
  result_json text,
  error_json text
);

create table if not exists job_events (
  event_id integer primary key,
  job_id text not null references jobs(job_id),
  created_at text not null,
  level text not null,         -- info | warn | error
  message text not null,
  meta_json text
);

create table if not exists sync_state (
  connector text primary key,
  cursor text,
  last_sync_at text
);
```

---

## 5) API 계약 (Electron ↔ Python)

### 5.1 공통 규칙

- Base URL: `http://127.0.0.1:{BACKEND_PORT}`
- 인증: `X-Backend-Token: <token>` 헤더 필수
- 응답 포맷: `application/json`

### 5.2 REST Endpoints

| Method | Path                | 설명                               |
| ------ | ------------------- | ---------------------------------- |
| GET    | `/health`           | 프로세스 생존 확인                 |
| GET    | `/status`           | 큐/워커/스케줄러 상태              |
| POST   | `/jobs`             | Job 등록                            |
| GET    | `/jobs`             | Job 목록 조회                      |
| GET    | `/jobs/{job_id}`    | Job 상세                           |
| POST   | `/jobs/{job_id}/cancel` | Job 취소                        |
| GET    | `/settings`         | 백엔드 설정 조회                   |
| POST   | `/settings`         | 백엔드 설정 저장                   |

### 5.3 요청/응답 예시

**POST /jobs**

```json
{
  "type": "connector.github.sync",
  "payload": {
    "workspace_id": "default",
    "since": "2025-12-20T00:00:00Z"
  }
}
```

응답:

```json
{
  "job_id": "job_20251223_004",
  "status": "queued"
}
```

**GET /status**

```json
{
  "uptime_sec": 3600,
  "queue_depth": 2,
  "workers": { "active": 1, "idle": 3 },
  "scheduler": { "running": true, "jobs": 4 }
}
```

### 5.4 WebSocket (/events)

WebSocket은 진행률과 로그를 실시간 전달한다.

예시 메시지:

```json
{ "type": "job.progress", "job_id": "job_20251223_004", "progress": 0.5 }
```

```json
{ "type": "job.status", "job_id": "job_20251223_004", "status": "succeeded" }
```

```json
{ "type": "log", "level": "info", "message": "github sync done" }
```

---

## 6) uv 기반 패키징 + Electron 빌드 포함

### 6.1 원칙

- **uv로 의존성을 고정**하고, 빌드 시 `.venv`를 생성한다.
- Electron 빌드 산출물에 **backend 코드 + `.venv`**를 포함한다.
- 런타임에서는 `.venv`의 Python을 직접 실행한다.

### 6.2 빌드 절차(권장)

```text
1) backend/에서 uv sync 실행
2) electron-builder가 backend/ + backend/.venv 를 extraResources로 패키징
3) Electron main이 resourcesPath 기준으로 python 경로 계산 후 스폰
```

### 6.3 electron-builder 설정 가이드(예시)

```json
{
  "files": ["dist-react/**/*", "dist-electron/**/*"],
  "extraResources": [
    { "from": "../backend", "to": "backend" },
    { "from": "../backend/.venv", "to": "backend/.venv" }
  ],
  "asarUnpack": ["**/backend/**"]
}
```

### 6.4 런타임 Python 경로(예시)

```ts
const base = process.resourcesPath;
const pythonPath =
  process.platform === "win32"
    ? path.join(base, "backend", ".venv", "Scripts", "python.exe")
    : path.join(base, "backend", ".venv", "bin", "python");
```

### 6.5 환경변수(권장)

- `BACKEND_PORT` (예: 49671)
- `BACKEND_TOKEN` (Electron이 생성, 런타임 전달)
- `APP_DATA_DIR` (userData 하위)
- `LOG_DIR` (userData 하위)
- `RUN_ENV` (dev/prod)

---

## 7) 체크리스트

- [ ] Electron에서 backend 프로세스 스폰/종료/재시작 로직 구현
- [ ] /health + /status + /jobs 최소 API 구현
- [ ] WebSocket 이벤트 스트리밍 구현
- [ ] uv sync 기반 .venv 생성 빌드 스크립트 확보
- [ ] electron-builder extraResources/asarUnpack 반영

