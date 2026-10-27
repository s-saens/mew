---
title: "Graphify 로컬 코드 탐색 적용"
description: "2026-10-27 Graphify 0.9.96을 Mew 소스의 에이전트 보조 검색에 적용한 기록. 색인·조회 실측, 자동 검사 결과와 파서·비교 평가·제품 미통합 범위를 구분한다."
created: "2026-10-27"
updated: "2026-10-27"
---

## 목적과 결과

기존 검색과 description 문서 탐색을 유지하면서 코드 호출·참조·변경 영향을 조회하는 CLI를 추가했다.
현재 명령과 대상·최신성 검사는 [검색 설정](../configuration/search.md#로컬-코드-관계-탐색),
도입 범위는 [결정 0077](../decisions/0077-local-code-graph.md)이 소유한다.

2026-10-27 Linux·Python 3.11.15에서 `graphifyy==0.9.96`을 프로젝트 로컬 가상환경에 설치하고,
Mew 소스 899개·약 6.55MB를 대상으로 최초 AST 분석을 실행했다.
원시 그래프는 노드 8,228개·관계 25,948개였고, CLI가 측정한 분석 구간은 14,515ms였다.
이 시간에는 가상환경·패키지 설치와 소스 선택·사본 생성이 포함되지 않는다.
이후 코드 변경으로 재색인한 세대의 수치는 달라질 수 있다.

## 검증

초기 실코드에서 `query "searchCatalog getIndexedSearchCandidates"`가 `server/searchCatalog.ts`와
`exactSearchCandidates`·`openDatabase` 등 관련 심볼을 반환했다.
1,500토큰 제한으로 일부 노드가 잘렸으며 개별 심볼 조회로 좁힐 필요를 확인했다.
존재하지 않는 `getSearchIndexCandidates` 조회는 종료 코드 4를 반환했다.

- 최종 세대는 899개 파일·노드 8,229개·관계 25,952개였고 분석 구간은 12,417ms였다.
  `status`의 `stale: false`와 동일 파일의 재색인 시 같은 세대 재사용을 확인했다.
- `explain "exactSearchCandidates"`로 파일·줄과 호출·참조를 확인했다.
  `path "exactSearchCandidates" "server/searchCatalog.ts::openDatabase()"`는 호출 한 단계,
  `affected "exactSearchCandidates"`는 `indexedSearchPaths`·`createApiApp` 등 영향을 반환했다.
  `openDatabase`만 지정하면 동명 심볼 두 개와 종료 코드 3을 반환해 경로로 구분했다.
- `query "exactSearchCandidates"`는 58개 노드와 191개 관계를 반환했다.
  upstream의 1,500토큰 예산이 엄격한 상한이 아니며 약 7,617토큰 추정 출력으로 초과할 수 있음을 확인했다.
- `node --test tools/graphify.test.mjs`: 테스트 4개 통과, 실패·건너뜀 없음.
  임시 Git 저장소에서 코드·데이터·심볼릭 링크 경계, 수정·추가·삭제 해시,
  실제 Graphify 색인·query·explain·path·affected, 오래된 그래프 거부,
  미일치 종료 코드·오류 메시지, 실패 시 기존 그래프 보존, 손상된 상태 복구,
  사용자 `GRAPHIFY_OUT`의 외부 출력 경로 덮어쓰기를 검사했다.
- `npx oxlint tools/graphify.mjs tools/graphify.test.mjs`, `node --check tools/graphify.mjs`,
  `git diff --check` 통과.
- `npm run check:docs`: description 493개는 오류 0개였으나 기존 링크 오류 17개로 실패했다.
  적용 전에도 같았던 `docs/features/MOC.md` 삭제 관련 16개와 삭제된 태스크 링크 1개이며 이번 범위에서는 수정하지 않았다.
  프로젝트의 `readDescription`·`documentLinkErrors`로 변경 문서 4개의 description과 링크를 따로 확인해 오류가 없었다.

## 남은 조건

초기 분석은 `capture-macos.h`·`virtual-display-lease.h`의 문법을 일부만 해석했고,
14개 파일은 re-export·데이터 선언 등으로 심볼이 없다는 경고를 냈다.
Graphify의 동적 호출·외부 라이브러리 관계 해석을 완전하다고 간주하지 않는다.

질문 20~30개를 이용한 정답 파일 발견률·전체 탐색 시간·토큰 사용량 비교는 수행하지 않았다.
기존 검색보다 빠르거나 정확하다는 개선율은 미검증이다.
앱 빌드·서버 시작·종료·재시작·배포·제품 검색 API·공유 MCP 연결은 수행하지 않았다.
