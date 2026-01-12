# Claude-Mem 레포지토리 분석

## 메모리 그래프화, 검색 및 인덱싱 기능 중심 분석

---

## 1. 프로젝트 개요

**Claude-Mem**은 Claude Code 플러그인으로, 코딩 세션 중 Claude가 수행하는 모든 작업을 자동으로 캡처하고, AI(Claude Agent SDK)를 사용하여 압축한 후, 향후 세션에 관련 컨텍스트를 주입하는 **지속적 메모리 시스템**입니다.

### 핵심 특징
- 🧠 **Persistent Memory**: 세션 간 컨텍스트 유지
- 🔍 **Hybrid Search**: SQLite FTS5 + ChromaDB 벡터 검색
- 📊 **Progressive Disclosure**: 토큰 효율적인 3-layer 검색 워크플로우
- 🔗 **MCP Tools**: 4개의 검색 도구 제공

---

## 2. 아키텍처 개요

### 2.1 핵심 컴포넌트

```
┌─────────────────────────────────────────────────────────────┐
│                    CLAUDE CODE SESSION                       │
│  SessionStart → UserPromptSubmit → Tool Use → Stop          │
│       ↓              ↓               ↓          ↓           │
│    [Hooks]       [Hooks]         [Hooks]    [Hooks]         │
└─────────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────────┐
│                   CLAUDE-MEM SYSTEM                          │
│                                                              │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Worker       │  │ SQLite DB    │  │ ChromaDB     │       │
│  │ Service      │→ │ + FTS5       │← │ Vectors      │       │
│  │ (port 37777) │  │              │  │              │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 기술 스택

| Layer | Technology |
|-------|------------|
| Language | TypeScript (ES2022) |
| Runtime | Node.js 18+, Bun |
| Database | SQLite 3 (bun:sqlite driver) |
| Vector Store | ChromaDB |
| HTTP Server | Express.js 4.18 |
| Real-time | Server-Sent Events (SSE) |
| AI SDK | @anthropic-ai/claude-agent-sdk |

---

## 3. 데이터 저장 구조

### 3.1 SQLite 데이터베이스 스키마

위치: `~/.claude-mem/claude-mem.db`

#### 주요 테이블

**observations (관찰 기록)**
```sql
CREATE TABLE observations (
  id INTEGER PRIMARY KEY,
  title TEXT,
  narrative TEXT,
  facts TEXT,           -- JSON 배열
  concepts TEXT,        -- JSON 배열
  files TEXT,           -- JSON 배열
  type TEXT,            -- bugfix, feature, decision 등
  projectPath TEXT,
  createdAt INTEGER
);
```

**sdk_sessions (세션 정보)**
```sql
SELECT session_id, project, created_at, status 
FROM sdk_sessions;
```

**session_summaries (세션 요약)**
```sql
SELECT session_id, request, completed, learned 
FROM session_summaries;
```

**user_prompts (사용자 프롬프트)**
```sql
CREATE TABLE user_prompts (
  id INTEGER PRIMARY KEY,
  claude_session_id TEXT,
  sdk_session_id TEXT,
  project TEXT,
  prompt_number INTEGER,
  prompt_text TEXT,
  created_at_epoch INTEGER
);
```

**pending_messages (비동기 처리 큐)**
```sql
CREATE TABLE pending_messages (
  id INTEGER PRIMARY KEY,
  session_db_id INTEGER,
  claude_session_id TEXT,
  message_type TEXT,     -- 'observation' | 'summarize'
  status TEXT,           -- 'pending' | 'processing' | 'processed' | 'failed'
  retry_count INTEGER,
  created_at_epoch INTEGER
);
```

---

## 4. 검색 아키텍처 (하이브리드 검색)

### 4.1 이중 검색 시스템

Claude-Mem v5.0.0부터 **하이브리드 검색 아키텍처**를 도입했습니다:

```
┌────────────────────────────────────────────────────────────┐
│                      User Query                             │
│               "authentication bug"                          │
└────────────────────────────────────────────────────────────┘
                           ↓
        ┌─────────────────┴─────────────────┐
        ↓                                   ↓
┌──────────────────────┐      ┌──────────────────────┐
│   Chroma Semantic    │      │    SQLite FTS5       │
│   Vector Similarity  │      │   Keyword Search     │
│                      │      │                      │
│ Finds conceptually   │      │ Finds exact/fuzzy    │
│ similar observations │      │ keyword matches      │
└──────────────────────┘      └──────────────────────┘
        ↓                                   ↓
        └─────────────────┬─────────────────┘
                          ↓
            ┌─────────────────────────────┐
            │      Merge Results          │
            │  - Deduplicate by ID        │
            │  - Sort by relevance        │
            │  - Filter by 90-day window  │
            └─────────────────────────────┘
                          ↓
            ┌─────────────────────────────┐
            │    Return Top Matches       │
            │  Semantic + Keyword combined│
            └─────────────────────────────┘
