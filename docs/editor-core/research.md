# Editor Core 리서치

## 목표
- 컨텐츠 에디터 영역을 캡슐화해 마이그레이션 난이도를 낮춘다.
- 내부/외부 연결 인터페이스를 정리하고, 의존성을 줄이기 위한 분리 지점을 찾는다.

## 범위
- Frontend editor 모듈(React + CodeMirror)과 관련 컨텍스트, 이벤트, 라우팅 결합부.
- Electron/파일시스템/프로토콜 의존과 UI/테마 결합부.

## 결정된 방향
- 목표 에디터는 TipTap으로 확정되었으며, 에디터-중립적 캡슐화를 선행한다.
- 문서 포맷은 Markdown 문자열을 단일 소스로 유지한다.
- 현재 기능은 최대한 유지한다(기능 축소 없이 이전).
- 전면 교체를 전제로 하며, 이행 시점에 단일 에디터만 사용한다.
- Markdown 변환 정책은 정확성을 최우선으로 한다.
- 이미지/자산 저장 정책과 노트 링크 규칙은 현행을 유지한다.
- 전역 이벤트 기반 상호작용은 명시적 API로 치환한다.
- 이미지 붙여넣기는 현행처럼 즉시 자산 저장 후 삽입한다.
- 선택 범위는 `SelectionRange.kind`로 구분한다(CodeMirror: `markdown`, TipTap: `editor`).

## 현재 구조 요약
- 컨테이너: `electron-app/src/components/editor/EditorLayout.tsx`
- 코어 에디터: `electron-app/src/components/editor/LivePreviewEditor.tsx`
- 툴바: `electron-app/src/components/editor/EditorToolbar.tsx`
- 확장(라이브 프리뷰): `electron-app/src/components/editor/extensions/livePreview.ts`
- 컨텍스트: `electron-app/src/contexts/EditorContext.tsx`
- 사용처: `electron-app/src/routes/_app/notes/$noteId.tsx`, `electron-app/src/components/daily/DailyNotePage.tsx`

## 외부 인터페이스 (현재 공개 API)
### EditorLayout (컨테이너)
- `initialFilePath?: string`
- `vaultPath?: string | null`
- `hideToolbar?: boolean`
- `onDirtyChange?: (isDirty: boolean) => void`
- `onSaveRef?: React.MutableRefObject<(() => void) | null>`
- `className?: string`

### LivePreviewEditor (코어)
- `value: string`
- `onChange: (value: string) => void`
- `filePath?: string | null`
- `vaultPath?: string | null`
- `onSelectionChange?: (selection | null) => void`
- `onOpenNote?: (noteId: string) => void`
- `readOnly?: boolean`
- `placeholderText?: string`

### EditorContext (전역 공유)
- noteContent/notePath/selection 상태 공유
- `appendToNote`는 `EditorCommands.appendText` 호출로 연결
- `includeNoteContext`는 Assistant 사이드바 프롬프트에 사용
- `commands`를 공유해 외부 컴포넌트가 에디터 명령을 직접 호출할 수 있도록 한다

## 외부 의존성 맵
### 플랫폼/런타임
- Electron API 직접 호출: `getElectronAPI` / `requireElectronAPI`
  - 파일 읽기/쓰기/다이얼로그: `useFileSystem`
  - 이미지 붙여넣기 저장: `LivePreviewEditor`
  - 외부 링크 열기: `LivePreviewEditor`
- 커스텀 프로토콜 `vault://` 의존
  - `resolveAssetUrl` → Electron main 프로토콜 등록 필요

### 라우팅/네비게이션
- `EditorLayout`에서 `useNavigate` 사용 (노트 열기)
- `LivePreviewEditor`에서 `window.location.hash` fallback 사용

### 전역 이벤트/브라우저
- `suggestion:apply`, `editor:append` (CustomEvent)
- 키보드 단축키 (`Ctrl/Cmd+S`, `Ctrl/Cmd+O`)가 `useFileSystem`에서 전역 등록
- 테마 변경 감지: `document.documentElement` MutationObserver

### UI/알림
- `sonner` toast 의존
- shadcn/ui, lucide icon 사용 (Toolbar, 레이아웃)

### 파일 경로/자산
- `vaultPath`, `filePath` 기반 상대 경로 계산
- assets 폴더 설정 조회 (`getAssetsFolder`)
- 이미지 파일명 생성/저장 로직 내장

## 내부 결합(암묵적 계약)
- `LivePreviewEditor`가 `view.dom.dataset.filePath`에 경로 저장
  - `livePreview` 확장이 DOM dataset을 읽어 이미지 경로 resolve
