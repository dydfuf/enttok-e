# Local RAG 구현 리서치 (SQLite Vector Search / Embedding / 한국어 / GraphRAG)

- 작성일: 2025-12-19
- 근거 문서: `docs/report.md`, `docs/my-spec/research.md`
- 레퍼런스 코드: `KIRA_REFERENCE/` (Electron 런처 + 로컬 Python 서버)

---

## 1) 레퍼런스(KIRA_REFERENCE)가 “로컬 컨텍스트”를 다루는 방식

`docs/report.md` 기준으로 레퍼런스는 **Electron 데스크톱 앱이 로컬 Python 서버를 프로세스로 실행/관리**하고, Python 서버가 Slack 이벤트를 받아 **큐/워커 → 에이전트들(SimpleChat/Operator/Memory 등)**로 처리합니다.

핵심 포인트는 “RAG”라는 이름을 쓰진 않지만, 이미 아래 형태의 **로컬 지식 저장/검색(=컨텍스트 주입)**이 구현되어 있다는 점입니다.

### 1.1 Electron ↔ Python 런타임 구조(요약)

- Electron main: 설정 파일 관리 + Python(uv) 서버 스폰/종료 + 로그 스트리밍
- Python 서버: Slack socket mode 이벤트 처리 + 작업 큐(채널/오케스트레이터/메모리) + 스케줄러

이 구조는 `docs/my-spec/research.md`에서 제안한 “Electron(UI) + 로컬 Python 백엔드(수집/인덱싱/검색/AI)” 패턴과 동일 계열입니다.

### 1.2 레퍼런스의 Memory(메모리) 저장/검색은 “파일 기반 하이브리드 인덱스”

레퍼런스의 Memory 시스템은 **SQLite 벡터 인덱스가 아니라**, 아래처럼 **Markdown 파일 + YAML frontmatter + index.md 갱신**으로 작동합니다.

- 저장 스킬: `KIRA_REFERENCE/.claude/skills/slack-memory-store/`
  - `scripts/add_memory.py`: content/metadata 기반 자동 분류 → `memories/` 하위 폴더에 Markdown 저장
  - `scripts/update_index.py`: `memories/index.md`를 통계/최근 업데이트/네비게이션 형태로 재생성
- 조회 스킬: `KIRA_REFERENCE/.claude/skills/slack-memory-retrieval/`
  - “항상 index.md를 먼저 읽고” → 채널/유저/프로젝트 폴더를 따라가며 필요한 파일만 선택 로드

실제로 에이전트 레벨에서는:

- `KIRA_REFERENCE/app/cc_agents/memory_manager/agent.py`
  - LLM(Claude)에게 `slack-memory-store` 스킬로 메모리를 저장하도록 지시
- `KIRA_REFERENCE/app/cc_agents/memory_retriever/agent.py`
  - LLM(Claude)에게 `slack-memory-retrieval` 스킬로 메모리를 찾아오도록 지시

#### 장점

- 저장 포맷이 사람이 읽고 편집 가능한 Markdown이라 디버깅/백업이 쉬움
- “채널/유저/프로젝트/결정” 같은 정보 구조가 명시적으로 남아 LLM이 탐색하기 쉬움

#### 한계(로컬 RAG 관점)

- 검색이 **LLM의 파일 탐색 능력(=프롬프트 기반)**에 크게 의존
- 데이터가 커지면 “무엇을 읽어야 하는지” 결정 비용이 증가 (토큰/시간)
- 의미 검색(semantic search) / 하이브리드 검색(FTS+벡터) / rerank 같은 고급 검색이 없음

즉, 레퍼런스의 Memory는 “로컬 지식베이스”로 매우 좋은 출발점이지만, **local RAG를 하려면 ‘검색 레이어’를 한 단계 더(벡터/FTS) 추가**하는 게 핵심입니다.

---

## 2) 내 애플리케이션에 Local RAG를 붙이는 권장 구조

`docs/my-spec/research.md` 방향(로컬 Python 백엔드 + SQLite 인덱스) 그대로, 아래처럼 설계하는 것을 추천합니다.

### 2.1 구성요소(권장)

