# KIRA_REFERENCE Codebase & Architecture Analysis Report

## KIRA_REFERENCE 백엔드 & Electron 코드베이스/아키텍처 분석 리포트

- **대상 경로**: `KIRA_REFERENCE/`
- **작성 일자**: 2025-12-19

---

## 1) 한 줄 요약

이 프로젝트는 **Electron 데스크톱 앱이 로컬 Python 서버(=Slack Socket Mode 기반 AI 에이전트)를 프로세스로 실행/관리**하고, Python 서버는 **Slack 이벤트 → 큐(채널/오케스트레이터/메모리) → 멀티 에이전트(Claude SDK + MCP) → Slack 응답/로컬 저장소** 구조로 동작합니다.

---

## 2) 범위/구성 요소

### 백엔드(로컬 Python 서버)

- **엔트리포인트**: `KIRA_REFERENCE/app/main.py`
- **핵심 모듈**
  - Slack 이벤트 처리: `KIRA_REFERENCE/app/cc_slack_handlers.py`
  - 큐/워커: `KIRA_REFERENCE/app/queueing_extended.py`
  - 스케줄러: `KIRA_REFERENCE/app/scheduler.py`
  - 에이전트(Operator/Memory/SimpleChat 등): `KIRA_REFERENCE/app/cc_agents/**`
  - MCP 도구 구현(슬랙/스케줄러/파일 등): `KIRA_REFERENCE/app/cc_tools/**`
  - 웹 인터페이스(FastAPI): `KIRA_REFERENCE/app/cc_web_interface/**`
  - 설정/환경변수: `KIRA_REFERENCE/app/config/settings.py`

### Electron 데스크톱 앱

- **메인 프로세스**: `KIRA_REFERENCE/electron-app/main.js`
- **프리로드(IPC 브릿지)**: `KIRA_REFERENCE/electron-app/preload.js`
- **렌더러(UI)**: `KIRA_REFERENCE/electron-app/renderer/index.html`, `renderer/main.js`, `renderer/main.css`
- **빌드/배포**: `KIRA_REFERENCE/electron-app/package.json`, `KIRA_REFERENCE/.github/workflows/deploy.yml`, `KIRA_REFERENCE/deploy.sh`

---

## 3) 런타임 아키텍처(전체 그림)

```text
┌───────────────────────────────────────────────────────────────────────┐
│ Electron App (Desktop)                                                │
│  - renderer: settings/log UI                                          │
│  - preload: window.api (IPC wrapper)                                 │
│  - main: config 저장, uv 설치/탐색, python 서버 spawn, 로그 스트리밍 │
└───────────────┬───────────────────────────────────────────────────────┘
                │ IPC (get-config/save-config/start-server/stop-server)
                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Local Python Server (uv run python -m app.main)                        │
│  - Slack Socket Mode (WebSocket)                                       │
│  - Queueing: channel queues + orchestrator queue + memory queue        │
│  - Agents: simple_chat / operator / memory_manager / ...               │
│  - Optional: FastAPI web interface (HTTPS :8000)                       │
└───────────────┬───────────────────────────────────────────────────────┘
                │
                │ Slack WebSocket (Socket Mode)
                ▼
┌───────────────────────────────────────────────────────────────────────┐
│ Slack Workspace                                                       │
│  - message events → bot processing → reply/threads                     │
└───────────────────────────────────────────────────────────────────────┘

(Operator agent 내부)
Python(claude_agent_sdk) ──spawn──> MCP servers (대부분 npx 기반) ──> 외부 서비스/로컬파일
                       (ex: time/context7/playwright/atlassian/...) 
```

---

## 4) 백엔드 아키텍처 상세

### 4.1 프로세스/라이프사이클

