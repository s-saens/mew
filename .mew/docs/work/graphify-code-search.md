---
title: "Graphify 로컬 코드 탐색 적용"
description: "2026-10-27 Graphify 로컬 보조 검색의 도입·측정·철회 기록. 비교 근거와 과거 소스를 보존하고 활성 CLI·안내·가상환경·색인 제거 및 검증을 현재 제품 기능과 구분한다."
created: "2026-10-27"
updated: "2026-10-27"
---

현재 연동은 제거됐다. 아래의 도입·측정 결과는 당시 기록이며 현재 설치·실행 상태를 뜻하지 않는다.

## 목적과 결과

기존 검색과 description 문서 탐색을 유지하면서 코드 호출·참조·변경 영향을 조회하는 CLI를 추가했다.
당시 명령·검증 소스는 [이력](../history/graphify/README.md)에 보존한다.
[도입 결정 0077](../decisions/0077-local-code-graph.md)은 [철회 결정 0080](../decisions/0080-retire-graphify-search.md)이 대체한다.

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

초기 적용에서는 질문 20~30개의 비교를 수행하지 않았다. 이후 아래의 24개 과제로 도구 조회를 비교했으며,
실제 에이전트의 전체 탐색 시간·누적 토큰·답변 정확도는 여전히 미검증이다.
앱 빌드·서버 시작·종료·재시작·배포·제품 검색 API·공유 MCP 연결은 수행하지 않았다.

## 후속 성능 비교

2026-10-27 [고정 과제](../history/graphify/graphify-benchmark-cases.json)와 [측정 도구](../history/graphify/graphify-benchmark.mjs)를 추가했다.
현재 파일과 운영 인스턴스를 바꾸지 않는 분리된 소스 사본에서 `rg`·기본 `query`·유형별 전용 조회를
24개 과제·5회씩 실행했다. [측정 결과](../research/graphify-search-benchmark.md)가 수치·절차·한계를 소유한다.
기본 `query`의 속도·출력량 개선은 확인하지 못했고, 구조 연결을 호출 경로로 오해할 수 있는 한계도 확인했다.

`node --test tools/graphify-benchmark.test.mjs tools/graphify.test.mjs`는 10개를 통과했다.
중앙값·백분위·경로 오인 방지·top10 파일 포함률·실제 `rg` 검색 범위·호출 간선 분류를 검사하고,
기존 Graphify 실제 색인·조회·최신성·실패 복구 회귀 검사도 다시 실행했다.
모든 반복의 출력·종료 코드를 대조해 결과가 동일함을 확인했고, 경로 원출력 8개는 소스 근거와 별도로 검토했다.

`npx oxlint tools/graphify-benchmark.mjs tools/graphify-benchmark.test.mjs`와 두 파일의 `node --check`,
`git diff --check`를 통과했다. `npm run check:docs`는 description 498개 오류 0개였지만,
이번 변경과 무관한 기존·병행 작업의 링크 오류 18개로 실패했다.
변경 문서 3개의 description·내부 링크는 기존 검사 함수를 이용해 별도로 확인했다.

## 검색 연동 철회

2026-10-27 [결정 0080](../decisions/0080-retire-graphify-search.md)에 따라 활성 `tools/graphify*` 5개를
[과거 소스](../history/graphify/README.md)로 내용 변경 없이 이동하고, 에이전트 진입점의 실행 안내를 제거했다.
검색 설정은 제거 상태와 측정 이력만 안내한다. 별도의 회귀 검사로 활성 도구·자동 안내의 부재와 과거 근거 보존을 확인한다.

이 실험에서 설치한 `.data/graphify/`의 가상환경·활성 색인·파생 소스 약 243MB를 제거했다.
제거 전 해당 가상환경을 사용하는 프로세스가 없음을 확인했다.
원시 측정 자료 `.data/benchmarks/graphify-20261027/`는 보존하고, 그 안에서 제거한 가상환경을 가리키던 링크만 정리했다.
전역 설치·설정·공유 패키지 캐시·다른 프로젝트의 환경은 변경하지 않았다.

`server/search-guidance.test.ts`·`server/search.test.ts`·`server/document-descriptions.test.ts`·
`server/document-links.test.ts`·이력의 `graphify-benchmark.test.mjs`에서 테스트 24개를 통과했다.
변경 테스트 린트와 `npx tsc -b`를 통과했다. `npm run check:docs`는 description 504개 오류 0개였지만,
이번 범위 밖 링크 오류 18개로 실패했다. 변경 문서 7개의 description·내부 링크는 별도 검사에서 오류가 없었다.
병행 작업의 공백 오류와 분리해 이번 변경 경로만 `git diff --check`로 확인했다.

Git diff 영향 후보·에이전트 첨부 제안·문서 개념 관계의 가능성은
[연구 기록](../research/graphify-search-benchmark.md#다른-활용의-검토-후보)에 미검증 후보로 정리했다.
이번 철회·검토에서 제품 UI·새 분석 기능을 구현하거나 앱 빌드·서버 재시작·배포를 수행하지 않았다.
