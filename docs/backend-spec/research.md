# Electron 연동 Python 백엔드 리서치 (KIRA_REFERENCE 기반)

- 작성일: 2025-12-23
- 근거 문서: `docs/report.md`, `docs/my-spec/research.md`, `docs/my-spec/local-rag.md`
- 대상: Electron 앱과 함께 동작하는 로컬 Python 백엔드(=sidecar)

---

## 1) 결론 요약

- **KIRA_REFERENCE와 동일한 “Electron이 Python 런타임을 스폰/관리”하는 Sidecar 패턴이 최적**입니다.
- **통신은 localhost HTTP + WebSocket**이 가장 단순하고 안정적이며, UI 진행률/스트리밍에 유리합니다.
- 백엔드는 **FastAPI + 작업 큐 + 스케줄러(APScheduler) + 로컬 저장소(SQLite/파일)** 조합이 현실적인 기본값입니다.
- 보안은 **127.0.0.1 바인딩 + 런타임 토큰**으로 최소한의 인증을 붙이고, **키체인/키링 저장**을 기본 원칙으로 둡니다.
- 패키징은 **electron-builder의 extraResources + asarUnpack**으로 Python 런타임/리소스를 포함시키는 방향이 KIRA_REFERENCE와 일치합니다.

---

## 2) KIRA_REFERENCE에서 얻은 핵심 패턴

`docs/report.md` 기준으로 확인된 운영 패턴은 다음과 같습니다.

1. **Electron main이 Python 서버를 직접 스폰/종료**
2. **Python 서버는 큐/워커 + 스케줄러를 보유**해 백그라운드 작업을 안정적으로 처리
3. **로그/상태를 UI에 노출**할 수 있도록 프로세스 출력을 스트리밍
4. **에이전트/툴 호출(필요 시 MCP)** 구조를 통해 확장 가능한 작업 파이프라인 구성

이 패턴을 현재 프로젝트에 맞게 단순화하면, “**로컬 Python 백엔드 + Job Queue + Scheduler + API**” 구조가 됩니다.

---

## 3) 권장 런타임 아키텍처

```text
┌─────────────────────────────────────────────────────────────┐
│ Electron Desktop App                                        │
│  - main: python 실행/종료, 포트/토큰 관리, 로그 수집        │
│  - preload: renderer에 안전한 IPC API 노출                 │
│  - renderer(UI): 상태/로그/작업 진행률 표시                │
└───────────────────┬─────────────────────────────────────────┘
                    │ IPC (start/stop/status/logs)
                    ▼
┌─────────────────────────────────────────────────────────────┐
│ Local Python Backend (FastAPI)                              │
│  - /health, /status, /jobs, /logs, /settings                │
│  - queue/workers, scheduler(APScheduler)                    │
│  - store/index: SQLite + 파일 저장                          │
└───────────────────┬─────────────────────────────────────────┘
                    │
                    ▼
        Local Files / External APIs / (Optional) MCP Tools
```

---

## 4) Electron ↔ Python 연동 설계

### 4.1 Electron main의 책임(권장)

- **Python 런타임 탐색**
  - 개발 환경: `uv run python -m app.main` 형태가 가장 단순
  - 배포 환경: `extraResources`에 포함한 Python 실행 파일/venv 사용
- **런타임 환경변수 주입**
  - `BACKEND_PORT`, `BACKEND_TOKEN`, `APP_DATA_DIR`, `LOG_DIR` 등
- **프로세스 라이프사이클 관리**
  - start → health 체크(/health) → ready 상태 브로드캐스트
  - stop → SIGTERM → 타임아웃 시 SIGKILL
- **로그 스트리밍**
  - stdout/stderr를 IPC로 렌더러에 전달
  - 파일 로깅도 병행(디버깅/리포트용)

### 4.2 통신 방식(권장)

- **HTTP(REST) + WebSocket**
  - REST: 상태 조회, 설정 저장, 작업 등록
  - WebSocket: 진행률/스트리밍 응답