- `EditorLayout`이 `useFileSystem`을 직접 포함
  - I/O, autosave, 단축키 처리까지 컨테이너에 결합
- 선택 영역 → `EditorContext`로 전파 → `AssistantSidebar`가 사용
  - 에디터-사이드바 간 명시적 인터페이스 부재

## 주요 데이터/이벤트 흐름
- 파일 로드: `EditorLayout` → `useFileSystem.loadFile` → `LivePreviewEditor.value`
- 입력 변경: `LivePreviewEditor.onChange` → `setContent` → dirty/auto-save
- 선택 영역: `LivePreviewEditor.onSelectionChange` → `EditorLayout` → `EditorContext`
- 제안 적용: `AssistantSidebar` → `suggestion:apply` 이벤트 → `EditorLayout`이 content append
- 이미지 붙여넣기: `LivePreviewEditor` → Electron API writeBinaryFile → markdown 삽입
- 링크 열기: `LivePreviewEditor` → `onOpenNote` or `window.location.hash` or `openExternal`

## 마이그레이션 관점에서의 결합 리스크
- Electron API 의존이 코어 에디터 내부에 존재 (이미지, 링크, 파일 I/O)
- `vault://` 프로토콜과 파일 경로 규칙이 UI 렌더링 레이어와 결합
- 전역 이벤트/컨텍스트 기반 통신으로 외부 인터페이스가 불명확
- 테마/DOM 접근이 명시적 props가 아니라 전역에 의존
- Markdown을 소스로 유지하기 위한 변환/호환 요구사항이 에디터 선택에 직접 영향

## TipTap 전환 고려사항
### 문서 모델
- TipTap은 내부적으로 ProseMirror JSON 문서 모델을 사용한다.
- Markdown을 단일 소스로 유지하려면, 로딩/저장 시 Markdown ↔ 문서 모델 변환 파이프라인이 필요하다.

### Markdown I/O 전략
- 입력(로드): Markdown 문자열 → TipTap 문서 모델로 파싱
- 출력(저장): TipTap 문서 모델 → Markdown 문자열로 직렬화
- 변환 과정에서 문법 손실이나 포맷 강제가 발생하지 않도록 변환 정책을 정의해야 한다.

### 기능 매핑 요구사항 (현행 기준)
- 기본 서식: 굵게/기울임/인라인 코드/취소선/헤딩/리스트/인용
- 체크박스(태스크 리스트)
- 링크: 외부 링크/노트 링크/위키 링크
- 이미지: 붙여넣기 및 자산 경로 계산
- 선택 컨텍스트: 선택 텍스트/범위 전달
- 읽기 전용 모드, placeholder, 다크모드 연동

### UX 차이 고려
- 현행: Markdown 원문을 편집하되 마커를 숨기는 "라이브 프리뷰" 스타일
- TipTap: WYSIWYG 편집 (원문 마커가 기본적으로 노출되지 않음)
- 전환 시 "원문 편집 모드" 필요 여부와 UX 기대치를 정리해야 한다.

### 이벤트/명령 매핑
- 현재 `EditorCommands`는 TipTap 커맨드 API로 매핑 필요
- `onSelectionChange`, `onUpdate` 이벤트는 TipTap 이벤트로 대체 가능
  - `editor:append`, `suggestion:apply`는 `EditorCommands.appendText`로 치환

### 호스트 의존 분리 유지
- Electron/파일 시스템/라우팅은 TipTap 영역 밖 어댑터에서 처리
- `EditorServices`, `EditorResolvers`를 통해 호스트 기능 주입

### TipTap 확장/기능 매핑 (초안)
- 기본 서식: StarterKit 계열 확장(굵게/기울임/헤딩/리스트/인용/히스토리)
- 체크박스: TaskList/TaskItem 확장
- 링크: Link 확장 + 위키 링크/노트 링크를 위한 커스텀 확장
- 이미지: Image 확장 + 붙여넣기/자산 저장을 위한 커스텀 플러그인
- Markdown I/O: Markdown 파서/직렬화 레이어(TBD)
- Placeholder: Placeholder 확장
- ReadOnly/Selection: TipTap editable/selection 이벤트로 대응

### TipTap 위키/노트 링크 확장 설계 (초안)
- 목표: `[[Wiki]]`와 `note:` 링크를 Markdown 포맷 그대로 유지
- 위키 링크 확장(wikiLink mark)
  - attrs: `title`, `alias?`, `heading?`, `raw?`
  - 표시 텍스트: `alias ?? title`
  - Markdown parse: `[[Title]]`, `[[Title|Alias]]`, `[[Title#Heading]]`, `[[Title#Heading|Alias]]`
  - Markdown serialize: 입력 포맷을 최대한 보존 (`raw`가 있으면 raw 사용)
  - 클릭 처리: `resolveNoteId(title)` -> `openNote(noteId)`
  - `resolveNoteId`는 기존 sanitize 규칙(별칭/헤딩/.md 제거)을 유지
