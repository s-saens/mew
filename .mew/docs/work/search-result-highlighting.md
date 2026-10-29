---
title: "검색 결과의 일치 구간 표시 수정"
description: "2026-10-28 긴 줄과 좁은 사이드바에서 검색어가 가려지는 문제를 수정한 기록. 검색어 중심 미리보기와 강조 표시, 회귀·격리 UI 검증 결과 및 운영 미적용 범위를 남긴다."
created: "2026-10-28"
updated: "2026-10-28"
---

## 목적과 결과

내용 검색 결과에서 검색어가 어디 있는지 확인할 수 있도록 한다. 기존 서버는 긴 줄의 앞 400자만 보내 이후 매치의 강조 구간이 비었고, 브라우저는 앞 문맥부터 표시해 좁은 행에서 검색어가 가려졌다.

JSON·SSE 검색이 각 매치 주변의 미리보기를 만들고 미리보기 기준 강조 범위와 원문 열 위치를 분리하도록 수정했다. 결과 행은 앞 문맥의 너비를 제한하고 매치를 배경색과 굵은 글씨로 표시한다. 상세 계약은 [파일명·내용 검색과 치환](../features/%ED%94%84%EB%A1%9C%EC%A0%9D%ED%8A%B8%C2%B7%ED%8C%8C%EC%9D%BC%C2%B7%EA%B2%80%EC%83%89/%ED%8C%8C%EC%9D%BC%EB%AA%85%C2%B7%EB%82%B4%EC%9A%A9%20%EA%B2%80%EC%83%89%EA%B3%BC%20%EC%B9%98%ED%99%98.md)이 소유한다.

## 검증과 적용

- 기존 구현에서 새 회귀 테스트 2개가 실패해 긴 줄의 빈 강조 구간을 재현했다.
- `node --test server/search.test.ts server/search-panel-ui.test.ts`: 수정 후 14개 통과. 한글·emoji가 포함된 긴 문맥, 500자 들여쓰기, 한 줄 복수 매치, 원문 열 위치와 JSON·SSE 일치를 확인했다.
- `MEW_UI_SCREENSHOTS=/tmp/mew-search-highlighting-check node --test server/search-panel-ui.test.ts server/search-pattern.test.ts server/searchApi.test.ts server/searchCatalog.test.ts`: 12개 통과. 격리 Chromium의 1100px 미드나이트·390px 밝은 테마에서 240px 검색 패널의 강조 구간이 행 안에 보이고 클릭 시 원문 위치 정보가 유지되는지 검사했다. 두 화면의 캡처도 확인했다. 검색 응답은 fixture를 사용했다.
- `npx tsc -b`와 변경 TypeScript 파일 5개의 `npx oxlint`: 통과.
- `npm run check:docs`: description 검사는 통과했다. 전체 링크 검사는 이번 작업 전부터 삭제된 기능 MOC와 태스크 문서의 링크 18건 때문에 실패했다. 이번 변경 문서에는 해당 오류가 없다.

앱 빌드·배포·서버 시작·종료·재시작은 수행하지 않았다. 실행 중인 인스턴스 적용은 사용자가 빌드 후 수행해야 하며, 실기기·실서비스 화면은 검증하지 않았다.
