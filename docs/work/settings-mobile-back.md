---
title: "모바일 설정 상세 화면의 뒤로가기"
description: "2026-10-29 모바일 설정 상세에서 뒤로가기를 누르면 목록으로 복귀하도록 수정한 기록. 중첩 선택 목록·직접 진입·반응형 경계·기존 닫기 동작의 격리 회귀 검사, 기존 문서 오류와 운영 미적용 범위를 구분한다."
created: "2026-10-29"
updated: "2026-10-29"
---

모바일에서 화면 설정 등 상세 화면을 보다가 브라우저·기기 뒤로가기를 누르면 설정창 전체가 닫혔다. `SettingsModal`이 상세 상태와 무관하게 `onClose`를 호출했기 때문이다.

`useOverlayDismiss`의 기존 `closeOnBack`에 현재 화면 폭과 `mobileSection` 확인을 추가했다. 768px 미만의 상세 화면에서는 설정 목록으로 돌아가고 공용 History 가드를 유지한다. 목록의 다음 뒤로가기는 설정창만 닫는다. 열린 선택 목록은 먼저 닫히며, 뮤펫·디버거 직접 진입에도 같은 상세 상태를 사용한다. Esc·닫기 버튼과 데스크톱 뒤로가기는 기존 동작을 유지한다.

현재 계약은 [설정 기능](../features/화면·계정·운영/화면·언어·글꼴·단축키%20설정.md)과 [설정창 UI 계약](../development/ui-contracts.md#설정-창-레이어), 사용자 조작은 [화면 설정 안내](../configuration/appearance.md)가 소유한다.

검증 결과:

- `node --test server/settings-navigation-ui.test.ts server/overlay-history-ui.test.ts packages/ui/src/useOverlayDismiss.test.ts server/dock-settings-ui.test.ts`: 14개 검사 통과. 새 회귀 검사는 격리 Chromium의 다크·라이트에서 상세 → 목록 → 닫기, 반복 항목 진입, 언어 선택 목록 우선 닫기, 화면 안 뒤로 버튼, Esc·닫기 버튼, 뮤펫 직접 진입과 767/768px 전환을 확인했다. 설정 아래 오버레이 유지도 확인했다.
- `npx tsc -b`: 통과했다.
- `npx oxlint src/components/SettingsModal.tsx server/settings-navigation-ui.test.ts`: 경고·오류 없이 통과했다.
- 변경 UI의 Impeccable 검사: 발견 사항 없음.
- `npm run check:docs`: 기존 `docs/지원서.md`의 프론트매터 누락 1건으로 실패했다. 별도로 실행한 `node server/document-links.ts --all`도 기존 링크 오류 19건으로 실패했다. 작업 전부터 삭제 상태였던 기능 MOC·태스크 문서 참조와 README의 API 이미지 경로가 원인이며, 이번에 변경한 문서 4개의 오류는 없었다.

앱 빌드·배포·서버 실행·재시작은 수행하지 않았다. 실제 모바일 기기와 운영 인스턴스 적용 후 동작은 미검증이며, 사용자가 빌드·적용한다.
