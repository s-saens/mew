---
title: "Hotview 코드 블록 내부 가로 스크롤"
description: "2026-10-29 Hotview 코드 블록의 자동 줄바꿈을 내부 가로 스크롤로 바꾼 수정과 데스크톱·모바일·양 테마·읽기 전용 회귀 검증, 기존 문서 검사 오류 및 운영 미적용 범위를 기록한다."
created: "2026-10-29"
updated: "2026-10-29"
---

모바일에서 코드 블록의 긴 명령어가 여러 줄로 꺾이는 문제를 수정했다. 현재 동작은 [Markdown Hotview 기능 계약](../features/문서·코드·미디어%20편집/Markdown%20Hotview·원문·문서%20속성.md)이 소유한다.

Tiptap이 나중에 주입하는 `.ProseMirror pre`의 `white-space: pre-wrap` 때문에 기존 가로 스크롤 속성보다 줄바꿈이 먼저 적용됐다. 코드 블록 선택자의 우선순위를 높이고 `white-space: pre`·`overflow-wrap: normal`을 지정했다. 원래 줄바꿈·들여쓰기와 블록 밖 복사 버튼은 유지한다.

`node --test server/editor-code-block-scroll-ui.test.ts`는 수정 전 `pre-wrap`으로 실패했고 수정 후 통과했다. 격리 Chromium의 1100px·390px 화면과 다크·라이트 테마에서 공백이 있는 긴 명령어·공백 없는 긴 식별자의 두 줄 유지, 공백·탭 보존, 실제 내부 스크롤 위치 변경, 편집기 전체 가로 넘침 방지, 복사 버튼 위치 유지, 일반 문단 줄바꿈과 읽기 전용을 확인했다. 테스트는 앱 서버 없이 메모리 번들과 요청 가로채기를 사용했다.

`npx tsc -b`와 `npx oxlint server/editor-code-block-scroll-ui.test.ts`를 통과했다. 데스크톱·모바일 캡처에서 코드 블록의 두 줄 표시와 일반 본문 줄바꿈을 확인했다. 작업 범위의 `git diff --check`도 통과했다.

`npm run check:docs`는 작업 전부터 변경 중이던 `docs/지원서.md`의 프론트매터 누락 1건으로 실패했다. 별도 실행한 `node server/document-links.ts --all`은 기존 README 첨부 URL과 삭제된 기능 MOC·태스크 링크 19건으로 실패했다. 변경 문서 2개의 description과 내부 링크는 기존 검사 함수로 별도 확인해 오류가 없었다.

앱 빌드·배포·서버 실행·재시작은 수행하지 않았다. 실기기의 터치 스크롤과 운영 인스턴스 반영은 사용자 확인 대상이다.
