# Bun Backend Migration

## Overview

이 문서는 enttok-E 프로젝트의 백엔드를 Python/FastAPI에서 Bun/TypeScript로 마이그레이션하기 위한 계획과 가이드를 제공합니다.

## Why Bun?

### 핵심 동기: 단일 실행 파일 컴파일

Bun의 `--compile` 플래그를 사용하면 TypeScript 백엔드를 **단일 실행 파일**로 컴파일할 수 있습니다. 이는 현재 Python 백엔드의 가장 큰 배포 문제를 해결합니다.

```bash
# 한 머신에서 모든 플랫폼용 바이너리 생성
bun build --compile --target=bun-darwin-arm64 ./src/index.ts -o backend-macos-arm
bun build --compile --target=bun-darwin-x64 ./src/index.ts -o backend-macos-intel
bun build --compile --target=bun-windows-x64 ./src/index.ts -o backend-windows.exe
bun build --compile --target=bun-linux-x64 ./src/index.ts -o backend-linux
```

### 현재 vs 목표

| 항목 | 현재 (Python) | 목표 (Bun) |
|-----|--------------|-----------|
| 런타임 의존성 | Python 3.11+ 필요 | 없음 (단일 바이너리) |
| 배포 방식 | Python 환경 번들링 | 단일 실행 파일 |
| 크로스 컴파일 | 불가능 | 지원 |
| 프론트엔드 언어 통일 | 불일치 (Python/TS) | 통일 (TypeScript) |
| 앱 용량 | ~100-150MB | ~50-100MB |

### 추가 장점

1. **성능**: HTTP 처리량 4배, WebSocket 7배 향상 (Node.js 대비)
2. **개발 경험**: TypeScript 네이티브 실행, 핫 리로드 내장
3. **타입 공유**: 프론트엔드와 백엔드 간 타입 정의 공유 가능
4. **생태계**: 2025년 12월 Anthropic 인수로 활발한 개발 진행 중

## Documents

| 문서 | 설명 |
|-----|------|
| [current-architecture.md](./current-architecture.md) | 현재 Python 백엔드 구조 분석 |
| [target-architecture.md](./target-architecture.md) | Bun 기반 목표 아키텍처 |
| [tech-mapping.md](./tech-mapping.md) | Python → TypeScript 기술 스택 매핑 |
| [migration-plan.md](./migration-plan.md) | 단계별 마이그레이션 계획 |
| [checklist.md](./checklist.md) | 마이그레이션 체크리스트 |
| [risks.md](./risks.md) | 위험 요소 및 대응 방안 |

## Quick Decision Matrix

마이그레이션을 진행해야 하는 경우:

- [x] 앱을 외부 사용자에게 배포할 계획이 있다
- [x] 사용자에게 Python 설치를 요구하고 싶지 않다
- [x] CI/CD 파이프라인을 단순화하고 싶다
- [x] 프론트엔드와 백엔드 개발 경험을 통일하고 싶다

마이그레이션을 보류해야 하는 경우:

- [ ] 백엔드가 안정적으로 작동하고 있고 변경이 불필요하다
- [ ] 개발 리소스가 제한적이다
- [ ] Python 특화 라이브러리에 의존하고 있다

## Timeline Overview

```
Phase 1: 기반 구축 ─────────────────────────────────
         - 프로젝트 설정
         - 기본 서버 구현
         - 데이터베이스 레이어

Phase 2: 핵심 기능 ─────────────────────────────────
         - REST API 엔드포인트
         - WebSocket 구현
         - Job Queue 시스템

Phase 3: 외부 연동 ─────────────────────────────────
         - Google OAuth/Calendar
         - Jira/Confluence
         - Claude CLI

Phase 4: 통합 및 배포 ──────────────────────────────
         - Electron 통합
         - 크로스 컴파일 설정
         - 테스트 및 검증
```

## Getting Started

1. 현재 아키텍처 이해: [current-architecture.md](./current-architecture.md)
2. 기술 매핑 검토: [tech-mapping.md](./tech-mapping.md)
3. 마이그레이션 계획 확인: [migration-plan.md](./migration-plan.md)
4. 체크리스트로 진행: [checklist.md](./checklist.md)
