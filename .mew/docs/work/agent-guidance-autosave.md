---
title: "에이전트 지침 설정 자동 저장"
description: "2026-10-27 기본 지침 설정의 저장 버튼 제거와 400ms 자동 저장, 유효성·초안 보존 회귀 검사 및 운영 미적용 범위를 기록한다."
created: "2026-10-27"
updated: "2026-10-27"
---

설정마다 저장 버튼을 눌러야 하는 단계를 없앴다. 현재 계약은 [기능 문서](../features/%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%C2%B7%ED%8C%8C%EC%9D%BC%C2%B7%EA%B2%80%EC%83%89/%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%20%EB%AC%B8%EC%84%9C%20%EC%95%88%EB%82%B4%C2%B7%EC%B4%88%EA%B8%B0%ED%99%94.md), 저장 API는 [세션 계약](../development/agent-sessions.md), 조작 방법은 [설정 안내](../../../docs/guides/project-setup.md)를 따른다.

재시도·Git·전역 추가 지침·프로젝트 추가 지침과 자동 안내의 저장 버튼을 제거했다. 마지막 변경 후 400ms에 자동 저장하며 다른 프리셋은 기존처럼 선택 즉시 저장한다. 유효하지 않은 숫자·브랜치 입력은 전송하지 않는다. 저장 실패·충돌 때 초안을 보존하고, 미저장 브랜치 입력도 닫기·다시 불러오기의 버리기 확인 대상에 포함했다.

## 검증과 적용 범위

- `node --test server/agent-guidance-ui.test.ts server/agent-guidance.test.ts server/branch-guidance.test.ts server/agent-capacity-retry-settings.test.ts`: 41개 통과. UI는 격리 Chromium의 1100·390·320px 화면에서 자동 저장·잘못된 값 차단·추가 지침 실패 복구·프로젝트 격리·충돌·직접 편집 구간 대체를 검사했다.
- 브랜치 미저장 입력의 닫기·새로고침 확인을 보완한 최종 소스로 UI 검사 1개를 다시 통과했다.
- 변경 문서 4개의 description·로컬 링크 별도 검사: 오류 0개.
- `npx tsc -b`, 변경 TS·TSX 4개 파일의 `oxlint`, `git diff --check` 통과.
- `npm run check:docs`: description 검사 통과. 전체 링크 검사는 작업 전부터 삭제된 기능 MOC와 태스크 문서의 참조 17개로 실패했다. 해당 사용자 변경은 보존했다.
- 앱 빌드·배포·서버 실행·재시작은 수행하지 않았다. 운영 적용은 사용자가 수행한다.
