# AI 기반 로컬퍼스트 업무일지 앱 아키텍처 리서치 (Electron + Python)

- **작성일**: 2025-12-19
- **근거 리포트**: `docs/report.md` (KIRA_REFERENCE에서 확인된 “Electron 런처 + 로컬 Python 서버 + 큐/스케줄러” 패턴)

---

## 결론(가능 여부)

- **가능합니다.** Electron 데스크톱 앱이 **로컬 Python 백엔드를 별도 프로세스로 실행/관리**하고, Python이 **외부 워크스페이스(GitHub/Slack/Confluence/Jira 등)에서 데이터를 수집→로컬에 캐시/인덱싱→업무일지 작성 보강/제안**을 제공하는 구조는 기술적으로 충분히 구현 가능합니다.
- 특히 `docs/report.md`의 KIRA_REFERENCE는 이미 **(1) Electron이 Python 런타임을 스폰하고 (2) 로그/상태를 UI에 노출하며 (3) APScheduler/큐를 사용해 백그라운드 작업을 수행**하는 운영 패턴을 갖고 있어, 이번 앱도 유사한 “**Sidecar Backend(로컬 백엔드)**” 구조로 가는 것이 가장 현실적입니다.

---

## 핵심 추천 아키텍처(요약)

- **클라이언트(Electron)**: 노트 편집/탐색/검색 UI + 계정 연결(OAuth) UX + 설정/로그/업데이트
- **로컬 백엔드(Python)**: 커넥터 동기화, 데이터 정규화, 로컬 검색(FTS/벡터), AI 제안 생성, 작업 큐/스케줄링
- **로컬 저장소**
  - **노트 원본**: 파일 기반(Markdown) → Obsidian 호환(=Vault) 가능
  - **메타/캐시/인덱스**: SQLite(FTS5) + 벡터 인덱스(로컬) + 첨부파일 폴더
- **통신 방식**: Electron ↔ Python을 **localhost HTTP + WebSocket**으로 연결(스트리밍/진행률/실시간 제안)

---

## 전체 런타임 구성(권장)

```text
┌──────────────────────────────────────────────────────────────────┐
│ Electron Desktop App                                              │
│  - Renderer(UI): 노트 편집/검색/제안 패널                          │
│  - Main: Python backend 실행/종료, 포트/토큰 관리, 로그 수집       │
│  - Preload: 안전한 IPC 브릿지(contextIsolation)                   │
└───────────────┬──────────────────────────────────────────────────┘
                │ localhost HTTP / WebSocket (127.0.0.1)
                │  - /health
                │  - /notes/*  /search/*  /suggest/*  /connectors/*
                │  - ws://... (스트리밍 제안/진행률)
                ▼
┌──────────────────────────────────────────────────────────────────┐
│ Local Python Backend (FastAPI + Scheduler + Workers)              │
│  - Connectors: GitHub/Slack/Confluence/Jira ...                   │
│  - Normalizer: 공통 스키마로 변환                                 │
│  - Store/Index: SQLite + FTS + Embedding/Vector index             │
│  - AI: RAG(검색→컨텍스트 구성→제안/보강)                          │
│  - Jobs: APScheduler + 내부 큐(동기화/인덱싱/요약)                │
└──────────────────────────────────────────────────────────────────┘
                │
                ▼
        External Workspaces APIs (OAuth/Token)
```

### 왜 “localhost HTTP + WebSocket”인가?

