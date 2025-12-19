# claude-code-cli 설계 리서치: 필요한 에이전트/스킬

- **작성일**: 2025-12-19
- **근거 문서**: `docs/report.md`, `docs/my-spec/research.md`
- **추가 근거(레퍼런스)**:
  - Claude Code SDK Python: `/anthropics/claude-code-sdk-python` (in-process MCP tool, Hook/permission)
  - Claude Code Skills: `/anthropics/claude-code` (skills 구조/metadata)

---

## 0) 요약

- KIRA_REFERENCE(`docs/report.md`)에서 검증된 패턴은 **(Ingress) 분류 → (Queue) 비동기 처리 → (멀티 에이전트) SimpleChat/Memory/Operator → (Tools) MCP + 내부 도구 → (응답/저장)** 입니다.
- 내 스펙(`docs/my-spec/research.md`)에 맞는 claude-code-cli는 위 패턴을 CLI/로컬퍼스트 앱에 맞게 일반화해서,
  - **계획(Plan)과 실행(Operate)을 분리**하고
  - **RAG 컨텍스트 빌더를 별도 역할로 둔 뒤**
  - **Hook 기반 가드레일(PreToolUse deny)** 로 안전장치를 강제하는 구성이 가장 안정적입니다.

---

## 1) 설계 기준(두 문서에서 추출된 요구)

### 1.1 KIRA_REFERENCE에서 얻은 구조적 요구(운영 패턴)

- Electron이 로컬 Python 서버를 실행/관리하고, Python이 Slack 이벤트를 받아 **큐 기반 멀티 에이전트**로 처리
- 에이전트 역할 분리(예: SimpleChat, BotCallDetector, MemoryRetriever/Manager, Operator)
- Operator는 MCP 서버(대부분 npx)를 통해 외부 도구를 활용하며, 컨텍스트 오버플로우 시 `/compact` 재시도 같은 회복 로직을 가짐

> 참고: `docs/report.md` 4.4 섹션에 SimpleChat/BotCallDetector/Memory/Operator가 정리되어 있음.

### 1.2 내 스펙에서 요구되는 제품 관점(로컬퍼스트 + RAG)

- 로컬 저장소(파일/SQLite/인덱스)를 기반으로 **근거 기반 제안(RAG)** 을 제공
- 커넥터(GitHub → Slack → Jira/Confluence 순)로 활동 로그를 수집하고 “업무일지”로 보강
- 토큰/민감 데이터는 최소 권한/최소 수집을 기본값으로 하고, **사용자 승인 기반 적용**
- AI 엔진은 KIRA처럼 Claude Code 기반을 활용하되, **Provider 추상화**(교체 가능성)와 **오프라인 graceful degradation** 필요

---

## 2) 필요한 에이전트(권장)

> 여기서 “에이전트”는 claude-code-cli(또는 SDK)가 실행하는 역할 단위를 의미합니다.
> 구현은 단일 프로세스/단일 세션이어도 되지만, 권한/툴/프롬프트를 분리해야 안전하고 디버깅이 쉬워집니다.

### 2.1 Ingress/Router Agent (분류·라우팅)

- **목적**: 사용자 입력을 `간단 응답` vs `복잡 작업`으로 분류하고, 어떤 파이프라인으로 보낼지 결정
- **근거**: KIRA의 SimpleChat이 “간단/복잡”을 1차 분류하여 큐/오케스트레이터로 넘기는 구조
- **권한/도구**:
  - 허용: `time`, (선택) `context7`
  - 금지(기본): 파일 쓰기/외부 API 호출/Bash

### 2.2 Planner Agent (계획 수립 전용)

- **목적**: 실행 전에 “어떤 도구를 어떤 순서로 쓸지”를 계획으로 고정(실행은 하지 않음)
- **이점**: 실행 단계에서 불필요한 툴 호출/데이터 과수집을 줄이고, 승인 UX/감사 로그에 유리
- **권한/도구**:
  - 허용: 읽기/조회 계열(설정 조회, 인덱스 조회), `time`, (선택) `context7`
  - 금지: Write/Bash/네트워크 커넥터 실행

### 2.3 Context Builder / Retriever Agent (RAG 컨텍스트 구성)

- **목적**: 로컬 캐시/인덱스에서 근거(Artifacts)를 모아 **짧은 근거 묶음**으로 압축
- **필수 기능**:
  - 날짜/기간 필터(오늘/이번주)
  - 소스별( GitHub/Slack/Jira/노트 ) 요약 + 출처 링크 유지
- **권한/도구**:
  - 허용: `search(fts/vector)`, `store(read)`, `connectors(read-cache)`, `time`
  - 금지(기본): 외부 API 재동기화(=Executor만)

### 2.4 Operator/Executor Agent (실행 중심)

- **목적**: 실제 작업 실행(동기화 수행, 노트 생성/수정, Slack 메시징, 스케줄 등록 등)
- **근거**: KIRA Operator가 “복잡 작업 + MCP 도구”의 중심
- **권한/도구**:
  - 허용: 모든 실행계 스킬(파일/네트워크/스케줄/큐)
  - 단, **Safety/Policy Hook**를 반드시 통과해야 함

### 2.5 Safety/Policy Agent (승인·차단·검증)

- **목적**: 위험 행동(대량 파일 수정, Bash, 민감정보 접근, 외부 전송)을 통제
- **구현 근거(Claude Code SDK)**:
  - Claude Code SDK Python은 `PreToolUse` 이벤트를 Hook으로 가로채 **permissionDecision=deny** 를 반환할 수 있음.
  - 즉 “정책 위반 도구 호출”을 모델이 하려 해도 실행 단계에서 차단 가능.

