---
title: "본문 선택 색상과 모바일 자동 메뉴"
description: "2026-10-29 Hotview·Plain·코드 선택 영역의 테마 주요색 적용과 모바일 기본 텍스트 선택 보존·선택 후 자동 메뉴, 선택 조절·포커스·수명 처리 및 격리 검증과 실기·운영 적용 범위를 기록한다."
created: "2026-10-29"
updated: "2026-10-29"
---

모바일에서 본문을 길게 누르거나 더블탭할 때 우클릭 메뉴가 기본 텍스트 선택을 가로막는 문제를 수정했다. 현재 동작은 [에디터 메뉴 계약](../development/ui-contracts.md#에디터-본문-우클릭-메뉴), 사용자 조작은 [본문 메뉴 사용법](../../../docs/guides/editor.md#본문-우클릭-메뉴)이 소유한다.

터치 `contextmenu`의 기본 동작을 허용하고 내부 표 메뉴로의 전파를 차단했다. 같은 본문 안의 텍스트를 선택하고 손가락을 뗀 뒤 범위가 250ms 동안 안정되면 기존 메뉴를 연다. 메뉴는 본문 포커스를 유지하며 선택 핸들 조절을 막지 않는다. 선택을 바꾸면 이전 메뉴를 닫고 새 범위로 다시 준비한다. 메뉴 안의 항목 누름과 내부 스크롤은 조기 닫기에서 제외한다. 마우스 우클릭과 읽기 전용 권한·선택 범위에 적용하는 기존 명령 경로를 유지한다.

격리 Chromium의 연속 터치 검사에서 기본 선택이 사라지고 메뉴가 다시 뜨는 경로를 CDP 중단점으로 확인했다. 터치 직후의 `contextmenu`도 `pointerType: "mouse"`로 전달됐으며, 호출 스택은 `openEditorMenu`의 우클릭 경로였다. 직전 입력도 함께 확인하도록 보완했다. 실제 마우스 누름과 키 입력은 터치 상태를 초기화한다. 임시 디버깅 코드와 연결은 제거했다.

`MEW_CONTEXT_MENU_SCREENSHOT_DIR=/tmp/mew-mobile-selection-captures node --test server/editor-context-menu-ui.test.ts`의 테스트 3개를 통과했다. 390px에서 Hotview·Plain·코드의 길게 누르기 기본 동작 허용, 선택 전·선택 중 메뉴 비표시, 연속 터치 후 자동 표시, 선택·포커스 유지, 정확한 복사·삭제 범위, 읽기 전용 복사, 표 메뉴 병합, 파일·모드·워크스페이스 변경과 취소·Esc를 검사했다. 1280px의 일반 선택 비자동 표시와 기존 1280/390px·밝은/어두운 테마 우클릭 회귀도 통과했다. 모바일 자동 메뉴 캡처에서 선택 하이라이트와 선택 아래 메뉴 배치를 확인했다. OS 선택 핸들의 결과는 DOM Range를 주입해 검증했다.

`node --test server/action-menu-ui.test.ts server/editor-table-menu-ui.test.ts`의 기존 공용 메뉴·표 메뉴 테스트 2개도 통과했다. `npx tsc -b`와 변경 코드·테스트의 `npx oxlint`를 통과했으며, 기존 컴포넌트의 React 경고는 남았다. 변경 범위의 `git diff --check`도 통과했다.

`npm run check:docs`는 기존 `docs/지원서.md`의 frontmatter 누락으로 실패했다. 별도 실행한 `node server/document-links.ts --all`은 기존 README의 절대 asset 주소와 삭제된 기능·태스크 문서 링크 19건으로 실패했다. 변경한 문서 3개의 description과 로컬 링크는 기존 검사 함수를 사용해 별도로 통과했다.

앱 빌드·배포·서버 시작·종료·재시작은 수행하지 않았다. 실제 Android·iOS의 기본 도구 모음·선택 핸들 동작과 운영 적용은 이번 격리 검증에 포함하지 않으며, 실제 인스턴스 적용은 사용자가 수행한다.

## 테마 주요색으로 선택 영역 표시

후속 요청에 따라 Hotview의 기본 브라우저 선택 배경에 테마 주요색을 30% 불투명도로 적용하고 글자색을 유지했다. Plain·코드에서도 기본 브라우저 선택에 같은 색을 지정했다. CodeMirror가 선택 영역을 직접 그리는 경로는 포커스된 기본 스타일의 높은 선택자 우선순위 때문에 테마색이 덮이던 문제를 함께 수정했다. 현재 기준은 [텍스트 선택 계약](../development/ui-contracts.md#텍스트-선택)이 소유한다.

`MEW_CONTEXT_MENU_SCREENSHOT_DIR=/tmp/mew-theme-selection-captures node --test server/editor-context-menu-ui.test.ts`의 테스트 4개를 통과했다. 1280/390px·밝은/어두운 테마에서 Hotview·Plain·코드, 편집·읽기 전용, CodeMirror의 직접 그리기·기본 브라우저 선택 분기를 검사했다. 서로 다른 두 주요색으로 바꿔 선택 배경의 실제 RGBA·30% 불투명도·기존 구문 색상 토큰·선택 내용 유지와 직접 그리기 경로의 기본 선택 배경 투명을 확인했다. iOS 분기는 Chromium에서 플랫폼 감지를 대역했다. 모바일 라이트의 Hotview와 데스크톱 다크의 코드 캡처에서 테마 선택 배경과 읽을 수 있는 글자를 확인했다.

`npx tsc -b`, 변경 코드·테스트의 `npx oxlint`, 변경 범위의 `git diff --check`를 통과했다. 기존 CodePane의 React 경고는 남았다. `npm run check:docs`는 기존 frontmatter 오류 1건으로 실패했고, 별도 링크 검사 함수는 기존 링크 오류 19건을 반환했다. 이번 변경 문서 2개의 description·로컬 링크는 별도 검사에서 통과했다. 임시 CDP 진단 연결과 테스트 코드는 정리했다.

앱 빌드·서버 적용은 수행하지 않았다. OS 선택 핸들·기본 도구 모음의 색과 실제 iOS 렌더링은 이 CSS 변경의 검증 범위에 포함하지 않는다.