- 노트 링크 확장(noteLink mark)
  - attrs: `title`
  - Markdown parse: `[text](note:Title)` 또는 `[text](note://Title)`
  - Markdown serialize: `note:` 스킴 유지
  - 클릭 처리: `resolveNoteId(title)` -> `openNote(noteId)`
- 외부 링크는 기존 Link 확장을 사용하고 `openExternal`로 위임

## 캡슐화를 위한 권장 경계
### 1) EditorCore (순수 UI/상태)
- 에디터 구현 세부사항을 숨기고 문서/선택 이벤트만 외부로 노출
- 현재는 CodeMirror 구현이지만, TipTap 구현으로 교체 가능하도록 계약 유지
- 플랫폼 의존을 제거한 최소 props 유지

### 2) EditorServices (플랫폼 어댑터)
- `openExternal(url)`
- `writeBinaryFile(path, base64)`
- `getAssetsFolder()`
- `notify({ type, message })`
- Electron/웹/테스트 환경별 구현 분리

### 3) EditorCommands (명시적 명령 버스)
- `focus`, `appendText`, `replaceSelection`, `insertText`, `insertImage`, `openLinkAtSelection`
- `EditorCommandResult`로 성공/실패 전달
- 기존 CustomEvent 기반을 명시적 API로 교체

### 4) Link/Asset Resolver 플러그인화
- wiki 링크 → noteId 변환은 호스트에 위임
- 자산 경로 해석 함수(`resolveAssetUrl`)를 주입받도록 변경

## 후보 인터페이스 스케치 (초안)
```ts
export type SelectionRange = {
  kind: "markdown" | "editor";
  from: number;
  to: number;
};

export type EditorSelection = {
  text: string;
  range: SelectionRange | null;
};

export type EditorChangeMeta = {
  source: "user" | "command" | "external";
};

export type EditorCommandResult = { success: boolean; error?: string };

export type EditorServices = {
  openExternal?: (url: string) => Promise<void> | void;
  writeBinaryFile?: (path: string, base64: string) => Promise<{ success: boolean; error?: string }>;
  getAssetsFolder?: () => Promise<string>;
  notify?: (payload: { type: "error" | "info"; message: string }) => void;
};

export type EditorResolvers = {
  resolveAssetUrl?: (notePath: string | null, assetPath: string) => string;
  resolveNoteId?: (raw: string) => string | null;
  openNote?: (noteId: string) => void;
};

export type EditorCommands = {
  focus: () => void;
  appendText: (text: string, options?: { ensureNewline?: boolean }) => EditorCommandResult;
  replaceSelection: (text: string, options?: { selectInserted?: boolean }) => EditorCommandResult;
  insertText: (text: string, options?: { at?: "cursor" | "start" | "end" }) => EditorCommandResult;
  insertImage: (payload: { src: string; alt?: string; title?: string }) => EditorCommandResult | Promise<EditorCommandResult>;
  openLinkAtSelection: () => EditorCommandResult;
};

export type EditorCoreProps = {
  value: string;
  readOnly?: boolean;
  placeholder?: string;
  className?: string;
  services?: EditorServices;
  resolvers?: EditorResolvers;
  onChange?: (markdown: string, meta: EditorChangeMeta) => void;
  onSelectionChange?: (selection: EditorSelection | null) => void;
  onFocus?: () => void;
  onBlur?: () => void;
  onReady?: (commands: EditorCommands) => void;
};
```

### EditorCore API (초안)
- `EditorCore`는 `value`를 Markdown string으로 받고 내부 문서 모델과 동기화한다.
- 외부는 `onReady(commands)`로 명시적 명령을 받아 사용한다.
- `onChange`는 Markdown string과 `EditorChangeMeta`를 기준으로 호출한다.
- `onSelectionChange`는 선택 텍스트와 `SelectionRange`를 전달한다.

### 호스트/컨텍스트 연결 구조 (초안)
- `EditorHost`(파일 I/O, 자동저장, 라우팅) -> `EditorCore`(TipTap) -> `EditorBridgeContext`
- `EditorBridgeContext`는 `commands`, `noteContent`, `notePath`, `selection`, `includeNoteContext`를 제공
- `AssistantSidebar`는 `commands.appendText`를 호출한다
- 전역 이벤트(`editor:append`, `suggestion:apply`)는 제거한다