- Electron ↔ Python 간 **언어/런타임 경계**를 가장 단순하게 넘을 수 있습니다.
- 제안 생성은 길고(수 초~수십 초), “생성 중” 피드백이 중요하므로 **WebSocket 스트리밍**이 UX에 유리합니다.
- FastAPI는 WebSocket을 공식적으로 지원합니다. 참고: FastAPI WebSocket 문서([FastAPI WebSockets](https://github.com/fastapi/fastapi/blob/master/docs/en/docs/advanced/websockets.md)).

---

## Electron(클라이언트) 설계 포인트

### 1) 편집기 선택

- 목표가 “Obsidian(마크다운)처럼” + “Notion(블록/리치텍스트)처럼”이라면, **내부 표현은 JSON(블록/리치텍스트)** + **저장 포맷은 Markdown**이 가장 구현 난이도/호환성 균형이 좋습니다.
- Electron 렌더러에서 **Tiptap(ProseMirror 기반)**를 사용해 Notion형 UX를 만들고, 저장은 Markdown으로 내보내는 방식이 현실적입니다.
  - Tiptap은 JSON→Markdown 변환 유틸(`@tiptap/static-renderer`) 및 Markdown 관련 가이드를 제공합니다. 참고: Tiptap Markdown 문서(예: “Export > Markdown”, “static-renderer” 등) ([tiptap-docs](https://github.com/ueberdosis/tiptap-docs)).

### 2) 보안(필수 체크리스트)

로컬 앱이라도 렌더러가 파일/토큰을 다루므로 Electron 보안 가이드를 기본 준수해야 합니다.

- **contextIsolation 활성화**
- **sandbox 활성화**(가능하면)
- **nodeIntegration 비활성화**(특히 원격 콘텐츠)
- **CSP(Content Security Policy) 적용**

참고: Electron 공식 Security 체크리스트([Electron Security](https://www.electronjs.org/docs/latest/tutorial/security)).

### 3) 비밀/토큰 저장

- `docs/report.md`의 KIRA_REFERENCE는 `config.env` 평문 저장 리스크를 지적합니다.
- 본 앱은 OAuth 토큰(슬랙/아틀라시안 등)을 다루므로, **OS Keychain/Keyring 저장**을 기본으로 권장합니다.
  - Electron 쪽에서 `keytar` 같은 방식(플랫폼 키체인)을 쓰거나, Python에서 `keyring`을 쓰고, 어느 쪽이 “진실의 원천(source of truth)”인지 명확히 정합니다.

---

## Python 백엔드(로컬) 설계 포인트

### 1) API 서버: FastAPI

- 내부 API는 FastAPI로 충분합니다.
- 긴 작업(동기화/인덱싱/요약/임베딩)은 **즉시 응답 + 백그라운드 작업**으로 분리하고, UI는 job 상태를 폴링하거나 WebSocket 이벤트를 구독합니다.
  - FastAPI BackgroundTasks 참고: “응답 이후 백그라운드 실행”([FastAPI Background Tasks](https://github.com/fastapi/fastapi/blob/master/docs/en/docs/tutorial/background-tasks.md)).
  - 단, 무거운 작업은 BackgroundTasks에 모두 넣기보다, 아래 “작업 큐/스케줄러” 계층으로 넘기는 것이 안전합니다(리포트의 KIRA처럼).

### 2) 작업 큐 + 스케줄링

- 커넥터 동기화/임베딩/인덱싱은 **(a) 주기 작업(스케줄)** + **(b) 이벤트 작업(파일 저장/명령)**로 발생합니다.
- `docs/report.md`처럼 APScheduler를 채택하면 “로컬 앱에서 주기 작업”을 구현하기에 편리합니다.
  - APScheduler는 asyncio 환경에서 백그라운드로 실행하는 패턴을 제공합니다(예: `AsyncScheduler.start_in_background()`). 참고: APScheduler 유저가이드 예제([APScheduler userguide](https://github.com/agronholm/apscheduler/blob/master/docs/userguide.rst)).

권장 구조(리포트의 교훈 반영):

- **API 스레드/이벤트루프**: UI 요청 처리
- **Job Queue(내부)**: 동기화/인덱싱/AI 생성 요청을 큐로 적재
- **Workers**: I/O 작업(커넥터), CPU 작업(임베딩), LLM 호출을 분리(동시성/백프레셔/재시도)

### 3) 저장소: “파일 + SQLite” 투트랙

- **노트 원본은 파일 기반 Markdown**을 추천합니다.
  - Obsidian vault 호환이 쉬움
  - 사용자가 파일을 직접 백업/동기화(Git/iCloud/Dropbox 등) 가능
- **SQLite는 ‘메타데이터 + 캐시 + 인덱스’** 용도로 사용합니다.
  - 노트 메타: 파일 경로, 해시/수정시각, 태그, 링크, 워크스페이스
  - 커넥터 캐시: API에서 받은 raw JSON, 증분 동기화 커서(cursor)
  - 검색: FTS5(키워드) + 벡터(semantic)

### 4) AI 제안 파이프라인(RAG 형태)

업무일지 “보강/제안”은 기본적으로 RAG(검색 기반)로 설계하는 것이 통제/재현성이 좋습니다.

- **Step 0. 날짜/범위 추정**: 오늘 일지면 기본 time-window(예: 00:00~현재)
- **Step 1. 후보 컨텍스트 수집**
  - 키워드(FTS) + 의미검색(벡터) + 필터(날짜/워크스페이스/작성자)
  - 예: 오늘 커밋/PR/이슈, 오늘 Slack에서 내가 말한 스레드, Jira 티켓 상태 변화
- **Step 2. 컨텍스트 정리/압축**
  - 원문 그대로 던지지 않고, 소스별 요약(짧게) + 링크(출처)로 구성
- **Step 3. 제안 생성**
  - “업무일지 문장 보강”, “누락된 항목 후보”, “내일 할 일 초안” 등
  - **반드시 출처를 함께 제시**해서 사용자가 검증/선택 가능하도록(‘AI가 써준 것’이 아니라 ‘근거 기반 제안’)
- **Step 4. 적용(사용자 승인)**
  - 자동 삽입보다는 ‘제안 카드’ → 클릭 시 노트에 삽입/링크 첨부

---

### 5) AI 런타임 선택(중요): KIRA처럼 “Claude Code 기반 Agent”를 가져갈까?

결론부터 말하면, **MVP/초기 제품에는 KIRA 패턴을 가져가는 게 매우 실용적**입니다. 다만 “제품” 관점에서 **락인/설치/구독 리스크**가 있으니, 아키텍처는 처음부터 *교체 가능*하게 설계하는 것을 권장합니다.

#### KIRA에서 보이는 실제 패턴(요약)

- Python 코드가 `claude_agent_sdk`의 `ClaudeSDKClient`를 사용해 세션을 유지하고 `/compact` 같은 Claude Code 커맨드도 호출합니다.
- Electron main이 `claude` 실행 파일을 찾고 `CLAUDE_CODE_CLI_PATH`를 환경변수로 주입합니다.
- 즉 “AI 엔진(Claude Code)을 외부 프로세스/CLI로 두고, Python이 SDK로 제어”하는 구조에 가깝습니다.

#### 이 패턴을 가져가면 좋은 점

- **에이전트 루프/도구 호출/tool permission/세션 관리**를 직접 구현하지 않아도 됩니다.
- **MCP 생태계**를 그대로 활용 가능(외부 MCP 서버/HTTP/SSE/stdio 등).
- 커넥터/도메인 로직을 “외부 npx MCP 서버”로만 만들 필요 없이, **in-process SDK MCP tool**(Python 함수)로 구현할 수 있어 배포가 쉬워집니다.
  - 예: `@tool(...)` + `create_sdk_mcp_server(...)`로 파이썬 함수 도구화 ([claude-code-sdk-python README](https://github.com/anthropics/claude-code-sdk-python/blob/main/README.md)).
- Hooks로 “PreToolUse에서 위험한 액션 차단” 같은 **결정적(Deterministic) 가드레일**을 추가하기 좋습니다.
  - 참고: Claude Code Hooks 문서([Claude Code Hooks](https://docs.anthropic.com/en/docs/claude-code/hooks)).

#### 가져갈 때 주의할 점(제품 관점 리스크)

- **런타임 의존성**: Claude Code CLI 설치/버전, Node.js 등이 필요할 수 있습니다.
  - SDK 자체도 “Claude Code 설치 안 됨” 같은 예외(`CLINotFoundError`)를 가정하고 있습니다([claude-code-sdk-python README](https://github.com/anthropics/claude-code-sdk-python/blob/main/README.md)).
  - 따라서 설치/업데이트/로그인 UX를 앱이 책임져야 합니다.
- **구독/락인**: KIRA 문서처럼 “Claude Pro 플랜 이상 필요” 형태가 되면, **일반 사용자 제품으로 확장할 때 장벽**이 됩니다.
- **로컬퍼스트 ≠ 오프라인 AI**: 업무일지 앱은 오프라인에서도 “노트 작성/검색”은 돌아가야 하지만, Claude Code 기반이면 AI 호출은 네트워크 의존이 됩니다(오프라인 graceful degradation 설계 필요).
- **보안/프라이버시**: 도구가 파일/토큰/외부 API에 접근하므로, allowlist/denylist, 최소 권한, 데이터 수집 범위 제한이 중요합니다.

#### 권장: “Provider 추상화 + 하이브리드”

처음부터 AI를 단일 구현으로 고정하지 말고, 아래처럼 **AI Provider 인터페이스**로 추상화하는 것을 추천합니다.

- **Provider A (초기/MVP)**: Claude Agent SDK / Claude Code 기반(=KIRA 패턴)
  - 장점: 개발 속도, MCP/툴링, 스트리밍/세션, 가드레일
- **Provider B (확장/상용)**: 직접 API(Anthropic Messages API 등) 연동
  - 장점: 설치/구독 장벽 낮춤, 모델/비용 제어 용이, 제품화 수월
- **Provider C (옵션)**: 로컬 LLM(선택)
  - 장점: 오프라인/데이터 주권 강화(품질/성능 트레이드오프)

---

## 커넥터(외부 워크스페이스) 설계 전략

### 공통 원칙

- **증분 동기화(Incremental sync)**를 기본으로
  - “마지막 동기화 시각 + 커서/ETag/페이지네이션 토큰”을 저장
- **로컬 캐시 우선(오프라인 UX)**
  - 네트워크 불가 시에도 “이전 동기화 데이터로 제안” 가능
- **공통 정규화 스키마**
  - 예: `Artifact(source, workspace_id, type, id, url, title, body, author, created_at, updated_at, participants, tags, raw_json_ref)`

### GitHub

- 수집 대상(초기 MVP 권장):
  - PR/Issue, 코멘트, 내 커밋/푸시 이벤트, 리뷰, 릴리즈 노트
- 강점: 날짜 기반/사용자 기반으로 “업무 로그”가 잘 뽑힘
- 구현 난이도: 중(토큰/스코프 설계는 비교적 단순)

### Slack

- 수집 대상:
  - 내가 참여한 스레드, 멘션, DM/채널 메시지(선별적으로), 파일 공유
- 난점:
  - 범위가 커지면 개인정보/보안 이슈가 커짐(“읽을 채널/기간”을 반드시 제한)
  - API 레이트리밋/권한이 까다로울 수 있음

### Confluence / Jira(Atlassian)

- 수집 대상:
  - Confluence: 최근 수정 페이지/내가 본 페이지/댓글
  - Jira: 내가 담당/관찰하는 이슈, 상태 변경 내역, 코멘트
- 난점:
  - 테넌트별 OAuth(3LO) 및 권한 범위 관리
  - 데이터 모델이 복잡(특히 Jira)

---

## 배포/패키징(데스크톱 로컬퍼스트)

### 권장: Electron 단일 앱 번들 + Python sidecar 포함

- `docs/report.md`의 KIRA_REFERENCE처럼, **electron-builder의 `extraResources`/`asarUnpack`**를 이용해 Python 실행 파일/리소스를 앱에 포함시키고, Electron main에서 이를 스폰합니다.
  - electron-builder의 파일 포함/제외, extraResources 예시 참고([electron-builder docs](https://github.com/electron-userland/electron-builder)).

운영 시 고려사항:

- 포트 충돌 방지: **랜덤 포트**(0 바인드 후 실제 포트 확인) 또는 포트 탐색
- 로컬 API 보호: **세션 토큰/nonce**를 Electron이 생성해 Python에 전달 → 모든 요청에 헤더로 포함
- 업데이트: 자동 업데이트 사용 시, Python sidecar도 함께 교체되도록 패키징

---

## MVP 제안(리스크를 줄이는 순서)

### Phase 0 — 로컬 노트 앱(기반)

- Vault(폴더) 열기/생성
- Daily note 템플릿(날짜별 파일)
- 검색(파일명/FTS) + 태그

### Phase 1 — GitHub 기반 자동 업무일지 제안

- GitHub 연결
- “오늘의 활동 자동 수집” → 제안 카드(출처 링크 포함)
- 노트에 삽입/되돌리기

### Phase 2 — Slack 요약/하이라이트(선별 수집)

- ‘나에게 관련된’ 이벤트 중심으로 제한(멘션/DM/내가 쓴 메시지 등)
- 개인정보/채널 범위를 UI에서 명시적으로 선택

### Phase 3 — Jira/Confluence 확장

- Jira 이슈 변화 로그 기반으로 “오늘 한 일/내일 할 일” 제안 고도화

---

## 주요 리스크 & 완화 전략

- **(보안) 토큰/민감데이터 로컬 저장**
  - Keychain/Keyring 사용, 암호화된 로컬 DB 옵션 제공
- **(프라이버시) Slack/Confluence 데이터 과수집**
  - 기본값을 ‘최소 수집’으로, 사용자가 범위를 늘리도록
- **(성능) 데이터/임베딩 인덱싱 비용**
  - 증분 인덱싱 + 백그라운드 큐 + 우선순위(최근/중요) 적용
- **(품질) AI 환각/오류**
  - 출처 기반 제안(RAG) + “자동 삽입 금지(사용자 승인)”
- **(운영) Electron 보안 설정 누락**
  - Electron 공식 체크리스트를 릴리즈 게이트로 설정([Electron Security](https://www.electronjs.org/docs/latest/tutorial/security))

---

## 결정이 필요한 질문(초기 설계 확정용)

- **AI 실행 위치**: (1) 로컬 LLM(Ollama 등) 우선? (2) 클라우드 LLM 허용? (3) 하이브리드?
- **노트 저장 포맷**: Markdown only(Obsidian 100% 호환) vs 내부 JSON + Markdown export(Tiptap 기반)
- **데이터 동기화 범위**: 각 커넥터별 최소 범위(기간/채널/프로젝트)를 어떻게 UX로 제한할지
- **멀티 워크스페이스 정의**: “Vault = workspace”인지, “Vault 내부에 여러 연결(workspaces)”인지

---

## 다음 단계(실행 제안)

1) MVP 스코프를 Phase 1(GitHub)까지로 확정
2) “노트 포맷/폴더 구조/메타데이터 스키마”를 먼저 결정
3) Electron↔Python 통신(HTTP+WS) 프로토콜과 job 모델(상태/진행률)을 설계
4) 커넥터 1개(GitHub)로 end-to-end(수집→캐시→검색→제안→삽입) 성공 케이스를 만든 뒤 확장
