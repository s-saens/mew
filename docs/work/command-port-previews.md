---
title: "명령어 버튼의 포트 미리보기 구현·검증"
description: "2026-10-27 명령 세션별 실제 수신 포트 버튼·공개 기기 URL 전달의 구현과 격리 검증, Git 제외 중앙 수정의 별도 패치 보존 및 OS·운영 적용 한계를 기록한다."
created: "2026-10-27"
updated: "2026-10-27"
---

## 목적과 결과 동작

개발 서버 명령이 연 포트를 해당 명령 줄의 정지·터미널 버튼 왼쪽에 표시했다. 실제 프로세스와 수신 소켓을 연결하고 포트가 닫히면 다음 목록 갱신에 버튼을 제거한다. 버튼은 명령을 재실행하지 않고 현재 Mew 주소에 포트를 붙인 새 탭을 연다. Mewlink 예시는 `https://mew.run/saens/windows/5555`다.

현재 계약은 [명령 사용법](../guides/commands.md), [셸 터미널 기능](../features/터미널·에이전트·자동화/tmux%20셸%20터미널.md), [포트 감지·프리뷰](../development/port-preview.md)와 [원격 접속](../development/remote-access.md)이 소유한다. 공개 기기 base의 전달과 감지 방식은 [ADR 0076](../decisions/0076-command-port-previews.md)에 기록했다.

## 검증

- `server/command-ports.test.ts`: 실제 Linux 부모·자식 프로세스의 HTTP/TCP·IPv4/IPv6·wildcard·다중 포트·세션 분리·포트 닫힘과 파서·시간 초과를 검사했다. macOS·Windows는 실제 명령 실행 없이 소켓·프로세스 출력 파서를 검사했다.
- `server/cmd-button-ports.test.ts`: GET/PUT의 실제 포트 연결·중첩 프로젝트·정지 세션·Mew 수신 포트 제외·권한 거부·조회 실패·실행 상태 보존을 확인했다. 기존 명령 설정·하위 프로젝트·에이전트 터미널·번역 검사도 통과했다.
- `packages/tmux-term/src/server/pane-pids.test.ts`: 격리 multiplexer 대역으로 namespace·조회 argv·pane PID·Windows CRLF 출력을 검사했다. CRLF fixture에서 PID가 누락되는 실패를 확인한 뒤 줄 끝 정리로 수정하고 통과했다.
- `server/command-button-menu-ui.test.ts`: 격리 Chromium의 1100/390px·양 테마에서 번호 버튼 순서·가로 스크롤·키보드 접근·로컬/공개 기기 새 탭 URL·구버전 중앙 오류·정지 후 제거와 재실행 방지를 확인했다. 실제 컴포넌트와 모의 API 응답을 사용하며 OS 서버를 실행하는 검사는 아니다. 캡처도 확인했다.
- 기존 `server/action-menu-ui.test.ts`와 `src/utils/command-menu-keyboard.test.ts`에서 공용 메뉴의 크기·테마·포커스·방향키 회귀도 통과했다.
- `src/utils/port-preview-url.test.ts`·`src/utils/remote-reconnect.test.ts`: 공개 base·로컬 도메인과 포트 보존·잘못된 원격 주소 거부·기존 재접속의 base 보존을 확인했다.
- 기존 `server/port-preview.test.ts`·`server/port-preview-browser.test.ts`의 9개 검사는 직접 HTTPS 터널과 원격 raw P2P의 모듈·POST·HMR·쿠키·SSE·권한 경계에서 통과했다.
- 중앙의 `mewlink/test/startup.browser.test.ts` 16개, `mewlink/test/port-preview.test.ts` 2개와 `npm --prefix mewlink run check`가 통과했다. 첫 방문·새로고침·프리뷰 하위 경로에서 공개 기기 base 전달을 확인했다.
- `npx tsc -b`, 변경 TypeScript 대상 oxlint가 통과했다. Impeccable `detect`는 빈 배열을 반환했다.
- `npm run check:docs`는 description 491개에서 오류가 없었다. 전체 링크 검사는 이번 작업 밖에서 삭제한 기능 MOC·태스크 문서를 가리키는 기존 링크 17건으로 실패했다. 이번 변경 문서 6개의 링크 오류는 없다.

## 중앙 변경과 적용 한계

`mewlink/src/launcher-types.ts`·`connection-parent.ts`·`app-launcher.ts`와 `mewlink/test/startup.browser.test.ts`는 이 체크아웃의 Git 제외 경로다. 해당 중앙 변경만 담은 패치를 `/tmp/mew-command-port-preview-central.patch`에 따로 남겼으며 현재 소스에 역방향으로 적용 가능한지 검사했다. 이 파일은 임시 로컬 산출물이므로 중앙 담당자가 별도로 보관·적용해야 한다. 공개 저장소에 중앙 소스를 강제 추가하지 않았다.

macOS·Windows의 실제 pane/프로세스 조회, 실제 공개 `mew.run`·사용자 도메인·Tailscale·외부망 접속은 확인하지 않았다. Linux 격리 검사에서는 IPv6 fixture도 실행됐다. daemon의 재부모화·컨테이너 별도 프로세스·HTTP가 아닌 서비스는 자동 연결 범위 밖이다.

앱·중앙 빌드·배포·실행 중인 서버의 시작·종료·재시작은 수행하지 않았다. 사용자가 호스트 앱과 중앙 변경을 각각 적용해야 하며 기존 `PREVIEW_DOMAIN`·wildcard DNS·HTTPS·Worker 준비 조건도 유지된다.