### EditorBridgeContext 설계 (초안)
- `commands`: `EditorCommands | null`
- `noteContent`: string | null (Markdown)
- `notePath`: string | null
- `selection`: `EditorSelection | null`
- `includeNoteContext`: boolean
- 업데이트 주체:
  - `EditorHost`가 `noteContent`, `notePath` 갱신
  - `EditorCore`가 `selection` 갱신
  - `EditorHost`가 `onReady`로 받은 `commands`를 등록

### EditorHost 책임 분리 (초안)
- Markdown source of truth 보유 (`value`/`onChange` 제어)
- 파일 열기/저장/자동저장/dirty 상태 관리
- `noteContent`, `notePath`를 `EditorBridgeContext`에 반영
- `vaultPath`/`filePath`는 `EditorServices`/`EditorResolvers`에서 사용

## 리팩터링/마이그레이션 계획 (검토 포함)
### Phase 0: 에디터-중립 계약 확정
- Markdown I/O를 공식 계약으로 고정 (입력/출력은 string)
- 기능 요구사항 목록 확정 (링크, 이미지, 체크박스, 위키링크, 선택 컨텍스트)
- TipTap 적용 기준 정의 (Markdown 호환성, 확장성, React/Electron 적합성)

### Phase 1: 인터페이스 도입 (기능 보존)
- `EditorServices`, `EditorResolvers`, `EditorCommands` 타입 추가
- `LivePreviewEditor`에 서비스/리졸버 주입, Electron 의존 제거
- `EditorLayout`에서 전역 이벤트 사용을 점진적으로 제거

### Phase 2: 결합 축소
- `useFileSystem`과 `useAutoSave`를 호스트 레이어로 이동
- 단축키 핸들러를 호스트로 분리(에디터 단순화)
- 테마/다크모드 감지를 props 기반으로 변경

### Phase 3: 모듈 분리
- `editor-core/` 디렉터리(또는 패키지)로 이동
- Electron/Router/Context/Window 의존 제거 상태 확보
- 소비 측은 어댑터로 연결

### Phase 4: 전면 교체 준비
- 기존 CodeMirror 구현을 어댑터로 유지한 채 인터페이스 안정화
- TipTap POC로 동일 계약(입출력/명령/이벤트) 충족 검증
- 기능 매핑 표 작성 (기존 기능 ↔ TipTap 대응)
- Markdown round-trip 정확성 검증 (샘플 문서 수동 비교, 손실/포맷 변화 최소화)

### Phase 5: 검증/회귀 테스트
- 시나리오: 열기/저장/자동저장/링크 열기/이미지 붙여넣기/선택 컨텍스트/다크모드
- Electron 환경과 비-Electron 환경 각각 검증

## POC 검증 항목
- TipTap Markdown 파서/직렬화 후보 비교 및 정확성 기준 충족 여부
- 위키 링크/노트 링크 직렬화 보존 검증
- 원문 편집 모드 필요성 판단(사용성/정확성 기준)
- Markdown 직렬화 시 링크/이미지 포맷 원문 보존 여부

## 상세 설계 결과
### 1) EditorCommands 상세 스펙 확정
- 명령 목록(확정): `focus`, `appendText`, `replaceSelection`, `insertText`, `insertImage`, `openLinkAtSelection`
- 공통 규칙:
  - `readOnly`일 때는 편집 명령은 `success: false`로 반환하고 `notify`로 사유 전달
  - 문자열 입력이 비어 있거나 공백만 있으면 no-op 처리
  - 명령은 Electron/라우터를 직접 호출하지 않고 `EditorServices`/`EditorResolvers`를 사용
- `appendText` 규칙:
  - `text.trim()` 기준으로 동작 (현행 `suggestion:apply`와 동일)
  - 문서가 비어 있으면 `"{trimmed}\\n"` 삽입
  - 문서가 있으면 `"\\n\\n{trimmed}\\n"` 추가
  - 커서는 삽입된 텍스트 끝으로 이동
  - `ensureNewline`가 false면 줄바꿈 없이 raw 삽입(기본 true)
- `replaceSelection` 규칙:
  - 선택이 있으면 선택 영역을 교체
  - 선택이 없으면 `insertText`와 동일하게 동작
  - `selectInserted`가 true면 삽입 텍스트를 선택 상태로 유지
- `insertText` 규칙:
  - 기본 위치는 커서
  - `at: "start" | "end"`는 문서 시작/끝에 삽입
