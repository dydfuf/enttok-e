• 로컬 git 커밋으로 전환했고, GitHub 통합 화면에서 커밋을 읽을 레포를 직접 지정하도록 추가했어요. gh는 PR/리뷰에만 쓰고, 커밋은 선택한 폴더의 git 로그만 읽습니다(선택 외 스캔 없음).

  - electron-app/electron/main/github.ts: gh 커밋 수집 제거, 로컬 git log 기반 커밋 수집 + 원격 URL이 있을 때만 링크 생성
  - electron-app/electron/store.ts: 로컬 레포 경로 저장
  - electron-app/electron/main/ipc.ts: 레포 경로 get/set + 폴더 선택 IPC 추가
  - electron-app/electron/preload.ts: 새 IPC 브리지 메서드 노출
  - electron-app/src/shared/electron-api.ts: 새 ElectronAPI 메서드 타입 추가
  - electron-app/src/hooks/useGitHubRepos.ts: 레포 관리 훅 추가
  - electron-app/src/routes/_app/integrations/github.tsx: 로컬 레포 관리 UI 추가 + 커밋 링크 없을 때 비링크 처리
  - electron-app/src/hooks/useActivityStream.ts: 요약 자동 로딩 로직 조정

  테스트는 실행하지 않았어요.

  다음 단계 제안:

  1. 앱 재시작(메인 프로세스 변경 반영)
  2. GitHub 통합 화면에서 로컬 레포 추가 후 커밋 노출 확인
  3. 커밋이 안 보이면 해당 레포의 git config user.email / user.name 확인
