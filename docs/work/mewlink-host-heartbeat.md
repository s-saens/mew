---
title: "Mewlink 호스트 heartbeat 무응답 복구"
description: "2026-10-29 중앙의 offline 응답과 호스트의 online·OPEN 상태 불일치 조사, heartbeat 응답 감시·handshake 제한 추가와 격리 검증 및 운영 미적용 범위를 기록한다."
created: "2026-10-29"
updated: "2026-10-29"
---

## 조사와 원인

공개 기기 접속을 새 Chromium 컨텍스트에서 확인했을 때 중앙 WebSocket은 challenge 뒤 `offline`을 반복해서 반환했고 화면은 계속 ‘연결 복구 중’을 표시했다. 로컬 운영 서버는 실행 중이었다. 기존 운영 프로세스의 디버거에서 주기 검사 호출 스택과 변수를 확인하니 호스트 상태는 `online`, 중앙 소켓은 `OPEN`, 재시도 타이머는 이미 종료된 상태였다. 디버거의 중단점을 제거하고 실행을 재개했으며 연결과 inspector 포트도 닫았다.

호스트는 20초마다 heartbeat를 보내지만 중앙 응답의 도착 여부를 검사하지 않았다. 따라서 `close`나 `error` 없이 끊긴 소켓이 열린 상태로 남으면 재연결도 시작하지 않았다. 중앙과 호스트의 상태 불일치는 이 결함과 일치한다. 최초 단절의 원인이 절전·네트워크 전환·서비스 문제 중 무엇이었는지는 확인하지 못했다. 브라우저의 범용 복구 표시도 최초 오류를 보여주지 않아 원인을 구분하기 어려웠다.

## 변경

현재 동작은 [원격 접속 계약](../development/remote-access.md#시그널링-순단의-같은-rtc-재부착)이 소유한다. 기존 JSON heartbeat 응답을 비동기 처리 큐 밖에서 확인하고, 단조 시각으로 60초 이상 무응답이면 주기 검사에서 소켓을 강제 종료해 기존 재접속 절차를 사용한다. 송신 오류도 같은 경로로 정리하고 최초 WSS handshake는 30초로 제한한다. 중앙 프로토콜·등록 키·lease·RTC 재부착 정책은 유지한다.

## 검증과 적용

- `MEW_DATA_DIR="${TMPDIR:-/tmp}/mew-test-data" node --test server/remote-access-heartbeat.test.ts server/remote-access-agent-startup.test.ts server/remote-access-retry.test.ts server/remote-access-registration-network.test.ts`: 34개 통과. OPEN 상태의 무응답·정상 응답·송신 실패·종료 정리와, 실제 TLS WebSocket fixture에서 무응답 종료 뒤 재접속·인증된 RTC 보존을 확인했다. 단위 검사는 가상 시각을, 통합 검사는 수동 heartbeat 검사와 가상 단조 시각을 사용했다.
- `npx tsc -b`와 변경한 TypeScript 4개 파일의 `npm run lint -- …`: 통과.
- `npm run check:docs`: 기존 `docs/지원서.md`의 frontmatter 누락으로 실패했다. 별도 실행한 `node server/document-links.ts --all`도 기존 README 이미지·기능·태스크 링크 오류 19개로 실패했다. 기존 `readDescription`·`documentLinkErrors`로 이번 문서 3개의 description과 로컬 링크 대상을 별도 검사해 통과했다.
- 변경 파일의 `git diff --check`: 통과.

앱 빌드·배포·서버 시작·종료·재시작은 수행하지 않았다. 이 수정은 호스트 서버에 적용해야 하며 중앙 Worker 재배포는 필요하지 않다. 기존 운영 프로세스의 연결이 복구됐다는 뜻은 아니다. 실제 절전·외부망 전환 뒤의 복구 검증은 남아 있다.