- `insertImage` 규칙:
  - `src`는 이미 저장/해석된 경로(상대 경로 또는 `vault://`)를 받는다
  - alt/title은 Markdown 직렬화 시 보존
  - 결과는 sync 또는 Promise 모두 허용(호스트 저장 로직과 분리)
- `openLinkAtSelection` 규칙:
  - 커서가 링크에 있을 때 `openNote` 또는 `openExternal` 호출
  - 링크 타입 판별은 TipTap 링크/위키 링크 확장 기준을 따른다

#### TipTap 명령 매핑 (초안)
- `focus` -> `editor.commands.focus()`
- `appendText` -> 문서 끝 위치에 `insertContentAt`로 삽입
- `replaceSelection` -> 현재 selection 범위를 `insertContent`로 교체
- `insertText` -> 위치 옵션에 따라 `insertContentAt` 사용
- `insertImage` -> `editor.commands.setImage({ src, alt, title })`
- `openLinkAtSelection` -> 현재 selection에서 `link`/`wikiLink`/`noteLink` attrs 조회

### 2) TipTap 이벤트 매핑 + 전역 이벤트 제거
- TipTap 이벤트 → 외부 콜백 매핑:
  - `onUpdate` → `onChange(markdown, { source })` 호출 (Markdown 직렬화)
  - `source`는 트랜잭션 메타로 `user`/`command`/`external` 구분
  - `onSelectionUpdate` → `onSelectionChange({ text, range })` (`range.kind`는 `editor`)
  - `onFocus`/`onBlur` → 필요 시 외부에 노출
- 링크 클릭 처리:
  - TipTap 링크/위키 링크 확장에서 클릭 핸들러 제공
  - `EditorResolvers.openNote` / `EditorServices.openExternal`로 위임
- 이미지 붙여넣기:
  - TipTap paste 훅에서 이미지 파일 감지
  - `EditorServices.getAssetsFolder` + `writeBinaryFile`로 저장 후 `insertImage`
- 전역 이벤트 제거:
  - `editor:append`, `suggestion:apply` → `EditorCommands.appendText` 호출로 교체
  - `EditorContext.appendToNote`는 명시적 명령 호출로 변경
  - `EditorLayout`의 window 이벤트 리스너 제거

### 3) TipTap POC 범위 확정
- 필수 확장: StarterKit, TaskList/TaskItem, Link, Image, Placeholder
- 커스텀 확장: 위키 링크/노트 링크 파서 및 serializer
- Markdown I/O 경로: Markdown 문자열 ↔ TipTap 문서 모델 변환 레이어 연결
- 성공 기준:
  - Markdown 입력/출력이 동일 문법을 유지
  - 링크 클릭 시 외부/노트 이동 동작
  - 이미지 붙여넣기 시 assets 경로 규칙 유지
  - 선택 텍스트 컨텍스트 전달
  - readOnly/placeholder/테마 연동 확인

### 4) 기능 매핑 표 작성
#### 기능 매핑 (초안)
| 기능 | 현행 구현 | TipTap 구현 | 호스트 의존/비고 |
| --- | --- | --- | --- |
| Markdown 편집/렌더 | CodeMirror + livePreview | TipTap WYSIWYG + Markdown serializer | UX 차이 발생 가능 |
| 기본 서식 | livePreview 데코레이션 | StarterKit | Markdown 직렬화 규칙 필요 |
| 체크박스 | 커스텀 위젯 | TaskList/TaskItem | 체크 상태 직렬화 보존 |
| 외부 링크 | 링크 파싱 + openExternal | Link 확장 + `openExternal` | `EditorServices` |
| 노트/위키 링크 | regex 파싱 + onOpenNote | 커스텀 위키 링크 확장 | `EditorResolvers` |
| 이미지 렌더 | `![]` + vault URL | Image 확장 | `resolveAssetUrl` |
| 이미지 붙여넣기 | paste 핸들러 + writeBinaryFile | paste 플러그인 + `insertImage` | `EditorServices` (즉시 저장) |
| 선택 컨텍스트 | CodeMirror selection | `onSelectionUpdate` | `SelectionRange.kind`로 구분 |
| 테마 연동 | MutationObserver | props 기반 클래스/테마 | 호스트에서 theme 전달 |
| 파일/저장 | `useFileSystem` | 호스트 레이어 유지 | 에디터 외부 |

## 준비 완료 범위
- EditorCommands/EditorCore/EditorBridge API 초안 확정
- TipTap 이벤트/명령 매핑 및 전역 이벤트 제거 경로 정의
- TipTap POC 범위와 성공 기준 정의
- 기능 매핑 표 작성 완료
