---
title: "공개 소개와 작업 공간의 검색 정책"
description: "설치된 Mew 작업 공간의 noindex·robots 응답과 직접·개발·P2P 접속의 적용 범위를 안내한다. 제품 사이트 노출 계획·날짜별 진단은 별도로 연결한다."
created: 2026-10-23
updated: "2026-10-29"
---

# 공개 소개와 작업 공간의 검색 정책

Mew 호스트는 문서·코드·에이전트를 다루는 작업 공간이다. 검색 유입을 받을 공개 제품 소개와 설치된 작업 공간을 구분한다. 제품의 현재 공개 원출처는 [공식 저장소 README](https://github.com/s-saens/mew#readme)이며, Mewlink의 역할은 [프로젝트 소개](../../README.md#open-it-from-another-device)와 [도메인 결정](../../.mew/docs/decisions/0005-mewlink-domain-and-private-dashboard.md)을 따른다.

## 작업 공간의 현재 정책

[색인 경계 결정](../../.mew/docs/decisions/0057-workspace-search-indexing.md)에 따라 호스트의 직접 HTTP·Vite 개발 응답은 `X-Robots-Tag: noindex, nofollow`를 반환한다. HTML 진입점에도 같은 robots 메타를 넣고, 제품을 설명하는 제목과 description을 제공한다. P2P는 같은 호스트 HTTP 처리를 사용하며 전달 헤더 목록에 `X-Robots-Tag`를 보존한다. 설치된 HTML에 robots 메타가 포함되려면 사용자가 새 UI를 빌드·적용해야 한다.

`GET /robots.txt`와 `HEAD /robots.txt`는 `text/plain`·200·`Cache-Control: no-cache`로 응답한다. 내용은 다음과 같다.

```text
User-agent: *
Allow: /
```

크롤러가 페이지의 `noindex`를 읽을 수 있도록 수집 요청 자체는 허용한다. `Disallow: /`와 `noindex`를 함께 쓰면 크롤러가 `noindex`를 보지 못할 수 있다. 근거는 [Google의 색인 제외 안내](https://developers.google.com/search/docs/crawling-indexing/block-indexing)다. robots와 noindex는 크롤러가 따르는 검색 정책이며, 접근 권한은 기존 [인증·파일 권한](security.md)이 집행한다.

게스트에게 허용한 문서·파일과 알 수 없는 SPA 경로도 호스트 응답 정책을 따른다. 라우팅 호환을 위해 SPA의 200 fallback은 유지한다. 브라우저 데모의 기존 `noindex`도 유지한다. 별도 중앙 서비스의 공개 소개·대시보드·기기 접속 페이지와 `app.mew.run`의 응답은 이 호스트 미들웨어의 적용 대상이 아니므로 별도로 확인한다.

제품 소개 사이트의 노출 계획은 [사업 운영 문서](../../.mew/docs/business/search-discovery.md), 당시 진단은 [조사 기록](../../.mew/docs/research/search-discovery-baseline.md)에서 관리한다.