- `app/main.py`에서 수행되는 주요 단계
  - 설정 로드: `get_settings()` (`app/config/settings.py`)
  - 로컬 DB 초기화(SQLite): `waiting_answer_db`, `confirm_db`, `email_tasks_db`, `jira_tasks_db` 등
  - Slack Socket Mode 연결: `AsyncSocketModeHandler(app, settings.SLACK_APP_TOKEN).start_async()`
  - 워커 시작: 채널 워커/오케스트레이터 워커/메모리 워커 (`app/queueing_extended.py`)
  - 스케줄러 시작: `APScheduler` 기반 (`app/scheduler.py`)
  - 옵션: 웹 인터페이스(FastAPI) HTTPS 8000 포트 실행 (`app/cc_web_interface/server.py`)

### 4.2 Slack 수신/처리 파이프라인

- 이벤트 등록: `app/cc_slack_handlers.py: register_handlers()`
  - DM/그룹DM/채널 메시지 이벤트를 분기
  - 파일/링크 메시지는 `debounced_enqueue_message(..., delay_seconds=5.0)`로 디바운스 처리

- 메시지 처리 로직 핵심: `app/cc_slack_handlers.py: _process_message_logic()`
  - (1) 기본 필터
    - 특정 채널 무시(하드코딩된 `IGNORED_CHANNELS`)
    - 봇 메시지/Slackbot 메시지 제외
  - (2) 컨텍스트 구성
    - Slack API 기반 최근 메시지/채널/멤버 정보를 `get_slack_context_data()`로 수집 (`app/cc_utils/slack_helper.py`)
    - `message_data`(user_id, thread_ts, files 등) 구성
  - (3) Proactive Confirm(승인 흐름)
    - `call_proactive_confirm()`가 pending confirm 응답인지 판단
    - 승인되면 원 요청을 `enqueue_orchestrator_job()`로 전달
  - (4) 그룹 채널에서 “봇 호출 여부” 판단
    - `call_bot_call_detector()`로 명시적 호출인지 판별
    - 스레드라면 `call_bot_thread_context_detector()`로 스레드 맥락 기반 호출 여부 보강
    - 호출이 아니면 proactive suggestion 시도(`call_proactive_suggester()`), 아니면 종료
  - (5) Answer Aggregator
    - 대기 중인 질문(다른 사람에게 forward_message로 보낸 질문 등)을 취합하는 흐름(`call_answer_aggregator()`)
  - (6) 권한 체크
    - `is_authorized_user()`로 허용 사용자 여부 판단(허용 리스트 비어있으면 전체 허용)
  - (7) Memory Retriever + Simple Chat
    - `call_memory_retriever()`로 로컬 `memories/`에서 관련 메모리를 취합
    - `call_simple_chat()`이 “간단한 대화면 처리(true) / 복잡하면 대기 응답 후 false” 반환
  - (8) Orchestrator(Operator)로 이관
    - 복잡 작업은 `enqueue_orchestrator_job({query, slack_data, message_data, retrieved_memory})`

> 참고: README의 “debounce 2초” 서술과 달리 실제 `register_handlers()`에서는 기본적으로 5초를 사용합니다.

### 4.3 큐/워커 구조(동시성 설계)

- `app/queueing_extended.py`에서 3단 큐를 운용
  - **채널별 메시지 큐**: `message_queues[channel_id]` (maxsize=100)
  - **오케스트레이터 큐**: `orchestrator_queue` (maxsize=100)
  - **메모리 저장 큐**: `memory_queue` (maxsize=100, 단일 워커)

- 채널 워커
  - 새 채널 큐가 생성되면 모니터가 감지하여 채널당 `workers_per_channel`개 워커를 자동 생성

- 오케스트레이터 워커
  - `num_workers`개가 글로벌 큐를 병렬 처리
  - 워커 활성 수를 기반으로 Slack 상태메시지(`i'm busy`)를 설정/해제

- 메모리 워커
  - 단일 워커로 순차 처리하여 파일/DB 레이스를 줄이는 목적

### 4.4 에이전트(Claude SDK) 구성

- 공통: `claude_agent_sdk`의 `ClaudeSDKClient` + `ClaudeAgentOptions`로 에이전트를 실행

#### Simple Chat (`app/cc_agents/simple_chat/agent.py`)

