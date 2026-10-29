---
title: "알림 설정 하단 안내 제거"
description: "2026-10-27 알림 설정의 감시 범위 안내 문단과 네 언어 문구 제거, 회귀 테스트 및 운영 미적용 범위를 기록한다."
created: "2026-10-27"
updated: "2026-10-27"
---

알림 설정 맨 아래의 긴 감시 범위 안내 문단을 제거했다. 사용하지 않는 네 언어의 문구도 삭제했다. 현재 표시 계약은 [뮤펫·알림 기능](../features/%ED%99%94%EB%A9%B4%C2%B7%EA%B3%84%EC%A0%95%C2%B7%EC%9A%B4%EC%98%81/Mewpet%20%EB%A7%88%EC%8A%A4%EC%BD%94%ED%8A%B8%C2%B7%EC%95%8C%EB%A6%BC%C2%B7%ED%9C%B4%EC%8B%9D.md)이 소유한다. 권한 상태·테스트 버튼·3초 전환 안내와 실제 알림 동작은 유지한다.

`node --test src/components/mewcat-notifications.test.ts src/utils/mewcat-notifications.test.ts`의 13개 검사가 통과했다. 회귀 테스트는 감시 범위 문단이 표시되지 않고 테스트 버튼과 안내가 유지되는지 확인한다.

`npx tsc -b`와 변경 파일의 `git diff --check`가 통과했고 UI 정적 검사에서 지적 사항이 없었다. `npm run check:docs`는 description 오류가 없었으나 기존 문서 정리 중 발생한 끊어진 링크 18개로 실패했다. 이번 작업 문서의 링크는 직접 확인했다.

앱 빌드·배포·서버 재시작은 수행하지 않았다. 실행 중인 화면에 대한 적용은 사용자가 수행한다.
