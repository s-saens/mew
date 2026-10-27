---
title: "철회한 Graphify 실험 소스"
description: "2026-10-27 철회한 Graphify 로컬 검색 wrapper·테스트·비교 도구·고정 과제의 원본 보존 위치. 현재 실행 도구가 아니며 당시 파일 배치와 격리 환경이 필요한 과거 재현 자료다."
created: "2026-10-27"
updated: "2026-10-27"
---

## 상태

[결정 0080](../../decisions/0080-retire-graphify-search.md)에 따라 현재 검색 연동에서 제거한 실험 소스다.
활성 CLI·설치 지침·에이전트 안내로 사용하지 않는다. 코드 내용은 이동 전과 동일하게 보존했다.

- [당시 wrapper](graphify.mjs)와 [검증 코드](graphify.test.mjs)
- [측정 도구](graphify-benchmark.mjs)와 [집계·판정 테스트](graphify-benchmark.test.mjs)
- [소스에서 정한 과제 24개](graphify-benchmark-cases.json)

## 과거 실험 재현

스크립트는 원래 `tools/` 아래와 저장소 루트의 `.data/graphify/venv/`를 기준으로 작성됐다.
이 위치에서 직접 실행하면 당시의 경로·설치 환경을 재현하지 못한다.
과거 실험을 다시 검증할 때만 별도 격리 체크아웃에서 `a6fbb26`의 원래 `tools/` 배치를 복원하고,
당시 고정 Python 패키지·토크나이저를 준비한다. 현재 체크아웃의 제거 상태나 에이전트 지침을 되돌리지 않는다.

검증 당시 명령은 `node tools/graphify-benchmark.mjs .data/benchmarks/<새 실행명> 5`였으며,
원본 실행 당시 소스·해시·stdout·stderr·그래프는 Git 제외 `.data/benchmarks/graphify-20261027/`에 보존한다.
보존한 사본의 Python 가상환경 연결은 제거했으므로 재현 시 별도 환경이 필요하다.
현재 파일을 색인하는 명령을 운영 기본값으로 등록하지 않는다.

[측정 결과](../../research/graphify-search-benchmark.md)와 [도입·철회 기록](../../work/graphify-code-search.md)을 참고한다.