- 목적: 빠른 응답(간단 대화)과 “복잡 작업은 대기응답 후 오케스트레이터로 넘기는” 1차 분류
- 사용 도구: Slack 응답 + time
- 특징: 결과 텍스트에 “true/false” 포함 여부로 분기

#### Bot Call Detector (`app/cc_agents/bot_call_detector/agent.py`)

- 목적: 그룹 채널에서 봇이 호출되었는지 판단
- 특징: 봇 이름/호칭, 슬랙 멘션 변환 패턴 등을 프롬프트 규칙으로 명시

#### Memory Retriever / Memory Manager

- Memory Retriever (`app/cc_agents/memory_retriever/agent.py`)
  - 로컬 `FILESYSTEM_BASE_DIR/memories/`에서 `index.md` 중심으로 검색/요약
  - “쓰기/편집” 계열은 disallow하여 읽기 중심
- Memory Manager (`app/cc_agents/memory_manager/agent.py`)
  - 로컬 `memories/` 저장/분류(“slack-memory-store” skill 사용)
  - 메모리 저장은 **메모리 큐**로 직렬화되어 처리됨

#### Operator (`app/cc_agents/operator/agent.py`)

- 목적: 복잡 작업 수행(파일 생성/외부 MCP/스케줄/Slack 메시징 등)
- MCP 서버 구성: `build_mcp_servers_dict()`에서 설정 기반으로 활성화
  - 항상 포함: slack, scheduler, files, time(npx), context7(npx), arxiv(npx), airbnb(npx), youtube-info(npx), steam-review(npx)
  - 조건부: perplexity/deepl/github/gitlab/ms365/atlassian/tableau/x/playwright/meeting_transcription/remote mcp 등
- 중요한 포인트
  - **npx 기반 MCP가 기본 포함**이라 Node/npx가 런타임에 사실상 필수
  - “컨텍스트 오버플로우” 시 `/compact` 실행 후 재시도 로직 포함
  - 작업 결과를 메모리 큐로 enqueue하여 후속 대화에 활용

### 4.5 MCP 도구(내장 SDK 서버)

- Slack MCP 도구: `app/cc_tools/slack/slack_tools.py`
  - `answer`, `answer_with_emoji`, `forward_message`, `upload_file`, `download_file_to_channel`, `get_thread_replies`, `get_usergroup_members`, `create_canvas` 등
  - “채널 타입에 따라 스레드/채널 자동 응답”을 도구 레벨에서 처리
- Scheduler MCP 도구: `app/cc_tools/scheduler/scheduler_tools.py`
  - schedules.json에 스케줄 저장/갱신 + APScheduler 리로드
  - 파일 동시 접근 방지 Lock 포함
- Files MCP 도구: `app/cc_tools/files/files_tools.py`
  - base64 이미지 저장/파일 base64 읽기 등 (Tableau 이미지 처리 등 용도)

### 4.6 스케줄링(저장소/실행)

- `app/scheduler.py`
  - 스케줄 정의는 `FILESYSTEM_BASE_DIR/schedule_data/schedules.json`
  - 스케줄 실행 시 `enqueue_message()`로 Slack 메시지 파이프라인에 “가상 메시지”를 주입

### 4.7 Web Interface(FastAPI) - 음성/외부 인증

- 서버 정의: `app/cc_web_interface/server.py`
  - `SessionMiddleware` 기반 세션 사용
  - `/`에서 로그인 여부 확인 후 UI(정적 `static/index.html`) 반환
  - `/auth/*` OAuth 라우트 (`routes/auth.py`)
  - `/api/*` 설정/헬스 체크 (`routes/api.py`)

- 보안 관점 메모
  - `SessionMiddleware`의 `secret_key`가 코드에 하드코딩되어 있으며 TODO로 남아있음

### 4.8 설정/환경변수 로딩

- `app/config/settings.py`
  - `Settings(BaseSettings)` + `.env` 로딩
  - `RUN_ENV`로 `app/config/env/{run_env}.env`를 선택하지만, 런타임에서는 Electron이 넘긴 환경변수가 핵심
  - Vertex AI credential 자동 탐색(`~/.kira/credential.json` 우선)

---

