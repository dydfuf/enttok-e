# 업무일지 앱 제품 스펙 (MVP - Phase 1)

- **작성일**: 2025-12-19
- **스코프**: Phase 0 (로컬 노트) + Phase 1 (GitHub 기반 자동 제안)
- **근거 문서**: `research.md`, `electron-research.md`, `claude-code-cli-research.md`, `local-rag.md`, `report.md`

---

## 1. 제품 개요

### 1.1 한 줄 요약

**로컬퍼스트 업무일지 앱**: Markdown 기반 노트 편집 + GitHub 활동 자동 수집 + AI 기반 업무일지 제안

### 1.2 핵심 가치

- **로컬퍼스트**: 모든 데이터(노트/캐시/인덱스)는 사용자 로컬에 저장
- **근거 기반 제안**: AI가 "추측"이 아닌 "GitHub 활동 기반 근거"로 제안
- **사용자 통제**: 자동 삽입 없음, 모든 제안은 사용자 승인 후 적용
- **Obsidian 호환**: Markdown 파일 기반으로 기존 vault와 호환 가능

### 1.3 MVP 스코프 (Phase 0 + Phase 1)

| Phase   | 기능             | 설명                                                |
| ------- | ---------------- | --------------------------------------------------- |
| Phase 0 | 로컬 노트 앱     | Vault 열기/생성, Daily note, 검색(FTS), 태그        |
| Phase 1 | GitHub 자동 제안 | GitHub 연결, 오늘의 활동 수집, 제안 카드, 노트 삽입 |

---

## 2. 아키텍처

### 2.1 전체 구조

```text
┌──────────────────────────────────────────────────────────────────┐
│ Electron Desktop App                                              │
│  - Renderer: 노트 편집(Tiptap) + 검색 + 제안 패널 + 설정          │
│  - Main: Python 서버 실행/종료, 런타임 의존성 확인, 로그 수집     │
│  - Preload: IPC 브릿지 (contextIsolation)                        │
└───────────────┬──────────────────────────────────────────────────┘
                │ localhost HTTP / WebSocket (127.0.0.1)
                ▼
┌──────────────────────────────────────────────────────────────────┐
│ Local Python Backend (FastAPI + Claude Code SDK)                  │
│  - API: /notes, /search, /suggest, /connectors, /jobs            │
│  - Agents: Planner, Context Builder, Operator, Safety            │
│  - Index: SQLite + FTS5 + sqlite-vec                             │
│  - Jobs: APScheduler + 작업 큐                                   │
└──────────────────────────────────────────────────────────────────┘
                │
                ▼
        GitHub API (OAuth)
```

### 2.2 컴포넌트별 역할

#### Electron (클라이언트)

| 컴포넌트     | 역할                                                                      |
| ------------ | ------------------------------------------------------------------------- |
| Main Process | Python 서버 스폰/종료, 런타임 확인(Node/Claude), 설정 관리, 자동 업데이트 |
| Renderer     | 노트 편집 UI, 검색, 제안 패널, GitHub 연결 UX, 설정                       |
| Preload      | 안전한 IPC 브릿지 (contextIsolation 활성화)                               |

#### Python Backend (로컬 서버)

| 컴포넌트        | 역할                                        |
| --------------- | ------------------------------------------- |
| FastAPI         | REST API + WebSocket (스트리밍 제안/진행률) |
| Claude Code SDK | AI 에이전트 실행, MCP 도구 호출             |
| SQLite          | 노트 메타, GitHub 캐시, FTS5 + 벡터 인덱스  |
| APScheduler     | 주기 동기화, 백그라운드 인덱싱              |

### 2.3 통신 프로토콜

- **HTTP REST**: 노트 CRUD, 검색, 설정, 커넥터 상태
- **WebSocket**: 제안 생성 스트리밍, 동기화 진행률, 실시간 상태

---

## 3. 데이터 모델

### 3.1 노트 저장 (파일 기반)

```text
<vault_path>/
├── daily/
│   ├── 2025-12-19.md
│   └── 2025-12-20.md
├── notes/
│   └── *.md
└── .meta/
    ├── index.db          # SQLite (메타/캐시/인덱스)
    └── config.json       # vault 설정
```

