---
title: "프로젝트 검색"
description: "파일명·내용 검색과 치환의 범위·와일드카드·RE2 정규식·제한, description 문서 탐색과 제거된 RAG의 경계를 설명한다. Mew 소스 전용 Graphify의 설치·조회·갱신·대상 범위, 연결 경로의 해석과 성능 비교 재현을 안내한다."
updated: "2026-10-27"
상위파일:
  - "../MOC.md"
  - "MOC.md"
---
[설치·실행](../guides/getting-started-ko.md)

## 파일명·내용 검색과 치환

1. `Ctrl+P`는 파일명 검색, `Ctrl+Shift+F`는 파일 내용 검색을 연다. 사이드바의 돋보기·문서 돋보기 탭으로도 전환한다.
2. 검색어를 입력한다. `Aa`는 대소문자 구분이다. 파일명 검색에서 `*.exe`처럼 `*`·`?`를 입력하면 자동으로 와일드카드를 적용한다(`*`: 0개 이상, `?`: 문자 하나). 파일명 또는 상대 경로 전체를 대조하고 나머지 문자는 그대로 취급한다. 와일드카드가 없으면 기존 퍼지 검색이다. 내용 검색도 옵션 없이 `*`·`?`를 와일드카드로 해석하며 같은 줄의 부분 문자열을 찾는다. 두 검색 모두 `.*` 옵션을 켜면 입력을 정규식으로 해석한다. 와일드카드가 없는 내용 검색은 일반 문자열 검색이다.
3. 입력줄에서 `@`로 Documents·직계 하위 프로젝트를 하나 이상 선택한다. 여러 범위는 합쳐 검색하고, 선택이 없으면 현재 루트 전체를 검색한다.
4. 결과를 누르면 파일 또는 해당 줄로 이동한다. 내용 검색의 바꾸기 입력줄을 펼치면 파일별 또는 전체 결과를 치환할 수 있다. 일괄 치환은 파일 내용을 바꾸고 Git 커밋도 만들므로 범위와 검색어를 확인한다.

파일명 결과는 상위 50개이며 내용 검색도 결과가 많으면 일부만 표시될 수 있다. 인덱스 준비·장애 중에는 원문 검색으로 보완한다. 상세 범위·표시는 [파일 검색 스펙](../features/%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%C2%B7%ED%8C%8C%EC%9D%BC%C2%B7%EA%B2%80%EC%83%89/%ED%8C%8C%EC%9D%BC%EB%AA%85%C2%B7%EB%82%B4%EC%9A%A9%20%EA%B2%80%EC%83%89%EA%B3%BC%20%EC%B9%98%ED%99%98.md)을 따른다.

서버의 파일명·본문 정규식과 치환은 RE2 호환 구문을 사용한다. 전방·후방 탐색(`(?=...)`, `(?<=...)` 등)과 패턴 안의 역참조(`\1` 등)는 오류로 거부한다. 치환 문자열의 `$1`·`$<name>` 캡처 참조는 지원한다. 정규식은 유니코드 문자 단위로 대조하며, 검색·치환 패턴은 2,000자와 컴파일된 명령 10,000개를 넘을 수 없다. 이 제한은 서버 검색·치환에 적용한다. 엔진 선택의 근거는 [선형 시간 검색 결정](../decisions/0036-linear-search-regex.md)을 따른다.

## 문서 탐색

에이전트는 README·지침을 확인한 뒤 각 문서의 YAML `description`과 경로로 필요한 범위를 정하고 관련 본문만 읽는다. `node server/document-descriptions.ts`는 본문을 출력하지 않는 목록을 만들며 MOC 등록은 필요하지 않다. [문서 규칙](../README.md)을 따른다. RAG 패널·API·로컬 CLI·모델·색인·자동 안내는 [ADR 0176](../history/decisions/0176-mew-remove-local-rag.md)에 따라 제거했다. 이전 브라우저의 독 순서에 남은 RAG는 무시하며 다른 항목 순서를 유지한다.

기존 설치의 `MEW_DATA_DIR/rag/`와 `rag-settings.json`은 더 이상 읽거나 갱신하지 않는다. 실행 중인 설치의 데이터를 자동 삭제하지 않으며, 제거 버전을 적용한 뒤 필요하면 해당 잔여 파일만 정리할 수 있다. 사용자 요청 없이 RAG를 다시 도입하거나 색인·모델 다운로드를 재시도하지 않는다. [과거 운영 기록](../history/rag-operations.md)·[측정 결과](../research/document-discovery-benchmark.md)는 이력으로 보존한다.

## 로컬 코드 관계 탐색

