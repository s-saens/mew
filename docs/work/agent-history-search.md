---
title: "에이전트 히스토리 주제 검색 구현·검증"
description: "세션 ID 입력을 로컬 주제·본문·ID 검색으로 바꾼 구현과 저장 시 색인·외부 CLI·Worker 처리, 서버·격리 UI·타입·린트 검증 결과와 기존 문서 링크 오류·운영 미적용 범위를 기록한다."
created: "2026-10-28"
updated: "2026-10-28"
---

2026-10-28 작업 기록. 현재 계약은 [세션 계약](../development/agent-sessions.md#히스토리-검색)과 [대화 기능 문서](../features/터미널·에이전트·자동화/에이전트%20대화·큐·복원.md#히스토리-검색), 사용법은 [터미널·에이전트 안내](../guides/terminal-agents.md#대화-진행과-기록), 선택 근거는 [결정 0083](../decisions/0083-agent-history-search.md)을 따른다.

## 목적과 결과 동작

세션 ID를 기억하지 않아도 대화 주제·내용으로 지난 기록을 찾도록 한다. 기존 ID 입력을 한 검색칸으로 바꾸고, 제목·본문 발췌·날짜를 확인해 결과를 선택한다. ID의 정확한 일치·부분 일치도 같은 검색 경로를 사용한다. 검색 요청과 대화 복원을 분리하고 기존 점유·진행 작업·승인·큐 제한을 유지한다.

Mew 전사는 저장 시 로컬 SQLite 검색 색인을 갱신하며 기존 전사는 검색할 때 보강한다. Codex·Claude 외부 CLI의 JSONL 기록은 줄 단위로 읽고 파일 변경 여부로 재사용한다. 실행 안내를 제외한 본문 검색·색인 보강은 계정 컨텍스트를 전달한 재사용 Worker에서 처리하며, 일부 소스 실패 때도 성공한 검색 결과는 보여 준다. 띄어쓰기·대소문자 정규화와 주요 기능의 한영 동의어를 사용하고 외부 임베딩 API나 모델은 추가하지 않는다.

## 검증

- `node --test`로 `agentWs.test.ts`·`agentSessionList.test.ts`·`agent-session-search.test.ts`·`agent-session-search-service.test.ts`·`agent-transcript-search.test.ts`·`agentTranscript.test.ts`·`agent-runtime-history-search.test.ts`의 7개 서버 테스트 파일을 함께 실행해 60개가 통과했다. 세션 ID·본문·동의어 검색, 증분 저장·기존 전사 보강, CLI 기록의 범위·캐시, WS·Worker 통합을 포함했다.
- `server/agent-history-preview-ui.test.ts`와 `server/agent-history-ui.test.ts`가 통과했다. 격리 Chromium의 1100·390px 화면과 밝은·어두운 테마에서 검색·선택·기존 복원을 확인했다. IME 조합 중 검색 대기와 부분 실패 후 재검색을 추가한 최종 preview 검사도 다시 실행해 통과했다.
- `npx tsc -b`가 통과했다. 대상 oxlint는 오류 0개였으며 기존 React 경고는 남아 있다. 변경 UI의 Impeccable `detect` 결과는 빈 배열이었다.
- 변경 문서의 `git diff --check`가 통과했다.
- 최종 `npm run check:docs`의 description 검사 519개는 오류 0개였다. 전체 링크 검사는 작업 전부터 삭제된 `docs/features/MOC.md`의 들어오는 링크 16개와 삭제된 태스크 문서 링크 2개, 총 18개 오류로 실패했다. 해당 작업 외 파일은 수정하지 않았다.
- 기존 `documentLinkErrors` 검사로 이번 변경 문서 5개를 별도 확인했으며 로컬 링크 오류는 0개였다.

도구 결과가 포함된 합성 12MiB 전사의 최초 색인 보강은 95.7ms, 변경 없는 재검색은 1.2ms로 관측했다. 담당 에이전트의 로컬 단일 관측이며 실제 보유 대화 전체나 운영 응답 시간의 측정값은 아니다.

## 운영 적용과 제한

앱 빌드·배포·서버 시작·종료·재시작은 수행하지 않았다. 변경의 운영 적용은 사용자가 수행한다. 임의의 의미 추론과 동의어 사전 밖의 관계를 찾는 벡터 검색은 포함하지 않으며, 실제 보유 대화 전체의 검색 회수율은 측정하지 않았다.

외부 JSONL의 개별 줄이 8Mi 문자를 넘으면 해당 줄은 건너뛴다. 외부 파일이 바뀌면 바이트 위치에서 이어 읽지 않고 그 파일을 다시 색인한다. 변경 없는 파일은 수정 시각·크기로 재사용한다.
