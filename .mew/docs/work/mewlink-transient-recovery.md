---
title: "Mewlink 짧은 순단의 연결 유지·복구 표시 개선"
description: "브라우저 RTC의 250ms 종료를 5초 복구 대기로 바꾸고 상태 표시를 1초 늦춘 구현과 검증을 기록한다. 권한 회수·만료·실제 실패의 즉시 종료와 운영 미적용·외부망 미검증을 구분한다."
created: "2026-10-28"
updated: "2026-10-28"
---

## 목적과 결과

Mewlink 사용 중 짧은 복구 표시와 재연결이 반복된다는 보고에 따라 브라우저 RTC의 `disconnected` 처리를 조정했다. 기존 코드가 즉시 복구 상태를 알리고 250ms 뒤 연결을 종료하는 경로를 새 회귀 테스트에서 재현했다. 운영 증상의 실제 원인은 확정하지 않았다.

이제 1초 미만 순단은 같은 transport에서 조용히 복구한다. 1초가 지나면 복구 상태를 알리고 최대 5초까지 자연 복구를 기다린다. 반복 이벤트는 기한을 늘리지 않으며 복구 후 다음 순단은 새 대기 시간을 갖는다. 복구·종료 때 두 타이머를 정리하고 같은 연결의 인증·쓰기·명령을 재전송하지 않는다.

권한 거부·회수, 실제 채널 종료와 lease 만료는 대기와 별개로 처리한다. 10초 중앙 검사·20초 갱신·호스트의 기존 검사는 바꾸지 않았다. 현재 계약은 [원격 접속](../development/remote-access.md)·[공용 UI](../development/ui-contracts.md), 선택 근거와 기존 결정 대체 범위는 [ADR 0081](../decisions/0081-mewlink-transient-recovery.md)이 소유한다.

## 검증

- `node --test src/utils/remote-connection.test.ts src/utils/remote-reconnect.test.ts`: 73개 통과. 999ms 순단의 표시 생략, 1초 뒤 표시, 5초 직전 복구·기한 도달 시 종료, 반복 이벤트·연속 순단·종료 타이머 정리를 확인했다. 2초 순단 중 진행하던 POST가 같은 transport에서 한 번만 전송되고 원래 응답으로 완료되는 회귀 검사도 통과했다. 5초 복구 대기보다 먼저 온 lease 만료·회수·중앙 정상 종료와 실제 채널 실패는 즉시 처리됐다. 모의 RTC 상태와 제어한 타이머를 사용한 검사다.
- `server/remote-local-auth.test.ts`·`remote-mewlink-auth.test.ts`·`remote-access-socket-close.test.ts`·`remote-access-ticket-inbox.test.ts`: 32개 통과. 요청별 로그인 경계, 비밀번호·권한 변경·회수, 늦게 도착한 인증 처리와 소켓별 오류 격리를 확인했다.
- `mewlink/test/connection-screen.browser.test.ts`·`recovery.browser.test.ts`·`startup.browser.test.ts`·`trusted-browser.browser.test.ts`·`p2p-stability.browser.test.ts`: 20개 통과. 모의 연결을 사용하는 실제 런처의 390/1100px·밝은/어두운 테마 표시, 기존 iframe·입력 초안 보존과 인증 변경 경계를 확인했다. 네이티브 P2P 검사는 격리 Workers·Chromium과 실제 네이티브 RTC에서 브라우저·호스트 시그널링 순단, 원래 60초 lease를 넘는 65초 유지, 브라우저 갱신 타이머가 지연된 상태의 중앙 갱신과 회수를 확인했다. 실제 외부망 순단이나 새 5초 대기 정책의 현장 성공률을 검증한 것은 아니다.
- `npx --no-install tsc -b`와 `npm --prefix mewlink run check`가 통과했다. 전체 `npm run lint`는 오류 없이 종료했으며 작업 범위 밖의 기존 경고가 남았다. Impeccable `detect`는 빈 배열을 반환했다.
- `npm run check:docs`는 description 508개에서 오류가 없었다. 전체 링크 검사는 작업 전부터 삭제된 기능 MOC·태스크 문서의 기존 링크 18건으로 실패했다. 기존 `documentLinkErrors`로 이번 변경 문서 5개를 별도 검사한 결과 링크 오류는 없었다. 변경 TypeScript 대상 oxlint와 `git diff --check`도 통과했다.

## 적용과 제한

앱·중앙 빌드·배포, 실행 중 서버의 시작·종료·재시작은 수행하지 않았다. 변경된 브라우저 연결 제어기를 포함하는 Mewlink 런처의 반영은 사용자가 수행한다. 실제 휴대폰 절전·LTE·망 전환에서의 복구 성공률과 운영 증상의 원인은 미검증이다. 5초는 초기 정책값이며 실제 단절이 지속될 때는 새 연결 시작이 그만큼 늦어질 수 있다.
