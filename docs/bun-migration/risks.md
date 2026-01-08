# Risk Assessment

## Overview

이 문서는 Python/FastAPI에서 Bun/Elysia로 마이그레이션할 때 발생할 수 있는 위험 요소와 대응 방안을 정리합니다.

## Risk Matrix

| ID | Risk | Probability | Impact | Level | Mitigation |
|----|------|-------------|--------|-------|------------|
| R1 | Bun 프로덕션 안정성 | 중간 | 높음 | 🟠 높음 | 점진적 롤아웃, 롤백 계획 |
| R2 | 기능 누락 | 낮음 | 높음 | 🟡 중간 | 체크리스트, API 비교 테스트 |
| R3 | 성능 저하 | 낮음 | 중간 | 🟢 낮음 | 벤치마크, 프로파일링 |
| R4 | SQLite 동기 I/O | 중간 | 중간 | 🟡 중간 | WAL 모드, 쿼리 최적화 |
| R5 | OAuth 플로우 오류 | 중간 | 높음 | 🟠 높음 | 철저한 테스트, Python 참조 |
| R6 | 크로스 컴파일 문제 | 낮음 | 중간 | 🟢 낮음 | 각 플랫폼 CI 테스트 |
| R7 | 의존성 호환성 | 중간 | 중간 | 🟡 중간 | 의존성 감사, 대안 준비 |
| R8 | 개발 리소스 부족 | 중간 | 높음 | 🟠 높음 | 단계별 진행, 우선순위 조정 |
| R9 | 데이터 마이그레이션 | 낮음 | 중간 | 🟢 낮음 | 스키마 동일, 백업 필수 |
| R10 | 팀 학습 곡선 | 중간 | 낮음 | 🟢 낮음 | 문서화, 페어 프로그래밍 |

---

## Detailed Risk Analysis

### R1: Bun 프로덕션 안정성

**설명:**
Bun은 상대적으로 새로운 런타임으로, Node.js에 비해 프로덕션 검증 기간이 짧습니다. 일부 개발자들이 "개발용으로는 준비됐지만 프로덕션에서 간헐적 버그 발생"을 보고합니다.

**발생 가능성:** 중간
**영향도:** 높음

**증상:**
- 예상치 못한 크래시
- 메모리 누수
- 특정 OS/아키텍처에서 동작 이상

**대응 방안:**
1. **점진적 롤아웃**
   - 먼저 개발 환경에서 충분히 테스트
   - 베타 사용자 그룹에 먼저 배포
   - 문제 발생 시 빠른 롤백

2. **듀얼 백엔드 유지**
   ```typescript
   // 환경변수로 백엔드 선택
   const useBun = process.env.USE_BUN_BACKEND === "true";
   ```

3. **모니터링 강화**
   - 에러 로깅 강화
   - 크래시 리포팅 설정
   - 메모리 사용량 모니터링

4. **롤백 계획**
   - Python 백엔드를 일정 기간 유지
   - 원클릭 롤백 스크립트 준비

---

### R2: 기능 누락

**설명:**
30개 이상의 API 엔드포인트와 복잡한 비즈니스 로직을 마이그레이션하면서 일부 기능이 누락되거나 동작이 달라질 수 있습니다.

**발생 가능성:** 낮음
**영향도:** 높음

**증상:**
- 특정 API가 404 반환
- 응답 형식 불일치
- 엣지 케이스 처리 누락

**대응 방안:**
1. **API 패리티 체크리스트**
   - 모든 엔드포인트 목록화
   - 각 엔드포인트별 구현/테스트 상태 추적
   - [checklist.md](./checklist.md) 참조

2. **스냅샷 테스트**
   ```typescript
   // 현재 Python 응답과 Bun 응답 비교
   test("GET /calendar/accounts returns same structure", async () => {
     const pythonResponse = await fetch("http://localhost:49671/calendar/accounts");
     const bunResponse = await fetch("http://localhost:49672/calendar/accounts");
     expect(bunResponse.json()).toMatchObject(pythonResponse.json());
   });
   ```

3. **코드 리뷰**
   - Python 코드와 TypeScript 코드 1:1 비교
   - 엣지 케이스 처리 확인

---

### R3: 성능 저하

**설명:**
예상과 달리 특정 시나리오에서 성능이 저하될 수 있습니다.

**발생 가능성:** 낮음
**영향도:** 중간

