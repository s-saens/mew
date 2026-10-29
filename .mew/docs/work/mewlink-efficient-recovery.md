---
title: "Mewlink 연결 복구의 비용과 대기 시간 개선"
description: "2026-10-29 호스트 heartbeat 감지 단축, 경량 presence API와 원인별 브라우저 재시도·표시·인증 본문 제한 구현, 격리 검증과 비공개 중앙 소스·운영 미적용 범위를 기록한다."
created: "2026-10-29"
updated: "2026-10-29"
---

## 목적과 결과

[최초 호스트 감시 수정](mewlink-host-heartbeat.md)에서 남은 긴 무응답 대기와, 꺼진 호스트를 기다리는 동안 반복되는 전체 RTC 준비 비용을 줄였다. 정책 선택은 [ADR 0086](../decisions/0086-mewlink-recovery-efficiency.md), 현재 동작은 [원격 접속 계약](../development/remote-access.md#시그널링-순단의-같은-rtc-재부착)이 소유한다.

호스트는 기존 heartbeat 간격을 유지하면서 짧은 응답 기한과 한 번의 재확인으로 죽은 WSS를 정리한다. 브라우저는 원본 오류 코드를 보존하고 명시적 오프라인이면 presence만 조회한다. 온라인 전환 뒤에 새 bootstrap을 수행하며 기존 앱·초안을 보존한다. 화면·네트워크 상태에 따라 전체 복구를 멈추거나 재개하고, 복구 인증의 응답 본문까지 제한 시간 안에 읽는다. 일반 RTC 순단의 자연 복구와 기존 권한·lease 검증은 유지한다.

## 검증

- 호스트 heartbeat·시작·등록·backoff와 브라우저 연결·복구 정책·전송의 관련 Node 테스트 7개 파일: 149개 통과. 정상 heartbeat·재전송·절전 뒤 지연 타이머·송신 오류·종료 정리, 기존 RTC 보존과 원본 오류 코드 전달을 확인했다.
- 중앙 presence·bootstrap·rate limit·Worker 테스트 4개 파일: 38개 통과. 온라인 여부·등록 회수·인가 경계·캐시 방지·IP 한도와 launch·관리 세션 작업 생략을 확인했다.
- `startup.browser.test.ts` 23개와 `connection-screen.browser.test.ts` 1개: 총 24개 통과. 정상 첫 접속의 presence 0회, 오프라인 경량 조회·초안 보존·탭/망 복귀·인증 본문 10초 취소·늦은 응답 폐기·최초 인증 복구·구중앙 HTTP 헤더/본문 취소·명시적 인증 거부 중단을 확인했다. 상태 안내는 실제 런처 CSS로 390/1100px·밝은/어두운 테마에서 배치·줄바꿈·입력 비차단을 검사하고 캡처했다.
- `npx tsc -b`, 중앙 `npm run check`, 변경 TypeScript 13개 파일의 oxlint: 통과. 변경 UI의 Impeccable 정적 검사도 오류 없이 통과했다.
- `npm run check:docs`는 기존 `docs/지원서.md`의 frontmatter 누락으로 실패했다. 별도 `node server/document-links.ts --all`도 기존 README·기능·태스크 링크 오류 19개로 실패했다. 변경 문서 8개의 description·로컬 링크 대상은 기존 검사 함수로 별도 확인해 통과했다.

presence 검사는 실제 Workers/D1/DO fixture, 브라우저 검사는 모의 bootstrap·transport와 실제 Chromium을 사용한다. 시간 제한은 가상 시각으로 검증하며 실제 외부망 성능 측정이 아니다.

## 적용과 남은 범위

앱 빌드·배포·런처 실행·운영 서버 시작·종료·재시작은 하지 않았다. 호스트 코드는 서버 적용이, presence·브라우저 복구는 중앙 런처 빌드와 Worker 배포가 필요하다. 중앙이 아직 구버전이면 presence 404에 기존 전체 재연결로 복귀한다. 실제 절전·외부망 전환·제한 네트워크 검증은 남아 있다.

`mewlink/`는 부모 Git에서 제외한 비공개 소스이며 별도 저장소도 없다. `worker.ts`·`connection-parent.ts`·`central-request.ts`·`launcher.css`와 해당 Worker·브라우저 테스트의 로컬 수정은 보존하지만 부모 저장소에 강제로 추가하지 않는다. 비공개 폴더 백업과 배포는 별도로 수행해야 한다. 공개 소스·회귀 검사·소유 문서·결정 기록만 부모 Git 커밋에 포함한다.