#### Daily Note 형식 (Markdown)

```markdown
---
date: 2025-12-19
tags: [daily]
---

# 2025-12-19

## 오늘 한 일

-

## 내일 할 일

-

## 메모
```

### 3.2 SQLite 스키마 (index.db)

```sql
-- 노트 메타데이터
create table notes (
  note_id integer primary key,
  path text unique not null,
  title text,
  content_hash text not null,
  updated_at text not null,
  tags_json text
);

-- 검색 청크
create table chunks (
  chunk_id integer primary key,
  note_id integer references notes(note_id),
  chunk_index integer,
  text text not null,
  token_count integer
);

-- FTS 인덱스
create virtual table chunks_fts using fts5(
  chunk_id unindexed,
  text,
  tokenize='unicode61'
);

-- 벡터 인덱스
create virtual table chunks_vec using vec0(
  chunk_id integer primary key,
  embedding float[384] distance_metric=cosine
);

-- GitHub 캐시
create table github_artifacts (
  artifact_id integer primary key,
  type text not null,           -- 'pr', 'issue', 'commit', 'review'
  external_id text unique not null,
  repo text not null,
  title text,
  body text,
  author text,
  created_at text,
  updated_at text,
  url text,
  raw_json text
);

-- 동기화 상태
create table sync_state (
  connector text primary key,
  cursor text,
  last_sync_at text
);
```

---

## 4. 기능 상세

### 4.1 Phase 0: 로컬 노트 앱

#### 4.1.1 Vault 관리

- **열기**: 기존 폴더를 vault로 열기 (`.meta/` 자동 생성)
- **생성**: 새 vault 폴더 생성
- **최근 vault**: 최근 열었던 vault 목록 유지

#### 4.1.2 Daily Note

- **자동 생성**: 오늘 날짜의 daily note가 없으면 템플릿으로 생성
- **빠른 접근**: 사이드바에서 "오늘" 클릭 시 바로 열기
- **템플릿**: 자유롭게 커스터마이징 가능 (raw Markdown 직접 편집)

#### 4.1.3 노트 편집

- **편집기**: Tiptap (ProseMirror 기반)
- **저장 포맷**: Markdown only
- **지원 문법**: CommonMark + GFM (표, 체크리스트, 코드 블록)
- **자동 저장**: 변경 후 1초 debounce로 자동 저장

#### 4.1.4 검색

- **키워드 검색**: FTS5 기반 전문 검색
- **의미 검색**: sqlite-vec 기반 벡터 검색 (Phase 1에서 활성화)
- **필터**: 날짜 범위, 태그
- **결과 미리보기**: 매칭 문맥 하이라이트

#### 4.1.5 태그

- **인라인 태그**: `#tag` 형식 자동 인식
- **YAML frontmatter**: `tags: [a, b]` 지원
- **태그 검색**: 사이드바에서 태그별 필터링

### 4.2 Phase 1: GitHub 자동 제안

#### 4.2.1 GitHub 연결

- **인증**: OAuth (Device Flow 권장)
- **권한 범위**: `repo` (PR/Issue/Commit 읽기)
- **토큰 저장**: OS Keychain (macOS Keychain, Windows Credential Manager)
- **연결 해제**: 설정에서 토큰 삭제 + 캐시 정리

#### 4.2.2 활동 수집

- **수집 대상**:

  - 내가 만든/참여한 PR
  - 내가 만든/할당된 Issue
  - 내 커밋
  - 내가 남긴/받은 리뷰 코멘트

- **동기화 전략**:

  - 증분 동기화 (cursor 기반)
  - 기본: 수동 트리거 ("지금 동기화" 버튼)
  - 향후: 자동 동기화 옵션 추가 가능

- **저장**:
  - `github_artifacts` 테이블에 캐시
  - raw JSON 보존 (디버깅/확장용)

#### 4.2.3 제안 생성 (AI)

