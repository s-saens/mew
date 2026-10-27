---
title: "모바일 독·본문·Plain 보조키바 스와이프 분리"
description: "2026-10-27 독의 인접 패널 전환, 모바일 본문·Plain 보조키바의 탭 전환과 CodeMirror 보조키 추가를 구현한 기록이다. 실제 편집기·독·태스크·키보드 격리 검사와 타입·린트·문서 결과, 실기·운영 미적용 범위를 구분한다."
created: "2026-10-27"
updated: "2026-10-27"
---

독 스와이프가 탭을 먼저 바꾸던 동작을 패널 전환으로 바꿨다. 탭 전환은 모바일 패널 본문에서 처리하며, 일반 파일·Markdown Plain은 가로 스크롤을 보존하도록 보조키바에서만 처리한다. 현재 계약은 [패널 배치·모바일](../features/화면·계정·운영/패널%20배치·모바일·상태%20복원.md)과 [공용 UI 계약](../development/ui-contracts.md#모바일-독과-패널-전환), 선택 근거는 [ADR 0079](../decisions/0079-mobile-panel-swipes.md)가 소유한다.

`App`의 독 연결에서 탭 우선 분기를 제거하고 `useMobilePanelSwipe`로 시작 패널·요소를 확정했다. `EditorPane`이 Hotview 본문과 Plain 보조키바를 구분하며, 탭 줄·팝업·태스크 삭제·간트 조작은 기존 처리를 유지한다. 취소·다중 터치·전면 패널 변경은 탭을 전환하지 않고 스와이프 뒤 키 클릭을 억제한다.

기존 Plain에는 보조키바가 없어 `CodePane`에 선택적 공용 키바를 추가했다. 파일 에디터에서 켜고 내장 편집기는 기본으로 끈다. CodeMirror의 기존 키맵·협업 실행 취소를 사용하며 키바가 상태줄 아래에 머물도록 기존 키보드 높이 계산을 재사용한다. 공용 바의 Undo/Redo는 코드블럭·표 버튼 없이도 표시하도록 보완했다. 독의 접근성 안내도 네 언어에서 패널 전환으로 맞췄다.

검증 결과:

- `server/mobile-panel-swipe-ui.test.ts`: 실제 EditorPane·CodeMirror·Hotview·공용 독·키바를 사용하는 격리 Chromium에서 본문 가로 스크롤, 화면 높이와 무관한 Hotview 탭 전환, Plain 키바 전환·순환, 패널별 탭 전환과 탭 없는 패널 유지, 취소·다중 터치·클릭 억제, 문서 보존, modifier·방향키·Tab·Undo/Redo, 읽기 전용·데스크톱 제외를 확인했다. 390px 밝은·어두운 화면도 확인했다.
- `node --test --test-name-pattern='App mobile dock swipes' server/workspace-switch-ui.test.ts`: 실제 App의 독 스와이프가 탭이 있는 패널에서도 인접 패널을 열고 첫 경계에서 멈추며 문서 탭을 보존하는지 확인했다. 본문 스와이프가 사이드바 뷰만 전환하는 검사도 통과했다. 기존 `Files opens Documents` 검사도 별도로 통과했다.
- `server/task-schedule-ui.test.ts`: 본문 양방향 목록·달력·간트 순환, 독 선택과 태스크 탭 보존, 기존 간트 터치 편집·가로 범위 확장을 통과했다. fixture의 데이터 경로는 workspace와 분리했다.
- `server/editor-keyboard-ui.test.ts`·`server/fullscreen-keyboard-ui.test.ts`: 실제 Plain 키바의 키보드 경계·커서·상태줄 유지와 높이 복원을 통과했다. 전체화면 fixture는 모바일에서 실제 키바를 사용하도록 갱신했다.
- `server/code-pinch-zoom-ui.test.ts`·`src/utils/mobile-dock.test.ts`: 핀치·본문·선택·편집 이력 보존과 독 순서·표시·권한·끝 경계를 통과했다.
- 위 편집기·키보드·핀치·태스크·독 검사를 `node --test --test-concurrency=2`로 묶어 10개 모두 통과했다. 독 UI fixture의 세로 배치 검사는 React 상태 반영을 기다리도록 보완했다.
- `npx tsc -b`와 대상 파일 `npx oxlint`: 오류 없이 완료했다. 린트의 React ref·effect·의존성 경고는 남아 있다.
- 변경 UI의 Impeccable 검사에서 지적 사항이 없었다.
- `npm run check:docs`: description 502개는 오류 없이 통과했다. 전체 링크 검사는 이번 작업 전부터 삭제되어 있던 기능 MOC·태스크 참조 18건으로 실패했다. 이번 변경 문서 6개의 링크 오류는 없다.

앱 빌드·배포·서버 시작·재시작은 수행하지 않았다. 실제 휴대폰의 Safari·Chrome과 OS 키보드 조작은 미검증이다.