- **Corpus(원본 데이터)**
  - (권장) Markdown/텍스트 파일 기반(노트/메모/업무 로그)
  - 커넥터 데이터(GitHub/Slack/Jira 등)는 raw JSON 캐시 + 정규화 텍스트를 함께 보관
- **Index(검색 인덱스)**
  - 키워드 검색: SQLite FTS5
  - 의미 검색: SQLite + 벡터 검색 확장(sqlite-vec 또는 sqlite-vss)
- **Embedding 생성기**
  - 로컬: Sentence-Transformers 또는 Ollama embeddings
- **Query 파이프라인**
  - (A) Query → 임베딩 → TopK 벡터검색
  - (B) Query → FTS5 검색
  - (C) 결과 합치기(hybrid) + (선택) rerank
  - (D) LLM에 컨텍스트와 함께 질의

### 2.2 인덱싱(ingestion) 파이프라인 최소 요구사항

- 파일/데이터 변경 감지(파일 mtime, 해시)
- chunking(문서 → 청크)
- embedding(model/version) 단위로 재인덱싱 가능
- 배치 처리(백그라운드 큐/스케줄러)

레퍼런스처럼 “작업 큐 + 스케줄러” 계층을 두면:

- 동기화/인덱싱이 UI를 막지 않고
- 대규모 재인덱싱도 안정적으로 수행됩니다.

### 2.3 SQLite 스키마 예시(권장)

아래는 “문서/청크/키워드(FTS)/벡터”를 **SQLite 1개 파일**로 운영하는 최소 스키마 예시입니다.

핵심 설계 원칙:

- **원본(text)과 메타데이터는 일반 테이블**에 저장(디버깅/필터링/조인 용이)
- **FTS5는 별도 테이블**로 운영(인덱스 재생성/업데이트를 ingestion 단계에서 통제)
- **벡터 인덱스는 vec0(vss0) 가상 테이블**로 운영(검색만 담당)

```sql
-- 문서(원본) 메타
create table if not exists rag_documents (
  doc_id integer primary key,
  source text not null,          -- 'vault', 'github', 'slack', ...
  uri text not null,             -- 파일 경로/URL/외부 id
  title text,
  content_hash text not null,    -- 내용 해시(증분 인덱싱용)
  updated_at text not null,
  metadata_json text
);

-- 검색 단위(청크)
create table if not exists rag_chunks (
  chunk_id integer primary key,
  doc_id integer not null references rag_documents(doc_id),
  chunk_index integer not null,
  text text not null,
  start_char integer,
  end_char integer,
  token_count integer,
  metadata_json text
);

-- 키워드 검색 인덱스(FTS5)
-- * contentless 방식으로 단순화: ingestion에서 직접 upsert/rebuild
create virtual table if not exists rag_chunks_fts using fts5(
  chunk_id unindexed,
  text,
  tokenize='unicode61'
);

-- 벡터 검색 인덱스(sqlite-vec)
-- * embedding 차원은 모델에 맞춰야 함(예: 384/768/1024)
create virtual table if not exists rag_vec_chunks using vec0(
  chunk_id integer primary key,
  embedding float[384] distance_metric=cosine
);
```

### 2.4 Query 파이프라인(하이브리드 검색) 예시

한국어 포함 실사용에서는 “벡터 검색 1개만”보다 **벡터 + FTS를 섞는 하이브리드**가 안정적입니다.

- **벡터 검색**: 유사 표현/의미 검색에 강함
- **FTS 검색**: 이슈키/코드/고유명사/정확 매칭에 강함

벡터 TopK:

```sql
select chunk_id, distance
from rag_vec_chunks
where embedding match :query_embedding
  and k = 20;
```

FTS TopK:

```sql
select chunk_id, bm25(rag_chunks_fts) as score
from rag_chunks_fts
where rag_chunks_fts match :query
order by score
limit 20;
```

그리고 애플리케이션 레이어에서:

- 두 결과를 합치고(중복 제거)
- 필요하면 recency(최근 문서 가중치), source(예: 내 노트 vs 외부 로그) 가중치를 곱한 뒤
- 최종 TopN 청크를 LLM 컨텍스트로 전달