**대응 방안:**
1. **벤치마크 수립**
   ```typescript
   // 주요 엔드포인트 응답 시간 측정
   const endpoints = ["/health", "/jobs", "/calendar/events"];
   for (const endpoint of endpoints) {
     const start = performance.now();
     await fetch(`http://localhost:${port}${endpoint}`);
     console.log(`${endpoint}: ${performance.now() - start}ms`);
   }
   ```

2. **프로파일링**
   - Bun 내장 프로파일러 사용
   - 병목 지점 식별 및 최적화

3. **베이스라인 비교**
   - 마이그레이션 전 성능 측정
   - 마이그레이션 후 비교

---

### R4: SQLite 동기 I/O

**설명:**
Python의 aiosqlite는 비동기지만, bun:sqlite는 동기식입니다. 장기 실행 쿼리가 이벤트 루프를 블로킹할 수 있습니다.

**발생 가능성:** 중간
**영향도:** 중간

**증상:**
- 대량 데이터 쿼리 시 응답 지연
- 동시 요청 처리 능력 저하

**대응 방안:**
1. **WAL 모드 활성화**
   ```typescript
   db.exec("PRAGMA journal_mode = WAL");
   ```

2. **쿼리 최적화**
   - 적절한 인덱스 사용
   - 결과 제한 (LIMIT)
   - 필요한 컬럼만 SELECT

3. **배치 처리**
   ```typescript
   // 대량 삽입 시 트랜잭션 사용
   db.transaction(() => {
     for (const item of items) {
       insertStmt.run(item);
     }
   })();
   ```

4. **Worker 스레드 고려**
   - 무거운 쿼리는 Worker에서 실행
   - 메인 스레드 블로킹 방지

---

### R5: OAuth 플로우 오류

**설명:**
Google OAuth PKCE 플로우는 복잡하며, 구현 오류 시 사용자가 캘린더 연동을 사용할 수 없습니다.

**발생 가능성:** 중간
**영향도:** 높음

**증상:**
- OAuth 인증 실패
- 토큰 갱신 실패
- 콜백 처리 오류

**대응 방안:**
1. **Python 구현 참조**
   - `backend/app/services/google_oauth.py` 세부 로직 분석
   - 동일한 플로우 구현

2. **단계별 테스트**
   ```typescript
   // OAuth 각 단계 테스트
   test("PKCE generation", () => {
     const { codeVerifier, codeChallenge } = generatePKCE();
     // 검증
   });

   test("OAuth URL generation", () => {
     const { url, state } = startGoogleOAuth();
     // URL 파라미터 검증
   });

   test("Token exchange", async () => {
     // 모의 코드로 토큰 교환 테스트
   });
   ```

3. **에러 핸들링 강화**
   - 각 단계별 명확한 에러 메시지
   - 재시도 로직

4. **대안 라이브러리**
   - 문제 시 `@hono/oauth-providers` 고려

---

### R6: 크로스 컴파일 문제

**설명:**
특정 플랫폼에서 컴파일된 바이너리가 정상 동작하지 않을 수 있습니다.

**발생 가능성:** 낮음
**영향도:** 중간

**증상:**
- 특정 OS에서 실행 오류
- 아키텍처 불일치
- 네이티브 모듈 문제

**대응 방안:**
1. **CI 매트릭스 테스트**
   ```yaml
   strategy:
     matrix:
       os: [ubuntu-latest, macos-latest, windows-latest]
       arch: [x64, arm64]
   ```

2. **각 플랫폼 수동 테스트**
   - 실제 환경에서 테스트
   - VM 활용

3. **의존성 확인**
   - 네이티브 의존성 최소화
   - 순수 JavaScript 라이브러리 선호

---

### R7: 의존성 호환성

**설명:**
일부 npm 패키지가 Bun과 완벽히 호환되지 않을 수 있습니다.

**발생 가능성:** 중간
**영향도:** 중간

**대상 패키지:**
- `googleapis`
- `jira.js`
- `confluence.js`

**대응 방안:**
1. **사전 호환성 테스트**
   ```bash
   bun add googleapis
   bun test googleapis-usage.test.ts
   ```

2. **대안 준비**
   | 패키지 | 대안 |
   |--------|------|
   | googleapis | 직접 REST API 호출 |
   | jira.js | httpx + 수동 구현 |
   | confluence.js | httpx + 수동 구현 |

3. **이슈 모니터링**
   - Bun GitHub 이슈 확인
   - 커뮤니티 피드백 참조

---

### R8: 개발 리소스 부족

**설명:**
마이그레이션에 예상보다 많은 시간과 노력이 필요할 수 있습니다.

**발생 가능성:** 중간
**영향도:** 높음

**대응 방안:**
1. **단계별 진행**
   - 각 Phase를 독립적으로 완료
   - 중간에 멈춰도 작동하는 상태 유지

2. **우선순위 조정**
   - 핵심 기능 먼저 마이그레이션
   - 덜 사용되는 기능은 후순위

3. **병렬 개발 전략**
   - 새 기능은 Bun으로 개발
   - 기존 기능은 점진적 이전

4. **MVP 정의**
   - 최소 기능 세트 정의
   - 해당 기능만 먼저 마이그레이션

---

### R9: 데이터 마이그레이션

**설명:**
기존 SQLite 데이터베이스를 새 백엔드에서 사용할 때 문제가 발생할 수 있습니다.

**발생 가능성:** 낮음
**영향도:** 중간

**대응 방안:**
1. **스키마 동일 유지**
   - 동일한 테이블 구조 사용
   - 동일한 데이터 타입

2. **데이터 백업**
   ```bash
   cp data/index.db data/index.db.backup
   ```

3. **마이그레이션 스크립트**
   - 스키마 버전 확인
   - 필요시 마이그레이션 실행

---

### R10: 팀 학습 곡선

**설명:**
팀원들이 Bun/Elysia/TypeScript에 익숙하지 않을 수 있습니다.

**발생 가능성:** 중간
**영향도:** 낮음

**대응 방안:**
1. **문서화**
   - 코드 컨벤션 문서
   - 예제 코드 제공

2. **페어 프로그래밍**
   - 경험자와 함께 작업
   - 지식 전파

3. **점진적 도입**
   - 간단한 기능부터 시작
   - 복잡한 기능은 익숙해진 후

---

## Contingency Plans

### 전면 롤백

마이그레이션 실패 시 Python 백엔드로 즉시 복귀:

```bash
# 롤백 스크립트
#!/bin/bash
git checkout main -- backend/
# Electron 설정 롤백
git checkout main -- electron-app/electron/main/backend.ts
```

### 부분 롤백

특정 기능만 문제 시:

```typescript
// 기능별 백엔드 선택
const calendarBackend = process.env.CALENDAR_USE_BUN === "true" ? "bun" : "python";
```

### 하이브리드 운영

두 백엔드를 동시에 운영:

```typescript
// 프록시 패턴
app.all("/calendar/*", async (req) => {
  const backend = selectBackend("calendar");
  return fetch(`${backend}${req.url}`, { method: req.method, body: req.body });
});
```

---

## Risk Monitoring

### 체크포인트

| Phase | 체크포인트 | 판단 기준 |
|-------|-----------|----------|
| Phase 1 완료 | 기반 안정성 | 서버 24시간 무중단 |
| Phase 2 완료 | 핵심 기능 | Job 처리 정상 |
| Phase 3 완료 | 외부 연동 | OAuth 플로우 정상 |
| Phase 4 완료 | 배포 준비 | 크로스 컴파일 성공 |

### 롤백 트리거

다음 상황 발생 시 롤백 검토:

- [ ] 24시간 내 3회 이상 크래시
- [ ] 성능 30% 이상 저하
- [ ] 데이터 손실/손상 발생
- [ ] 핵심 기능 24시간 이상 장애

---

## Summary

마이그레이션의 주요 위험은 관리 가능한 수준입니다:

1. **높은 위험 (🟠)**: Bun 안정성, OAuth 플로우, 리소스 부족
   - 점진적 롤아웃과 롤백 계획으로 대응

2. **중간 위험 (🟡)**: 기능 누락, SQLite 동기 I/O, 의존성 호환성
   - 철저한 테스트와 대안 준비로 대응

3. **낮은 위험 (🟢)**: 성능 저하, 크로스 컴파일, 데이터 마이그레이션, 학습 곡선
   - 표준 엔지니어링 프랙티스로 대응

**권장사항:** 점진적 마이그레이션 전략을 채택하고, 각 Phase 완료 후 충분한 검증 기간을 가지세요.