## 5) Electron 아키텍처 상세

### 5.1 역할 분리

- **main process (`electron-app/main.js`)**
  - 설정 파일(`~/.kira/config.env`) 읽기/쓰기
  - `uv` 설치/탐색 및 Python 서버 프로세스 실행/종료
  - Python stdout/stderr를 `~/.kira/server.log`에 저장 + 렌더러로 스트리밍
  - 자동 업데이트(`electron-updater`) + S3 feed
  - macOS 앱 종료 시 서버 정리(stopServer)

- **preload (`electron-app/preload.js`)**
  - `contextBridge`로 renderer에 제한된 API만 노출
  - i18n 번역 리소스(`locales/*.json`)를 로컬 파일에서 로드하여 renderer에 제공

- **renderer (`electron-app/renderer/*`)**
  - 설정 UI/서버 시작/중지/로그 뷰
  - “Press ENTER to continue” 로그 감지 시, IPC로 python stdin에 엔터 입력 전송
  - Terms 모달(첫 실행 동의), 언어 토글(EN/KO)

### 5.2 Python 서버 실행 방식

- `startServer()`에서 수행
  - config 파일 선택
    - packaged: `~/.kira/config.env`
    - dev: `~/.kira/config.env`가 있으면 사용, 없으면 `app/config/env/dev.env` 사용
  - config.env 값을 env로 주입
  - `uv` 경로 탐색 후 `uv run python -m app.main` 실행

> 주의: 레포에 `dev.env`는 없고 `dev.env.example`만 존재합니다. dev 모드에서 `~/.kira/config.env`가 없으면 실행 실패 가능성이 있습니다.

### 5.3 IPC 인터페이스

- renderer → preload(window.api) → main(ipcMain.handle)
  - `get-config`, `save-config`
  - `start-server`, `stop-server`, `get-server-status`
  - `get-version`
  - `send-input` (python stdin)
  - `open-data-folder`

### 5.4 빌드/배포

- `electron-app/package.json`
  - `electron-builder`로 macOS arm64 dmg/zip 생성
  - `extraResources`로 `../app`(Python 코드), `pyproject.toml`, `uv.lock`, `.claude`를 패키징
  - S3 publish 설정(`kira-releases` 버킷)

- CI/CD
  - `KIRA_REFERENCE/.github/workflows/deploy.yml`: tag push(`v*`) 시 self-hosted macOS runner에서 빌드/노터라이즈/배포
  - `KIRA_REFERENCE/deploy.sh`: Electron 배포 + VitePress 문서 배포 + CloudFront invalidation

- macOS 권한/엔타이틀먼트
  - `electron-app/entitlements.mac.plist`: 네트워크 client/server, 파일 read-write, child process 실행 관련 설정 포함

---

## 6) 백엔드 ↔ Electron 연동(데이터 플로우)

### 6.1 설정 저장 흐름

1) renderer에서 사용자 입력 → `window.api.saveConfig(config)`
2) main에서 `~/.kira/config.env` 생성/갱신
3) 서버 시작 시 main이 config.env를 파싱해 python subprocess env로 주입
4) python은 `pydantic BaseSettings`로 환경변수 로딩

### 6.2 서버 시작/종료/로그

- 시작
  - renderer: “시작하기” 클릭 → `start-server`
  - main: `uv run python -m app.main` spawn
  - python: Slack socket mode 연결 + 워커/스케줄러/웹서버(옵션) 실행

- 로그
  - python stdout/stderr → `~/.kira/server.log` append
  - 동시에 renderer로 `server-log` 이벤트로 전송하여 UI에 실시간 표시

- 종료
  - main: process group kill + pkill + 포트 8000 kill(lsof)로 정리

### 6.3 “사용자 입력(엔터)” 브릿지

- python이 콘솔에 `Press ENTER to continue`를 출력하는 경우
  - renderer가 로그 문자열을 감지
  - 사용자가 Enter를 누르면 `send-input('')`로 python stdin에 개행 전달
- 용도 예
  - Chrome 프로필 설정(Playwright)에서 “로그인 후 엔터” 대기

