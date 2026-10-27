---
title: "mew 문서 탐색 진입점"
description: "AI가 Mew 자체의 지침·문서 규칙을 읽고 description 목록에서 현재 문서를 고르는 순서와 선택적 Graphify 로컬 코드 관계 조회·원문 확인 경계를 안내한다."
created: "2026-10-06"
updated: "2026-10-27"
---

프로젝트 [README](../README.md)와 [AGENTS](../AGENTS.md), [문서 규칙](README.md), [실행·검증 규칙](development/getting-started.md)을 읽는다. Mew 자체의 지침이 기준이며 부모 워크스페이스 문서의 탐색·갱신은 요구하지 않는다.

저장소 루트에서 `node server/document-descriptions.ts`로 문서 경로와 description을 확인한 뒤 관련 본문만 선택한다. 현재 결정은 `decisions/`, 과거 근거는 필요할 때만 `history/`에서 확인한다. MOC 탐색·등록 의무는 없다. 코드·기능·운영을 바꾸면 해당 소유 문서와 description을 같은 작업에서 갱신하고 `npm run check:docs`로 검사한다.

코드 간 호출·참조·변경 영향을 찾을 때는 `node tools/graphify.mjs status`로 로컬 코드 그래프를 확인하고,
준비되어 있으면 `node tools/graphify.mjs query "searchCatalog"`처럼 식별자·경로로 후보를 좁힌다.
`explain "exactSearchCandidates"`, `path "exactSearchCandidates" "server/searchCatalog.ts::openDatabase()"`,
`affected "exactSearchCandidates"`도 지원한다. 결과의 파일·줄을 현재 원문에서 확인한 뒤 판단한다.
모호한 이름은 출력된 node ID로 다시 조회한다. 그래프가 없거나 오래됐으면 `index`로 갱신하거나 기존 `rg`를 사용한다.
설치·대상 범위·제약은 [검색 설정](configuration/search.md#로컬-코드-관계-탐색)이 소유한다.
문서는 계속 description으로 탐색하며, 이 도구를 다른 프로젝트의 기본 안내로 배포하지 않는다.