- **트리거**:

  - "제안 받기" 버튼 클릭 (수동 요청 기본값)
  - 향후: Daily note 열 때 자동 제안 옵션 추가 가능

- **파이프라인**:

  1. 날짜 범위 결정 (오늘 00:00 ~ 현재)
  2. GitHub 캐시에서 해당 기간 활동 조회
  3. Context Builder가 활동을 요약/압축
  4. Operator가 "오늘 한 일" 제안 생성
  5. 출처 링크 포함하여 제안 카드로 표시

- **제안 형식**:
  ```markdown
  - feat: 로그인 기능 구현 ([PR #123](https://github.com/...))
  - fix: 버그 수정 ([commit abc123](https://github.com/...))
  - review: @teammate의 PR 리뷰 ([PR #456](https://github.com/...))
  ```

#### 4.2.4 제안 적용

- **미리보기**: 제안 카드에서 내용 확인
- **삽입**: "적용" 클릭 시 현재 커서 위치(또는 "오늘 한 일" 섹션)에 삽입
- **편집 후 적용**: 제안 내용 수정 후 적용 가능
- **거절**: "무시" 클릭 시 제안 닫기

---

## 5. AI 런타임

### 5.1 Claude Code SDK 기반

- **전제**: 사용자가 Claude Pro 이상 구독 중
- **런타임 의존성**:

  - Node.js (npx 실행용)
  - Claude Code CLI (`claude` 명령어)

- **의존성 확인** (KIRA 패턴 참고):
  - Electron main에서 앱 시작 시 확인
  - 미설치 시 안내 메시지 + 설치 가이드 링크

### 5.2 에이전트 구성

| 에이전트        | 역할                           | 허용 도구                        |
| --------------- | ------------------------------ | -------------------------------- |
| Planner         | 작업 계획 수립 (실행 안 함)    | time, config(read)               |
| Context Builder | GitHub 캐시에서 근거 수집/압축 | search, github(read-cache), time |
| Operator        | 제안 생성, 노트 삽입           | notes, search, time              |
| Safety          | 위험 행동 차단 (Hook)          | -                                |

### 5.3 Safety Hook (PreToolUse)

- **차단 대상**:
  - Bash 실행
  - vault 바깥 파일 접근
  - 네트워크 요청 (GitHub API 직접 호출 차단, 캐시만 사용)
  - 민감 정보 외부 전송

### 5.4 MCP 도구 (in-process)

```python
# 예시: notes 도구
@tool(name="notes_insert")
def insert_to_note(path: str, content: str, section: str | None = None):
    """노트에 내용 삽입"""
    ...

@tool(name="search_fts")
def search_fts(query: str, date_from: str | None = None, date_to: str | None = None):
    """키워드 검색"""
    ...

@tool(name="github_get_activities")
def get_github_activities(date: str):
    """특정 날짜의 GitHub 활동 조회 (캐시에서)"""
    ...
```

---

## 6. UI/UX

### 6.1 UI 라이브러리

- **선택**: Radix UI Primitives + shadcn/ui + Tailwind CSS
- **이유**: 접근성/키보드/포커스 처리 + 디자인 자유도 + 오픈 코드

### 6.2 레이아웃

```text
┌─────────────────────────────────────────────────────────────┐
│ [Title Bar - custom, draggable]                              │
├──────────┬──────────────────────────────────┬───────────────┤
│ Sidebar  │ Editor                           │ Suggestion    │
│          │                                  │ Panel         │
│ - Today  │ # 2025-12-19                     │               │
│ - Notes  │                                  │ [제안 카드]    │
│ - Search │ ## 오늘 한 일                     │               │
│ - Tags   │                                  │ - PR #123...  │
│          │ - ...                            │ - commit...   │
│ - GitHub │                                  │               │
│ - Settings│                                 │ [적용] [무시]  │
│          │                                  │               │
└──────────┴──────────────────────────────────┴───────────────┘
```

### 6.3 핵심 인터랙션