### 2.5 로컬 배포/런타임 주의사항(확장 로딩)

SQLite 벡터 확장은 보통 **로드 가능한 확장(loadable extension)**이라서:

- Python에서 `enable_load_extension(True)`가 가능한 sqlite 빌드가 필요합니다.
- 로드 후에는 보안상 `enable_load_extension(False)`로 다시 닫는 패턴을 권장합니다.

레퍼런스(KIRA_REFERENCE)처럼 “Electron이 Python 런타임을 스폰”하는 구조라면, 패키징 시:

- 확장 바이너리(`.dylib/.so/.dll`)를 앱 리소스에 포함
- Python이 그 경로를 찾아 로드

까지를 설치/업데이트 전략에 포함해야 합니다.

---

## 3) SQLite로 Vector Search가 가능한가?

결론: **가능합니다.** 다만 SQLite 자체에 벡터 인덱스가 내장된 건 아니고, 일반적으로는 **로드 가능한 SQLite 확장(extension)**을 사용합니다.

여기서는 로컬 앱(데스크톱)에서 실전적으로 많이 쓰이는 2가지를 비교합니다.

### 3.1 선택지 A: sqlite-vec (pure C, 가볍고 배포에 유리)

- 라이브러리: `/asg017/sqlite-vec`
- 특징
  - pure C 기반 벡터 검색 확장
  - `vec0` 가상 테이블을 만들어 벡터를 저장/검색
  - SQLite가 돌아가는 환경이면 어디서든(상대적으로) 배포가 쉬움

Python에서 로드 예시:

```python
import sqlite3
import sqlite_vec

db = sqlite3.connect(":memory:")
db.enable_load_extension(True)
sqlite_vec.load(db)
db.enable_load_extension(False)

vec_version, = db.execute("select vec_version()").fetchone()
print(f"vec_version={vec_version}")
```

`vec0` 테이블 생성/검색 예시:

```sql
create virtual table vec_chunks using vec0(
  chunk_id integer primary key,
  contents_embedding float[768] distance_metric=cosine
);

select chunk_id, distance
from vec_chunks
where contents_embedding match :query
  and k = 10;
```

Python에서 float list를 compact BLOB로 serialize하는 예시:

```python
from sqlite_vec import serialize_float32

embedding = [0.1, 0.2, 0.3, 0.4]
db.execute('select vec_length(?)', [serialize_float32(embedding)])
```

또한 sqlite-vec는 **벡터 검색 조건과 일반 WHERE 필터를 함께 사용**할 수 있습니다(메타데이터 컬럼을 vec0 테이블에 함께 두는 방식).

```sql
select *
from vec_movies
where synopsis_embedding match '[...]'
  and k = 5
  and genre = 'scifi'
  and mean_rating > 3.5;
```

#### 추천 상황

- 데스크톱 앱에 번들로 넣고 싶은 경우(가벼운 확장 선호)
- 수십만 단위 이하의 청크에서 충분히 빠른 검색이 필요

### 3.2 선택지 B: sqlite-vss (Faiss 기반, 성능/기능은 강하지만 의존성이 큼)

- 라이브러리: `/asg017/sqlite-vss`
- 특징
  - Faiss 기반으로 vss0 테이블에서 빠른 KNN 검색
  - 인덱스 factory/metric_type 등 튜닝 가능

Python에서 로드 예시:

```python
import sqlite3
import sqlite_vss

db = sqlite3.connect(':memory:')
db.enable_load_extension(True)
sqlite_vss.load(db)
db.enable_load_extension(False)

version, = db.execute('select vss_version()').fetchone()
print(version)
```

테이블 생성/검색 예시:

```sql
create virtual table vss_articles using vss0(
  headline_embedding(384)
);

select rowid, distance
from vss_articles
where vss_search(headline_embedding, json('[0.1, 0.2, ...]'))
limit 20;
```

#### 추천 상황

- 데이터가 크고(수십만~수백만), 검색 성능/정확도가 매우 중요한 경우
- 플랫폼별 바이너리/의존성 관리 비용을 감당할 수 있는 경우

