---
title: "명령어 버튼의 포트 미리보기 구현·검증"
description: "2026-10-27 포트 버튼·공개 기기 URL·메뉴 밀도 개선과 직접 프리뷰의 Vite 모듈 누락 수정, 원격 초기화 실패 처리·공개 DNS 미준비 확인을 기록한다. 격리·실행 중 앱 관찰과 빌드·운영 미적용을 구분한다."
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

## 2026-10-27 — 명령 이름 가시성 개선

포트 버튼 때문에 이름이 대부분 가려지는 화면 제보를 반영해 명령 메뉴를 220px에서 308px로 40% 넓히고 화면 너비의 90%를 상한으로 뒀다. 글자·행간·바깥/항목 여백과 실행·터미널 버튼 너비를 조금 줄였다. 포트에는 테마 배경·테두리·작은 모서리를 더하고 묶음 너비를 제한해 이름 표시 공간을 확보했다. 현재 수치는 [공용 UI 계약](../development/ui-contracts.md#드롭다운과-선택-컴포넌트)이 소유한다.

- `server/command-button-menu-ui.test.ts`·`server/action-menu-ui.test.ts`·`src/utils/command-menu-keyboard.test.ts`의 4개 검사가 통과했다. 실제 컴포넌트와 모의 API로 1100/390/320px·양 테마와 240px 크기 변경의 메뉴 폭, 작은 글자·여백·포트 배경/테두리·이름 영역, 기존 키보드·실행·새 탭을 확인했다. 햄버거·프로젝트 메뉴와 공통 표면의 회귀도 검사했다.
- `npx tsc -b`와 변경 TypeScript 대상 oxlint가 통과했다. Impeccable `detect`는 빈 배열이었다. 390px 어두운 테마와 320px 밝은 테마의 격리 캡처를 확인했다.
- `npm run check:docs`의 description 491개는 오류 없이 통과했다. 전체 링크 검사는 앞선 작업과 같은 기존 누락 링크 17건으로 실패했으며 이번 변경 문서 3개에는 링크 오류가 없다.

앱 빌드·배포·서버 재시작과 실제 휴대폰 적용은 수행하지 않았다.

## 2026-10-27 — 포트 접속 실패 재현·수정

직접 프리뷰에서 현재 실행 중인 Vite 앱을 격리 프록시·브라우저로 관찰했을 때 인라인 React Refresh와 여러 줄 import의 일부가 Mew 루트로 요청되어 CORS 오류와 빈 화면이 발생했다. 단순 모듈만 사용한 기존 fixture는 이 경우를 포함하지 않았다. 실제 지정자를 분석하는 lexer로 인라인·외부 스크립트를 처리하도록 바꾸고 문자열·주석·JSON·source map을 보호했다. [ADR 0078](../decisions/0078-port-preview-module-initialization.md)을 따른다.

Mewlink 공개 기기 주소는 HTTP 200이었지만 프리뷰 도메인과 서로 다른 난수 호스트 두 곳의 DNS는 `ENOTFOUND`였다. 기존 원격 브라우저 검사는 호스트 해석·인증서를 fixture로 대체하므로 실제 DNS 준비를 입증하지 않았다. 원격 mount에 초기화 완료·실패 통지와 15초 제한을 추가해 준비 실패를 화면에 반환하고 세션·요청·소켓·포트를 정리했다. 공용 launcher 자산은 중앙 빌드에도 포함된다.

- 인라인 React Refresh·여러 줄 import·고정 템플릿 동적 import를 추가한 직접 HTTPS 터널 브라우저 검사는 수정 전에 기대 화면 대기 시간 초과로 실패했고, 수정 후 통과했다.
- `server/port-preview.test.ts`·`server/port-preview-browser.test.ts`·`server/port-preview-launch.test.ts`의 13개 검사가 통과했다. 주석·문자열·JSON·source map 보존, 모듈·POST·HMR·권한·origin·SSE와 원격 timeout·Service Worker 실패·위조 메시지·자원 정리를 확인했다.
- 현재 실행 중인 Vite 앱에 대한 격리 진단에서도 수정 후 기존 모듈 CORS 오류가 사라지고 앱 본문이 렌더링됐다. 해당 앱은 프록시 pathname 때문에 자체 경로 안내 화면을 표시했으므로 앱 라우터까지 정상 동작한 것으로 기록하지 않는다. 별도 API 서비스의 `/` 404도 upstream 자체 응답임을 확인했다.
- 변경 TypeScript·JavaScript 대상 oxlint와 `npx tsc -b`가 통과했다. 임시 진단용 브라우저·HTTP 서버는 종료했다.
- `npm run check:docs`는 description 494개에서 오류가 없었다. 전체 링크 검사는 기존 누락 대상 17건으로 실패했으며 이번 변경 문서에는 링크 오류가 없다.

DNS·인증서·Worker 설정과 운영 서버는 변경하지 않았다. 호스트 빌드와 중앙 공용 자산 반영, wildcard DNS·HTTPS 준비는 사용자가 수행해야 한다. 경로 기반 앱의 basename 설정 등 기존 [라우터 호환 한계](../development/port-preview.md#호환성과-검증)도 유지한다.