```

### 4.2 SQLite FTS5 (Full-Text Search)

**FTS5 가상 테이블 구성:**
- `observations_fts`
- `session_summaries_fts`
- `user_prompts_fts`

**FTS5 검색 문법 지원:**
```sql
-- Boolean 검색
query="authentication AND JWT"    -- 두 용어 모두 포함
query="OAuth OR JWT"              -- 둘 중 하나 포함
query="security NOT deprecated"   -- deprecated 제외

-- 정확한 구문 검색
query='"database migration"'      -- 정확한 구문

-- 필드별 검색
query="title:authentication"      -- 제목에서만 검색
query="content:database"          -- 내용에서만 검색
query="concepts:security"         -- concepts 필드에서만 검색
```

**FTS5 인덱스 재구축:**
```sql
INSERT INTO observations_fts(observations_fts) VALUES('rebuild');
INSERT INTO session_summaries_fts(session_summaries_fts) VALUES('rebuild');
INSERT INTO user_prompts_fts(user_prompts_fts) VALUES('rebuild');
```

### 4.3 ChromaDB 벡터 검색

**ChromaSync 서비스** (`src/services/sync/ChromaSync.ts`)

#### 동기화 시점
1. **Session Summary**: 세션 완료 후 새 관찰 동기화
2. **Worker Startup**: 초기화 시 미동기화 관찰 확인
3. **Manual Trigger**: 개발용 내부 API

#### 벡터 임베딩 저장 구조
```javascript
// SQLite (원본 데이터)
{
  id: 12345,
  title: "Authentication flow",
  narrative: "Implemented...",
  type: "feature",
  projectPath: "claude-mem"
}

// ChromaDB (벡터 임베딩)
{
  ids: ["obs_12345"],
  embeddings: [[0.123, -0.456, ...]], // 384차원 벡터
  documents: ["Title: Authentication flow\nNarrative: Implemented..."],
  metadatas: [{
    type: "feature",
    project: "claude-mem",
    timestamp: 1698765432000,
    concepts: "pattern,architecture"
  }]
}
```

#### 시맨틱 유사도 예시
```javascript
// 텍스트 → 벡터 변환
"user authentication" → [0.12, -0.34, 0.56, ..., 0.78]
"login system"        → [0.15, -0.32, 0.54, ..., 0.81]  // 유사!
"database schema"     → [-0.45, 0.67, -0.23, ..., 0.12] // 다름
```

#### Chroma 쿼리 예시
```javascript
// 타입 및 프로젝트로 필터링
results = await sync.query({
  queryTexts: ["API design"],
  where: {
    $and: [
      { type: { $in: ["decision", "feature"] } },
      { project: "claude-mem" }
    ]
  }
});

// 최근 관찰만 검색 (30일)
results = await sync.query({
  queryTexts: ["database schema"],
  where: {
    timestamp: { $gte: Date.now() - 30_days }
  }
});
```

---

## 5. MCP 검색 도구 (3-Layer Progressive Disclosure)

### 5.1 Progressive Disclosure 개념

기존 RAG 방식 대비 **~10x 토큰 절약**:

```
# ❌ 비효율적 방식: 20개 전체 관찰 가져오기
get_observations(ids=[1,2,3,...,20])  # 10,000-20,000 tokens!

# ✅ 효율적 방식: 3-Layer Workflow
Step 1: search(query="bug fix", limit=20)        # ~1,000 tokens (인덱스)
Step 2: 결과 검토 후 관련 ID 선별
Step 3: get_observations(ids=[5, 12, 18])        # ~1,500-3,000 tokens
# 총: 2,500-4,000 tokens (50-80% 절약!)
```

### 5.2 4가지 MCP 도구

#### 1. `search` - 메모리 인덱스 검색
```javascript
search(
  query="authentication bug",
  type="bugfix",
  limit=10
)
// 반환: ID, 제목, 날짜, 타입이 포함된 압축 테이블
// 비용: 결과당 ~50-100 tokens
```

#### 2. `timeline` - 시간순 컨텍스트 조회
```javascript
timeline(
  anchor=123,           // 특정 관찰 ID 기준
  depth_before=10,
  depth_after=10
)
// 반환: 해당 관찰 전후 시간순 컨텍스트
```

#### 3. `get_observations` - 상세 정보 가져오기
```javascript
get_observations(
  ids=[123, 456, 789]  // 항상 배치로 요청
)
// 반환: 전체 narrative, facts, concepts 포함
// 비용: 결과당 ~500-1,000 tokens
```

#### 4. `__IMPORTANT` - 워크플로우 문서
- Claude에게 항상 표시되는 사용 가이드

### 5.3 실제 사용 예시

```javascript
// Step 1: 인덱스 검색
search(query="authentication bug", type="bugfix", limit=10)

// Step 2: 결과 검토 후 관련 ID 식별 (예: #123, #456)