### 2.6 Memory Manager Agent (지속 메모리 저장/재사용)

- **목적**: 대화/작업 결과를 다음 요청에 재사용할 수 있게 “메모리(요약/태그/링크)”로 저장
- **운영 권장**:
  - KIRA처럼 저장 작업은 단일 큐로 직렬화(레이스/중복 저장 방지)

### 2.7 Summarizer/Compactor Agent (컨텍스트 압축)

- **목적**: 긴 작업에서 컨텍스트가 커질 때 핵심만 남기도록 압축
- **근거**: KIRA Operator가 컨텍스트 오버플로우 시 `/compact` 재시도 루틴을 둠

### 2.8 (Slack 기반 제품이면) 보조 에이전트

- **Bot Call Detector / Thread Context Detector**: 그룹 채널에서 “봇 호출 여부” 판단
- **Proactive Suggester**: 호출이 없어도 “관련 제안” 시도
- **Answer Aggregator**: 다른 사람에게 포워딩한 질문/답변을 취합

---

## 3) 필요한 스킬(툴/도메인) 목록

스킬은 두 층으로 나누는 것을 권장합니다.

- **A) 실행 스킬(=Tool/MCP)**: 에이전트가 실제로 호출하는 기능
- **B) 지식 스킬(=Claude Code Skills 문서화)**: `skills/<name>/SKILL.md`로 워크플로/정책/리소스를 패키징

### 3.1 코어 실행 스킬(필수)

- **time**: 날짜 범위 계산(오늘 업무일지, 이번주 회고 등)
- **notes/vault**: 일지 파일 생성/삽입/되돌리기(기본은 Markdown)
- **search/index**: SQLite FTS5 + 벡터 검색(근거 기반 제안 핵심)
- **jobs/queue**: 동기화/인덱싱/요약 작업 enqueue + 상태/진행률 조회
- **config**: 연결 범위(채널/기간/프로젝트) 저장/조회
- **secrets**: 토큰/비밀을 Keychain/Keyring에 저장/조회(평문 env/file 최소화)

### 3.2 커넥터 실행 스킬(Phase 확장)

- **github** (Phase 1): PR/Issue/Commit/Review 수집 + 증분 동기화
- **slack** (Phase 2): 멘션/DM/내 메시지 중심 최소 수집 + 레이트리밋/권한 고려
- **atlassian(jira/confluence)** (Phase 3): 이슈 상태 변화/페이지 업데이트 수집

### 3.3 운영/보조 실행 스킬

- **scheduler**: APScheduler 기반 주기 동기화/인덱싱
- **files**: 첨부/이미지 base64 저장/읽기 등
- **context7**: 라이브러리/API/SDK 사용 시 최신 문서 기반 근거 확보

---

## 4) Claude Code 기반 구현 시 핵심 기술 포인트(리서치)

### 4.1 In-process MCP tool(파이썬 함수 도구화)

- 외부 npx MCP 서버만으로 커넥터/도메인 로직을 만들지 않고,
  **Python 함수 자체를 `@tool`로 감싸 in-process MCP server로 노출**할 수 있습니다.
- 이 방식은 배포/운영에서 “외부 프로세스 의존성”을 줄이고, 로컬퍼스트 앱에 유리합니다.

### 4.2 Hook 기반 가드레일(PreToolUse)

- Claude Code SDK Python은 Hook으로 `PreToolUse`를 가로채서
  특정 명령/패턴/경로를 차단(deny)하는 형태의 결정적 정책을 구현할 수 있습니다.
- 정책 대상 예시:
  - Bash 실행 금지/제한
  - 특정 디렉터리 바깥 파일 쓰기 금지
  - Slack/Confluence 과수집 방지(기간/채널/프로젝트 제한)
  - 민감정보(토큰/키) 외부 전송 금지

### 4.3 Skills 시스템(지식/워크플로 패키징)

- Claude Code Skills는 `skills/<skill-name>/SKILL.md` 파일이 자동으로 로드되는 구조이며,
  **YAML frontmatter의 name/description이 “언제 사용되는지”를 좌우**합니다.
- 따라서 아래 항목을 “지식 스킬”로 별도 패키징하는 것이 좋습니다.
  - 업무일지 생성 표준 절차(근거→압축→제안→승인)
  - 증분 동기화 규칙(커서/ETag/페이지 토큰)
  - 프라이버시/보안 가드레일(최소 수집 기본값)

---

## 5) 권장 체크리스트(설계 산출물)

- [ ] 에이전트별 역할/권한/허용 도구 목록 확정
- [ ] “계획(Planner) → 실행(Operator)” 경계를 API/세션 단위로 고정
- [ ] RAG 컨텍스트 스키마(Artifacts) + 출처 링크 포맷 정의
- [ ] Hook 정책(PreToolUse) 최소 1차 버전 구현: 위험 행동 차단
- [ ] Skills 패키지 초안 3개: `journal-generation`, `incremental-sync`, `privacy-guardrails`

---

## 6) 다음 단계(제안)

- 이 문서의 에이전트/스킬을 바탕으로, claude-code-cli의 **명령어 표면**을 설계합니다.
  - 예: `connect`, `sync`, `status`, `search`, `suggest`, `journal`, `apply`, `schedule`
- 각 명령이 호출하는 파이프라인(Agent chain)과
  필요한 tool allowlist/Hook 정책을 1:1로 매핑합니다.