- **커맨드 팔레트**: `Cmd+K` → 빠른 노트 전환, 검색, 명령 실행
- **Daily note 이동**: `Cmd+T` → 오늘의 daily note로 이동
- **제안 패널 토글**: `Cmd+Shift+S` → 제안 패널 열기/닫기
- **동기화**: `Cmd+Shift+R` → GitHub 수동 동기화

### 6.4 테마

- **라이트/다크**: 시스템 설정 따름 + 수동 전환
- **CSS Variables**: 전역 테마 토큰으로 관리

---

## 7. 보안

### 7.1 Electron 보안 체크리스트

- [x] `contextIsolation: true`
- [x] `nodeIntegration: false`
- [x] `sandbox: true` (가능한 경우)
- [ ] CSP 적용 (렌더러)

### 7.2 토큰/비밀 저장

- **방식**: OS Keychain/Keyring
- **대상**: GitHub OAuth 토큰
- **평문 저장 금지**: config 파일에 토큰 저장하지 않음

### 7.3 로컬 API 보호

- **방식**: Electron이 세션 토큰 생성 → Python에 환경변수로 전달
- **검증**: 모든 HTTP/WS 요청에 토큰 헤더 필수

---

## 8. 배포/패키징

### 8.1 번들 구성

```text
App.app/
├── Contents/
│   ├── MacOS/
│   │   └── App (Electron)
│   └── Resources/
│       ├── app.asar
│       ├── python/          # Python 코드
│       ├── pyproject.toml
│       └── uv.lock
```

### 8.2 런타임 의존성 확인

앱 시작 시 확인 순서:

1. **Node.js**: `which node` 또는 PATH 탐색
2. **Claude Code CLI**: `which claude` 또는 알려진 경로 탐색
3. **uv**: 자동 설치 시도 (KIRA 패턴)

미설치 시:

- 안내 다이얼로그 표시
- 설치 가이드 링크 제공
- "다시 확인" 버튼

### 8.3 자동 업데이트

- **방식**: electron-updater
- **배포**: S3 또는 GitHub Releases

---

## 9. 개발 우선순위

### 9.1 Phase 0 (로컬 노트 앱)

1. Electron 기본 구조 (main/preload/renderer)
2. Python 서버 스폰/종료
3. Vault 열기/생성
4. Daily note 템플릿
5. Tiptap 에디터 (Markdown 저장)
6. FTS5 검색
7. 태그 인식/필터링

### 9.2 Phase 1 (GitHub 제안)

1. GitHub OAuth 연결
2. 활동 수집 + 캐시
3. Claude Code SDK 연동
4. Context Builder 에이전트
5. Operator 에이전트 (제안 생성)
6. Safety Hook
7. 제안 패널 UI
8. 삽입/거절 UX

---

## 10. 향후 확장 (Phase 2+)

| Phase   | 기능             | 비고                                    |
| ------- | ---------------- | --------------------------------------- |
| Phase 2 | Slack 연동       | 멘션/DM 중심 최소 수집, 레이트리밋 고려 |
| Phase 3 | Jira/Confluence  | 이슈 상태 변화 기반 제안                |
| Phase 4 | 벡터 검색 고도화 | rerank, 하이브리드 검색 개선            |
| Phase 5 | GraphRAG         | Lightweight graph부터 단계적 도입       |
| Phase 6 | 오프라인 모드    | AI 없이 노트/검색만 동작                |

---

## 11. 결정 사항 요약

| 항목          | 결정                                        |
| ------------- | ------------------------------------------- |
| MVP 스코프    | Phase 0 + Phase 1 (로컬 노트 + GitHub 제안) |
| 노트 포맷     | Markdown only                               |
| AI 런타임     | Claude Code SDK (구독 있다고 가정)          |
| 커넥터        | GitHub만 MVP에 포함                         |
| 오프라인      | 우선순위 낮음 (Phase 6으로 미룸)            |
| UI 라이브러리 | Radix + shadcn/ui + Tailwind                |
| 토큰 저장     | OS Keychain                                 |
| 동기화/제안   | 수동 트리거 기본값                          |
| 멀티 vault    | MVP에서 미지원 (1개만)                      |
| 템플릿        | raw Markdown 자유 편집                      |