// Step 3: 상세 정보 가져오기
get_observations(ids=[123, 456])
```

---

## 6. HTTP API 엔드포인트

Worker Service는 `localhost:37777`에서 10개의 검색 API 제공:

### 6.1 검색 엔드포인트

| Endpoint | 설명 |
|----------|------|
| `GET /api/search?query=...&format=index&limit=10` | 메모리 검색 |
| `GET /api/observations?limit=50&offset=0` | 관찰 목록 |
| `GET /api/observation/:id` | 단일 관찰 상세 |
| `GET /api/observations/batch?ids=1,2,3` | 배치 관찰 조회 |
| `GET /api/sessions` | 세션 목록 |
| `GET /api/session/:id` | 세션 상세 |
| `GET /api/summaries` | 요약 목록 |
| `GET /api/prompts` | 프롬프트 목록 |
| `GET /api/stats` | 통계 정보 |
| `GET /api/projects` | 프로젝트 목록 |

### 6.2 API 응답 예시

**검색 결과:**
```json
{
  "observations": [{
    "id": 123,
    "title": "Fix authentication bug",
    "type": "bugfix",
    "narrative": "...",
    "created_at": "2025-11-06T10:30:00Z"
  }],
  "total": 500,
  "hasMore": true
}
```

**통계 정보:**
```json
{
  "worker": {
    "version": "9.0.0",
    "uptime": 12345,
    "activeSessions": 2,
    "sseClients": 1,
    "port": 37777
  },
  "database": {
    "path": "~/.claude-mem/claude-mem.db",
    "size": 1048576,
    "observations": 500,
    "sessions": 50,
    "summaries": 25
  }
}
```

---

## 7. 데이터 흐름

### 7.1 Memory Pipeline
```
Hook (stdin) → Database → Worker Service → SDK Processor → Database → Next Session
```

1. **Input**: Claude Code가 hook에 도구 실행 데이터 전달 (stdin)
2. **Storage**: Hook이 SQLite에 관찰 기록
3. **Processing**: Worker 서비스가 SDK로 처리
4. **Output**: 처리된 요약을 DB에 저장
5. **Retrieval**: 다음 세션의 context hook이 요약 조회

### 7.2 Search Pipeline
```
User Query → MCP Tools → HTTP API → SessionSearch → FTS5/Chroma → Results → Claude
```

---

## 8. 인덱싱 전략

### 8.1 SQLite 인덱스 최적화

```sql
-- 빠름: (project, created_at_epoch) 인덱스 사용
SELECT * FROM session_summaries 
WHERE project = ? 
ORDER BY created_at_epoch DESC 
LIMIT 10;

-- 빠름: claude_session_id 인덱스 사용
SELECT * FROM sdk_sessions 
WHERE claude_session_id = ? 
LIMIT 1;

-- 빠름: FTS5 full-text search
SELECT * FROM observations_fts 
WHERE observations_fts MATCH ? 
ORDER BY rank 
LIMIT 20;
```

### 8.2 Context Injection 설정

세션 시작 시 주입되는 관찰 수 제어:
```bash
CLAUDE_MEM_CONTEXT_OBSERVATIONS=50  # 기본값: 50개
```

---

## 9. 특수 기능

### 9.1 Endless Mode (Beta)

컨텍스트 윈도우 소진 문제 해결을 위한 **biomimetic 메모리 아키텍처**:

- **Working Memory**: 압축된 관찰 (~500 tokens each)
- **Archive Memory**: 전체 도구 출력 (디스크에 보존)

### 9.2 Privacy Control

```html
<private>민감한 내용</private>  <!-- 저장에서 제외 -->
<claude-mem-context>...</claude-mem-context>  <!-- 시스템 태그 -->
```

### 9.3 Folder Context Files (v9.0.0)

각 디렉토리에 자동 생성되는 `CLAUDE.md` 파일:
- 최근 개발 활동 타임라인
- 관찰 ID, 시간, 타입, 제목, 토큰 비용 표시

---

## 10. 결론 및 핵심 인사이트

### 10.1 메모리 그래프화 접근 방식

Claude-Mem은 **명시적인 그래프 데이터베이스를 사용하지 않고**, 대신:

1. **관계형 + FTS5**: SQLite의 관계형 구조와 FTS5 전문 검색
2. **벡터 임베딩**: ChromaDB로 시맨틱 유사성 검색
3. **시간 기반 연결**: 타임라인 쿼리로 시간순 관계 파악
4. **프로젝트/세션 기반 그룹화**: 메타데이터로 논리적 그룹화

### 10.2 검색/인덱싱의 핵심 설계 원칙

1. **Progressive Disclosure**: 토큰 효율성을 위한 3-layer 워크플로우
2. **Hybrid Search**: 키워드 매칭 + 시맨틱 유사성의 조합
3. **90일 창**: 최신성을 고려한 시간 필터링
4. **비동기 처리**: Hook은 빠르게, Worker가 백그라운드 처리

### 10.3 적용 가능한 패턴

- **개인화된 AI 메모리 시스템** 구축 시 참고
- **하이브리드 검색 아키텍처** 설계 시 활용
- **토큰 효율적인 RAG 시스템** 구현 시 적용