---
title: "개발 서버 Mewlink 연동 제외"
description: "2026-10-29 npm run dev의 Mewlink 에이전트·관리 API 제거와 운영 서버 연동 유지, 격리 회귀·타입·린트 검사 결과 및 기존 문서 링크 오류·운영 미적용 범위를 기록한다."
created: "2026-10-29"
updated: "2026-10-29"
---

`npm run dev`가 저장된 기기 등록으로 Mewlink에 연결해 운영 서버와 같은 기기의 중앙 연결을 사용하는 문제를 막았다. `server/plugin.ts`에서 Mewlink 에이전트 import·생성·관리 API 등록을 제거했다. `server/serve.ts`의 일반 시작 경로는 유지한다. 현재 동작은 [Mewlink 접속 계약](../development/remote-access.md#구성과-신원)을 따른다.

`server/plugin.test.ts`는 실제 개발 API 설정 함수를 격리된 의존성으로 호출해 Mewlink 모듈을 로드하지 않고 관리 API를 등록하지 않는지 검사한다. HTTP 서버가 있는 경우와 middleware 모드를 모두 검사하며, 로컬 인증·일반 API 등록도 확인한다. 앱 서버를 시작하거나 저장된 기기 등록을 읽지 않는다.

검증 결과:

- `node --test server/plugin.test.ts server/vite-config.test.ts`: 2개 통과.
- `MEW_DATA_DIR="${TMPDIR:-/tmp}/mew-test-data" node --test server/remote-access-agent-startup.test.ts server/remote-access-registration-network.test.ts`: 운영 에이전트 시작·등록 관련 24개 통과. 모의 중앙·네트워크를 사용하는 격리 검사다.
- `npx tsc -b`와 `npm run lint -- server/plugin.ts server/plugin.test.ts`: 통과.
- `npm run check:docs`: description 오류 0개. 기존 README의 이미지 경로와 기능·태스크 문서의 링크 오류 19개로 실패했다. 이번에 변경한 문서의 링크는 별도로 확인했다.
- 작업 파일의 `git diff --check`: 통과.

앱 빌드·배포·런처 실행·개발 및 운영 서버 시작·재시작은 수행하지 않았다. 실행 중인 인스턴스 적용과 실제 중앙 서비스의 동시 실행 확인은 사용자가 수행한다.