### 3.3 결론(권장)

- **MVP**: sqlite-vec 추천 (단순/가벼움/배포 용이)
- **대규모 + 고성능 요구**: sqlite-vss 검토

추가로, “SQLite만 쓰되 확장 로딩이 부담”이면:

- (대안) **LanceDB/Chroma 같은 로컬 벡터DB**를 Python 프로세스에서 운영
- (대안) 임베딩을 SQLite에 저장하고, 검색은 Python에서 brute-force(소량일 때만)

을 선택지로 둘 수 있습니다.

---

## 4) 로컬에서 Embedding 생성이 가능한가?

결론: **가능합니다.** 로컬 RAG의 핵심은 “임베딩 생성기”를 로컬에서 돌릴 수 있느냐인데, 아래 2가지가 실전적으로 가장 단순합니다.

### 4.1 선택지 A: Sentence-Transformers (로컬 파이썬 임베딩)

- 라이브러리: `/huggingface/sentence-transformers`
- 장점: GPU/CPU 선택 가능, 다양한 오픈소스 임베딩 모델 지원

기본 예시:

```python
from sentence_transformers import SentenceTransformer

model = SentenceTransformer("all-MiniLM-L6-v2")
embeddings = model.encode(["문장1", "문장2"])
print(embeddings.shape)
```

### 4.2 선택지 B: Ollama embeddings (로컬 서버 기반)

- 라이브러리(파이썬): `/ollama/ollama-python`
- 장점: “로컬 모델 런타임”을 앱 밖 서비스로 분리 가능(업데이트/교체 쉬움)

예시:

```python
from ollama import embed

response = embed(
    model='gemma3',
    input='Hello, world!'
)
vec = response.embeddings[0]
```

---

## 5) 한국어 처리는 어떻게 할까?

한국어는 “임베딩(semantic)”과 “키워드 검색(FTS)”에서 각각 포인트가 다릅니다.

### 5.1 임베딩 모델 선택(가장 중요)

- 한국어 포함 다국어 검색을 목표로 하면 **multilingual embedding 모델**을 쓰는 게 정석입니다.
- 후보 예시(리서치)
  - BGE-M3 계열: 100+ 언어 지원/긴 문서 처리(최대 8k 토큰) 특징
  - 한국어 튜닝된 파생 모델(예: bge-m3-korean 같은 파인튜닝 모델)도 존재

권장 전략:

- 1차: 다국어 임베딩 모델 1개로 통일(운영 단순)
- 2차(품질 필요 시): “한국어 전용/튜닝 모델”을 옵션으로 제공

### 5.2 청킹(chunking) 전략

- 한국어는 공백이 존재하지만 조사/어미로 인해 “키워드 정확 매칭”이 약해질 수 있으니, RAG에서는 청킹이 더 중요합니다.
- 추천
  - 문단/헤딩 기반(마크다운 구조 활용)
  - 너무 길면 문장 단위 분리 후 N문장 단위로 합치기
  - 청크 오버랩(예: 10~20%)으로 문맥 끊김 완화

### 5.3 키워드 검색(FTS5)에서의 한국어

- SQLite FTS5 기본 토크나이저(unicode61)는 공백 중심이라 “한국어 형태소 수준” 검색엔 한계가 있습니다.
- 하지만 로컬 RAG에서는 보통 아래 하이브리드로 해결합니다.
  - 정확 키워드(이슈키, 코드, URL, 고유명사): FTS5가 강함
  - 의미/유사 표현: 벡터 검색이 강함

추가 개선 옵션:

- FTS5 trigram 토크나이저(부분문자열 검색 강화) 또는 ICU 기반 토크나이저 확장 사용
- 단, 토크나이저 확장은 플랫폼별 빌드/배포 이슈가 생길 수 있어 MVP에선 과투자 가능

### 5.4 “하이브리드 검색” 권장 방식

- 결과적으로 한국어 품질을 빠르게 올리는 방법은:
  - 벡터 TopK + FTS TopK를 합치고
  - 중복 제거 후
  - (선택) rerank(교차 인코더/LLM rerank)로 정렬

