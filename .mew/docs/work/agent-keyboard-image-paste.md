---
title: "모바일 키보드 이미지 붙여넣기 수정·검증"
description: "에이전트 입력의 CodeMirror 일반 텍스트 전용 속성 해제와 이미지·텍스트 붙여넣기 회귀 검사 결과를 기록한다. 실제 Android 키보드와 운영 적용은 미검증이다."
created: "2026-10-27"
updated: "2026-10-27"
---

## 목적과 변경

모바일 키보드 클립보드의 이미지를 에이전트 입력에 붙여넣을 수 없는 제보에 대응했다. CodeMirror 기본 스타일이 편집 호스트에 `read-write-plaintext-only`를 적용하는 것을 확인하고, 에이전트 입력에서만 `read-write`로 덮어썼다. 기존 이미지 첨부 콜백과 서식 없는 텍스트 붙여넣기를 유지한다. 현재 동작과 지원 경계는 [입력 기능 계약](../features/%ED%84%B0%EB%AF%B8%EB%84%90%C2%B7%EC%97%90%EC%9D%B4%EC%A0%84%ED%8A%B8%C2%B7%EC%9E%90%EB%8F%99%ED%99%94/%EC%97%90%EC%9D%B4%EC%A0%84%ED%8A%B8%20%EC%9E%85%EB%A0%A5%C2%B7%EB%A9%98%EC%85%98%C2%B7%EC%8A%A4%ED%82%AC%C2%B7%EC%B2%A8%EB%B6%80.md)을 따른다.

## 검증

- 수정 없이 새 `server/agent-composer-clipboard-ui.test.ts`를 실행하면 네 화면·테마 조합 모두 일반 텍스트 전용 속성으로 실패했다. 수정 후 격리 Chromium의 1100·390px, 밝은·어두운 배경에서 계산된 편집 속성·브라우저 이미지 삽입 허용 상태, 합성 `paste`·`beforeinput`의 이미지 콜백 단회 전달·기존 본문 보존과 HTML을 일반 텍스트로 커서 위치에 붙여넣는 동작을 확인했다.
- 새 UI 검사와 `clipboard-images.test.ts`·`agent-composer-document.test.ts`의 관련 검사 19개가 통과했다.
- `npx tsc -b`와 대상 oxlint가 종료 코드 0으로 통과했다. 입력 컴포넌트의 기존 React ref 경고 1개는 유지된다. Impeccable `detect` 결과는 빈 배열이었다.
- 초기 수정 전 `agent-composer-attachments-ui.test.ts` 실행에서는 새 속성 검사 실패 외에 기존 업로드 대기 태그의 숨김 상태로 인한 대기 시간 초과가 발생했고, 전체 60초 제한으로 종료됐다. 해당 파일 변경은 남기지 않고 이번 버그의 회귀 검사를 독립 파일로 분리했다.

- `npm run check:docs`의 description 486개 검사는 통과했다. 당시 전체 링크 검사는 이번 작업 밖에서 삭제되거나 작성 중인 문서를 가리키는 링크 21개로 실패했다.

## 적용과 제한

실제 Android·Brave·키보드 클립보드의 이미지 선택은 확인하지 않았다. 웹에 이미지 파일을 전달하지 않는 OS·키보드·브라우저 조합까지 지원을 보장하지 않는다. 앱 빌드·배포·서버 시작·종료·재시작은 수행하지 않았으며 사용자가 운영에 적용한 뒤 실기기로 확인해야 한다.
