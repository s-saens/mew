---
title: "문서 기본 지침 설정 구현·검증"
description: "문서 기본 지침 7개 항목, 기존 계정의 비파괴 이전, 설정창과 API 검증 결과 및 운영 적용 전 상태를 기록한다."
created: "2026-10-26"
updated: "2026-10-26"
---

2026-10-26 구현 기록. 현재 명세는 [기본 지침 사용법](../../../docs/guides/project-setup.md#문서-지침)과 [세션 계약](../development/agent-sessions.md), 선택 근거는 [결정 0073](../decisions/0073-documentation-guidance-options.md)을 따른다.

## 목적과 구현

기준 문서 갱신·ADR·작업 및 검증 기록·작성 방식·description·링크·문서 검사를 각각 공통 기본 지침으로 적용하거나 프로젝트 지침에 맡길 수 있게 했다. 새 계정에는 설정 구간을 포함한 템플릿을 사용하고, 기존 계정에는 요청 시에만 기본값을 보충한다.

이전 기본 템플릿과 정확히 일치하는 고정 문서 갱신 문구는 전달 시 설정형 지침으로 바꾼다. 저장 파일·직접 편집한 문구·설정 구간·코드 예시는 보존한다. UI는 기존 설정창과 SelectField를 재사용하고 접힌 문서 그룹에 항목을 모았다.

## 검증

- `node --test server/agent-guidance.test.ts server/agent-guidance-ui.test.ts server/agent-account-settings.test.ts server/agent-context.test.ts`: 31개 통과. 기본값·개별 선택·revision·계정 분리·기존 및 손상·직접 편집 지침 보존과 요청 반영을 확인했다.
- `node --test server/agent-guidance.test.ts`: 24개 통과. 빈 저장 파일·CRLF·이전 메타데이터 문구의 읽기 시 이전도 확인했다.
- `node --test server/agent-guidance-ui.test.ts`: 통과. 1100px 데스크톱과 390·320px 터치 화면에서 7개 항목의 변경·재조회·직접 편집 항목 대체, 다크·라이트 드롭다운의 화면 경계와 기존 포커스·충돌 처리를 확인했다. 앱 번들·서버 없이 격리 브라우저 픽스처를 사용했다.
- `npx tsc -b`와 변경 TypeScript·TSX 파일의 scoped oxlint 통과.
- 전체 description 검사 483개 통과. 변경 문서 4개의 로컬 링크 오류는 0개다. `npm run check:docs` 전체 검사는 이번 작업 밖의 기존 문서 이동·삭제에 따른 링크 오류 17개로 실패했다.

## 운영 적용과 제한

앱 빌드·배포·서버 시작·재시작은 수행하지 않았다. 운영 적용은 사용자가 수행한다. 지침은 에이전트 안내이며 문서 작성·검사를 강제하는 실행 게이트는 아니다. 기존 프로젝트 규칙과 이미 생성한 프로젝트 문서는 바꾸지 않았다.