---

## 6) 로컬 GraphRAG 구현 가능 여부(리서치)

결론: **가능은 하지만, ‘MVP에서 바로’는 비추천**입니다.

### 6.1 Microsoft GraphRAG(오픈소스)로 로컬 실행

- 라이브러리: `/microsoft/graphrag`
- GraphRAG는 텍스트에서 엔티티/관계를 추출해 그래프를 만들고, 커뮤니티 요약을 생성한 뒤,
  - global search(전체 테마)
  - local search(특정 엔티티 중심)
  - drift search(혼합)
  등의 방식으로 질의합니다.

CLI 흐름(요약):

```bash
graphrag init --root ./myproject

graphrag index --root ./myproject

graphrag query --root ./myproject --method global --query "What are the top themes?"

graphrag query --root ./myproject --method local --query "Who is X and relationships?"
```

#### 로컬 LLM로 가능한가?

GraphRAG는 기본적으로 OpenAI SDK 기반(OpenAI-compliant endpoint 필요)이며,
- ollama 같은 프록시(OpenAI-compatible API) 사용이 가능하다고 문서에서 언급합니다.
- 다만 GraphRAG는 **구조화된 출력(JSON schema 등)**을 안정적으로 반환해야 하는 단계가 있어,
  - 로컬 모델이 포맷을 자주 깨면 파이프라인이 불안정해질 수 있습니다.

즉, “완전 오프라인 GraphRAG”는 가능하지만:

- 모델 품질/포맷 안정성
- 인덱싱 시간(관계 추출 + 커뮤니티 요약)
- 디버깅 난이도

측면에서 비용이 큽니다.

### 6.2 현실적인 제안: 단계적 GraphRAG

1) 먼저 **일반 RAG(벡터+FTS)**로 충분한 품질을 확보
2) 그 다음 아래 중 하나로 확장

- (A) Microsoft GraphRAG를 별도 “고급 인덱서”로 붙이기
  - 장점: 검증된 파이프라인/검색 모드
  - 단점: 구성/자원/LLM 품질 요구가 큼

- (B) Lightweight Graph Layer(자체 구현)로 시작
  - 엔티티/키워드 노드를 만들고
  - co-occurrence(같은 청크/같은 노트에서 함께 등장) 기반 edge를 만들고
  - SQLite에 nodes/edges 저장 + 노드/청크는 벡터 인덱스
  - 질의 시: (1) 엔티티 후보 → (2) 1~2 hop 확장 → (3) 관련 청크 수집

(B)는 Microsoft GraphRAG의 “전부”는 아니지만, 로컬앱에서는 비용 대비 효과가 좋고 점진적으로 발전시키기 쉽습니다.

---

## 7) 추천 실행 계획(MVP → 확장)

### Phase 1: Local RAG(MVP)

- Corpus: 로컬 파일(노트/문서) + 커넥터 1개(GitHub 등)
- Index: SQLite + FTS5 + sqlite-vec
- Embedding: Sentence-Transformers(또는 Ollama embeddings)
- Query: hybrid(벡터+FTS) + 출처 링크 포함

### Phase 2: 품질/성능 고도화

- 증분 인덱싱(파일 해시/모델 버전/청킹 버전)
- rerank(선택)
- “오늘/이번주/프로젝트” 같은 필터를 SQL로 먼저 좁히고 벡터검색

### Phase 3: GraphRAG(선택)

- (권장) Lightweight graph부터 시작
- 이후 필요하면 Microsoft GraphRAG를 별도 인덱서로 추가

---

## 8) 한 줄 결론

- 레퍼런스는 이미 “로컬 지식 저장/탐색(파일 기반 메모리)” 패턴이 구현되어 있고,
- 여기에 **SQLite(Fts5) + 벡터 확장(sqlite-vec 또는 sqlite-vss) + 로컬 임베딩**을 얹으면,
  “온디바이스 local RAG”를 현실적인 비용으로 구현할 수 있습니다.
- GraphRAG는 로컬 구현이 가능하나, MVP에서는 일반 RAG로 시작한 뒤 단계적으로 올리는 것을 추천합니다.