---

## 7) 의존성/운영 전제(중요)

### 7.1 로컬에 반드시/사실상 필요한 것

- **uv**: Electron이 자동 설치를 지원하지만 실패할 수 있음
- **Node.js + npx**: Operator/SimpleChat가 기본적으로 `npx @mcpcentral/mcp-time`, `npx @upstash/context7-mcp` 등 실행 → 미설치 시 핵심 기능이 깨질 가능성이 큼

### 7.2 외부 통신

- Slack(Socket Mode WebSocket) 필수
- Claude/Vertex AI 등 LLM 호출(환경 구성에 의존)
- 활성화된 MCP 서버에 따라 외부 API 호출(Perplexity/DeepL/GitLab/MS365/Atlassian/X/Tableau 등)

---

## 8) 리스크/개선 제안(우선순위)

### 8.1 보안

- **FastAPI 세션 시크릿 하드코딩**
  - 파일: `app/cc_web_interface/server.py`
  - 개선: `WEB_INTERFACE_SESSION_SECRET` 같은 환경변수로 주입 + prod에서 반드시 설정

- **Electron sandbox 비활성화**
  - 파일: `electron-app/main.js`에서 `sandbox: false`
  - Electron 공식 가이드에서는 보안 체크리스트에 sandbox 활성화를 포함합니다. ([Electron Security](https://www.electronjs.org/docs/latest/tutorial/security))
  - 개선: 가능하면 `sandbox: true`로 전환하고 preload에서 필요한 기능을 최소 API로 제공

- **설정 파일(config.env) 평문 저장**
  - 경로: `~/.kira/config.env`
  - 개선 아이디어
    - OS Keychain/Keyring에 토큰 저장(특히 Slack/Perplexity/DeepL 등)
    - 최소한 파일 권한/퍼미션 강제 확인(현재 README에는 owner-only를 언급하지만 Electron에서 강제는 없음)

### 8.2 신뢰성/성능

- **sync Slack API 호출이 이벤트 루프를 블로킹할 수 있음**
  - `app/cc_utils/slack_helper.py`는 동기 `slack_sdk.WebClient`를 사용
  - `_process_message_logic()`는 async인데 내부에서 sync 네트워크 호출이 발생 가능
  - 개선: AsyncWebClient로 통일하거나, thread executor로 분리

- **큐(maxsize=100) 포화 시 처리 지연/적체**
  - 대량 채널/스레드/파일 이벤트에서 enqueue 대기 증가 가능
  - 개선: backlog 관측(메트릭/로그) + 드랍/우선순위/백프레셔 전략 명확화

### 8.3 DX(개발 경험)

- **`dev.env` vs `dev.env.example` 불일치**
  - Electron dev 모드/Settings 로딩에서 `dev.env`를 참조하는데 레포엔 example만 있음
  - 개선: 안내 문서/코드 둘 중 하나로 정합성 맞추기(예: 예제가 없으면 example로 fallback)

- **환경변수 키 이름 혼용 가능성**
  - `RUN_ENV`/`APP_ENV` 동시 존재
  - 개선: “env 파일 선택”과 “런타임 모드”를 하나의 키로 통일

---

## 9) 참고(외부 공식 문서)

- Slack Bolt for Python Socket Mode 개념: [Bolt Python Socket Mode](https://github.com/slackapi/bolt-python/blob/main/docs/english/concepts/socket-mode.md)
- Electron 보안 체크리스트: [Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)

---

## 10) 결론

- 이 코드베이스는 **로컬-퍼스트(온디바이스) 에이전트**로서, Electron이 “런처/설정/가시화(UI)”를 담당하고 Python이 “Slack 에이전트 런타임/도구 실행/데이터 저장”을 담당하는 **명확한 역할 분리**를 갖고 있습니다.
- 핵심 성공 조건은 **로컬 런타임 의존성(uv, node/npx) 보장**과 **보안 설정(세션 시크릿, sandbox 등) 정비**이며, 이 두 축을 강화하면 제품 안정성과 배포 신뢰도가 크게 올라갈 구조입니다.