- **로컬 보안**
  - 서버는 `127.0.0.1`에만 바인딩
  - Electron이 생성한 **일회성 토큰**을 헤더로 전달

---

## 5) Python 백엔드 구성요소(권장)

### 5.1 API 서버 (FastAPI)

- 최소 엔드포인트
  - `GET /health`: 프로세스 생존 확인
  - `GET /status`: 큐 길이, 워커 상태, 스케줄러 상태
  - `POST /jobs`: 작업 등록(동기화/인덱싱/요약 등)
  - `GET /jobs/{id}`: 작업 상태 조회
  - `WS /events`: 작업 진행률, 로그 스트리밍

### 5.2 작업 큐 + 워커

KIRA_REFERENCE의 “채널 큐 + 오케스트레이터 큐 + 메모리 큐” 패턴을 참고해,
우리 쪽은 최소화된 형태로 시작하는 것이 안전합니다.

- **Job Queue**: `asyncio.Queue` 기반
- **Worker Pool**: I/O 작업과 CPU 작업을 분리(필요 시 별도 프로세스)
- **재시도/백프레셔**: 큐 최대 길이 제한 + 실패 정책

### 5.3 스케줄러 (APScheduler)

- 동기화/인덱싱 같은 **주기 작업**은 APScheduler로 운영
- 스케줄 정의는 SQLite나 JSON 파일로 저장(리로드 가능 구조)

### 5.4 저장소

`docs/my-spec/research.md`의 “파일 + SQLite” 투트랙을 기본값으로 둡니다.

- **파일**: 원본 문서/노트
- **SQLite**: 메타데이터/캐시/인덱스(FTS/벡터)
- (선택) **local RAG**: `docs/my-spec/local-rag.md`의 FTS+벡터 하이브리드 구조

---

## 6) 보안 및 설정 원칙

`docs/report.md`가 지적한 “평문 config.env 저장 리스크”를 고려하여:

- **토큰/시크릿은 OS Keychain/Keyring**을 기본값으로 저장
- 파일에 저장해야 한다면 **암호화**(앱 전용 키) 후 보관
- 서버 접근은 **로컬 바인딩 + 토큰 헤더**로 최소 보호

---

## 7) 패키징/배포 전략

KIRA_REFERENCE와 동일한 방향을 권장합니다.

- `electron-builder`에서 **Python 실행 파일/의존성**을 `extraResources`로 포함
- 바이너리/라이브러리 파일은 `asarUnpack` 지정
- 런타임에서 Python 경로를 탐색하고 스폰

옵션 비교:

- **Option A: uv 기반 런타임**
  - 개발/디버깅이 가장 단순
  - 배포에서 uv 의존성 관리 필요
- **Option B: PyInstaller/zipapp**
  - 런타임 의존성 감소
  - 빌드/플랫폼별 유지 비용 증가

---

## 8) 구현 단계 제안(실행 순서)

1. **/health + spawn/stop + 로그 스트리밍**만 먼저 구현
2. **Job Queue + Worker** 최소 구성
3. **Scheduler + Job 상태 관리**
4. **SQLite 저장소 + 기본 인덱스**
5. **RAG/AI 파이프라인(필요 시)**

---

## 9) 리스크/주의사항

- **Python 패키징 난이도**: macOS/Windows 배포시 바이너리 경로와 권한 이슈
- **Node/npx 의존성**: MCP 서버를 도입하면 런타임에 Node가 필요
- **로그/오류 복구**: 백엔드가 죽었을 때 자동 재시작과 사용자 안내 필요

---

## 10) 다음 단계(스펙 상세화)

- 실제 기능 요구사항을 기준으로 **Job 타입/데이터 스키마** 정의
- **API 스펙**을 확정하고 UI와 계약(Contract) 수립
- 패키징 전략(uv vs PyInstaller)을 팀 합의로 결정
