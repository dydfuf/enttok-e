# CLAUDE.md

이 파일은 Claude Code (claude.ai/code)가 이 저장소에서 작업할 때 참고하는 가이드입니다.

## 프로젝트 개요

엔똑이(enttok-E)는 AI 기반 제안 기능을 갖춘 로컬 우선 업무 일지 애플리케이션입니다. Electron(프론트엔드)과 Python/FastAPI(백엔드)로 구축된 데스크톱 앱입니다.

## 개발 명령어

### Electron 앱 (`electron-app/` 디렉토리)

```bash
# 개발 - Vite 개발 서버 + Electron 핫 리로드 실행
pnpm dev

# 빌드
pnpm build           # 전체 빌드 (vite + electron)
pnpm build:backend   # Python 의존성 설치 (uv sync)

# 배포용 패키징
pnpm package:mac     # macOS (dmg, zip)
pnpm package:win     # Windows (nsis, portable)
pnpm package:linux   # Linux (AppImage, deb)

# 코드 품질
pnpm lint            # Biome 린트
pnpm format          # Biome 포맷
pnpm check           # Biome 체크 (린트 + 포맷)
```

### 백엔드 (`backend/` 디렉토리)

```bash
# 백엔드 단독 실행 (보통 Electron이 자동으로 실행함)
uv run python -m app.main
```

## 아키텍처

```
┌─────────────────────────────────────────────────────┐
│ Electron Main Process (electron/)                   │
│ - 윈도우 관리, 파일 시스템, 볼트 저장소              │
│ - Python 백엔드를 서브프로세스로 실행                │
│ - 렌더러와 통신하는 IPC 핸들러                       │
└───────────────────────┬─────────────────────────────┘
                        │ IPC
                        ▼
┌─────────────────────────────────────────────────────┐
│ Electron Renderer (src/)                            │
│ - React 19 + TanStack Router (파일 기반 라우팅)     │
│ - shadcn/ui 컴포넌트 + Tailwind CSS                 │
│ - CodeMirror 마크다운 에디터                        │
└───────────────────────┬─────────────────────────────┘
                        │ HTTP
                        ▼
┌─────────────────────────────────────────────────────┐
│ Python FastAPI Backend (backend/app/)               │
│ - Claude AI 연동 (/claude/spawn, /claude/session)   │
│ - 작업 큐 관리 (/jobs)                              │
│ - WebSocket 이벤트 (/events)                        │
│ - SQLite 데이터베이스                               │
└─────────────────────────────────────────────────────┘
```

## 주요 디렉토리

- `electron-app/src/routes/` - 파일 기반 라우팅 (TanStack Router)
- `electron-app/src/components/ui/` - shadcn/ui 컴포넌트
- `electron-app/src/contexts/` - React 컨텍스트 (BackendContext, VaultContext, SidebarControlsContext)
- `electron-app/electron/` - Electron 메인 프로세스 코드
- `electron-app/electron/main/` - 모듈화된 메인 프로세스 (window, backend, ipc, runtime)
- `backend/app/api/` - FastAPI 라우트 핸들러
- `backend/app/services/` - 비즈니스 로직 (claude, jobs, sessions)
- `backend/app/db/` - SQLite 데이터베이스 레이어

## IPC 통신 패턴

렌더러는 `electron/preload.ts`에 정의된 IPC 채널을 통해 메인 프로세스와 통신합니다. 주요 네임스페이스:
- `file:` - 파일 작업 (read, write, open-dialog, save-dialog)
- `vault:` - 볼트/노트 관리
- `daily:` - 일일 노트 작업
- `store:` - 볼트 영속성을 위한 Electron Store
- `backend:` - 백엔드 생명주기 및 작업 관리
- `runtime:` - 런타임 의존성 확인
- `claude:` - Claude AI 작업

## 기술 스택

**프론트엔드:** TypeScript, React 19, TanStack Router, Tailwind CSS 4, shadcn/ui, CodeMirror 6, Zod, React Hook Form

**백엔드:** Python 3.11+, FastAPI, Uvicorn, SQLite, Pydantic

**도구:** pnpm (Node), uv (Python), Vite, Biome (포맷팅/린팅), electron-builder

## 코드 스타일

- Biome 사용 (탭 들여쓰기, 쌍따옴표)
- TypeScript strict 모드 활성화
- 경로 별칭: `@/*`는 `src/*`로 매핑