Mew 소스 저장소의 에이전트는 [Graphify](https://github.com/Graphify-Labs/graphify)를 선택적으로 사용해
함수·파일의 호출·참조와 변경 영향을 찾을 수 있다. 앱의 파일명·본문 검색 API와는 별도의 개발 도구다.
Python 패키지 `graphifyy==0.9.96`을 `.data/graphify/venv/`에 격리 설치한다. `uv`와 Python 3.10 이상이 필요하다.
저장소 루트에서 실행한다.

```bash
node tools/graphify.mjs setup
node tools/graphify.mjs index
node tools/graphify.mjs status
node tools/graphify.mjs query "searchCatalog"
node tools/graphify.mjs explain "exactSearchCandidates"
node tools/graphify.mjs path "exactSearchCandidates" "server/searchCatalog.ts::openDatabase()"
node tools/graphify.mjs affected "exactSearchCandidates"
```

`setup`만 패키지 다운로드가 필요하며,
색인·조회는 `--code-only --no-cluster`의 로컬 AST 분석을 사용한다. LLM·API 키·임베딩·별도 DB·서버가 필요하지 않다.
전역 런타임 설정과 Git hook은 바꾸지 않으며, 조회 질문의 Graphify 로그 저장도 끈다.

색인은 Git에 추적된 파일과 ignore되지 않은 새 파일 중 `src/`, `server/`, `packages/`, `apps/cli/`, `tools/`,
`native/` 및 루트의 지원 코드·`package.json`·`tsconfig*.json`을 대상으로 한다.
테스트·fixture·vendor·의존성·빌드·숨김 경로와 심볼릭 링크는 제외한다.
선택한 현재 작업 파일을 임시 소스 사본으로 만든 뒤 분석하므로 문서·대화·계정 데이터는 색인에 포함하지 않는다.
지원 확장자와 제외 규칙의 구현은 `tools/graphify.mjs`의 `isSourceFile`이 소유한다.

`index`는 파일 경로·내용의 SHA-256이 같으면 기존 그래프를 재사용한다. 변경·추가·삭제가 있으면 전체를 다시 분석하고,
완성된 세대로 가리키는 파일을 원자적으로 교체한다. 분석 실패 시 이전 그래프는 유지한다.
조회 전 같은 해시로 최신 여부를 검사하며, 오래됐으면 결과를 반환하지 않으므로 `index` 후 다시 조회한다.
자동 감시·재색인은 하지 않는다. 그래프·소스 사본·패키지는 기존 Git 제외 경로인 `.data/graphify/`에만 둔다.
과거 성공 세대는 진행 중 조회를 보호하기 위해 보존한다. 사용하지 않을 때 `.data/graphify/index-*`와
`current.json`을 함께 지우면 파생 색인을 정리할 수 있고, 다음 사용 전 `index`를 실행한다.

`query`는 영어 식별자·경로를 출발점으로 관계를 탐색하며 출력 목표 예산은 1,500토큰이다.
upstream은 노드가 모두 예산에 들어오면 연결 관계를 전부 출력해 이 값을 초과할 수 있다.
자연어 질문을 모델로 해석하지 않으므로 한국어 질문은 코드 식별자·경로로 좁혀 사용한다.
이름이 모호하면 `경로::심볼()` 또는 후보 node ID를 사용한다. 종료 코드 `3`은 모호함, `4`는 일치하는 노드 없음이다.
그래프의 `source_file`·줄 번호와 추출·추론 관계는 탐색 근거이며 정답을 보장하지 않는다.
현재 원문을 확인하고, 빠진 관계나 잘린 결과는 `rg`와 개별 심볼 조회로 보완한다.
네이티브 헤더처럼 파서가 일부만 해석하는 파일도 있을 수 있다.

이 설정은 Mew 소스의 로컬 에이전트용이다. 다중 사용자 검색 API·공유 MCP로 공개하거나 다른 작업 공간을
자동 색인하지 않는다. 제품 통합에는 별도의 권한·갱신 설계와 결정이 필요하다.
[선택 근거](../decisions/0077-local-code-graph.md)와 [적용·검증 기록](../work/graphify-code-search.md)을 참고한다.

2026-10-27의 [24개 과제 비교](../research/graphify-search-benchmark.md)에서는 일반 `query`가 `rg`보다 느렸고 출력도 늘었다.
정의·영향 조회의 출력 감소는 과제별로 달랐다. `path`는 포함·import 관계도 연결하므로 호출 순서로 해석하지 말고
간선 종류와 원문을 확인한다. 일반 검색을 대체하는 성능 개선은 이 측정에서 확인하지 못했다.
`node tools/graphify-benchmark.mjs .data/benchmarks/<새 실행명> 5`로 비교를 재현할 수 있다.
이때 `rg`와 `tiktoken`이 설치된 `python3`가 필요하며, Python은 `MEW_GRAPHIFY_TOKENIZER_PYTHON`으로 바꿀 수 있다.

## 제거 검증

2026-09-28: 독·패널·컨텍스트·일반 검색·협업 회귀 검사 31개를 통과했다. 타입 검사와 린트(기존 경고), 문서 배치·링크 검사도 통과했다. 실행 중인 서비스의 빌드·재시작과 실서비스 반영은 포함하지 않는다.
