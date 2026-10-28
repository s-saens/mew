---
title: "직접 프리뷰의 SPA 주소 참조 변환"
description: "직접 /포트번호 프리뷰에서 일반 SPA가 내부 접두사 대신 앱 경로를 읽도록 구문·스코프 기반 참조 변환을 채택한 결정. native Document·Location과 sandbox 경계를 유지하고 지원 한계·독립 origin 대안을 설명한다."
created: "2026-10-28"
updated: "2026-10-28"
---

상태: 채택

## 배경

Along은 `localhost:5173`에서 동작하지만 직접 Mew 주소의 `/5173`에서는 자체 404 화면을 표시했다. 모듈은 전달됐으나 라우터가 iframe의 `/__mew_port_preview/<origin>/<token>/`를 앱 경로로 읽었다. 기존 검사는 앱 fixture가 Mew 전용 basename을 사용해 이 실패를 놓쳤다. `/3001`의 API 루트 404는 upstream에서도 같은 응답이므로 별도로 보존한다.

## 결정

[결정 0078](0078-port-preview-module-initialization.md)의 모듈 지정자 변환에 `acorn`·`eslint-scope`의 구문·스코프 분석을 추가한다. 직접 프리뷰 스크립트의 자유 전역 참조만 가상 Window·Location에 연결하고 지역 바인딩·데이터·문자열·주석은 유지한다. 실제 Document는 DOM 정체성을 유지하며 필요한 주소 속성만 변환한다.

가상 주소는 현재 native iframe URL에서 앱 경로를 복원한다. history와 fragment 이동은 기존 capability URL 안에서 수행한다. native Location 재정의나 `allow-same-origin` 추가는 하지 않는다. 분석 실패·지원하지 않는 실행 코드·Next 정적 청크에는 기존 전달 방식을 유지한다.

## 대안과 근거

- 앱마다 basename을 수정하도록 요구하면 정상 동작하는 localhost 앱을 그대로 연다는 사용 목적을 충족하지 못한다.
- 정규식은 지역 변수·속성·문자열과 실행 참조를 구분하지 못한다. 스코프 분석은 같은 이름의 지역 바인딩을 보존한다.
- native Location은 재정의할 수 없다. Document 전체를 Proxy로 대체하면 DOM 함수의 Node 검사·정체성이 깨지므로 주소 접근만 다룬다.
- 별도 origin은 더 넓은 호환성을 제공하지만 직접 IP·사용자 도메인에는 추가 DNS·HTTPS 준비가 필요하다. 현재 Mewlink의 독립 origin은 그 조건이 필요한 앱의 대안으로 유지한다.

## 영향

일반 SPA의 최초 경로·history·hash에 Mew 전용 basename 설정이 필요하지 않다. 서버의 JavaScript 분석 비용과 런타임 의존성이 늘며 모든 동적 코드·브라우저 정체성까지 투명하게 재현하지는 않는다. 로그인·포트 capability·opaque sandbox와 원격 전송 경계는 유지한다.

현재 지원 범위는 [프리뷰 계약](../development/port-preview.md), 사용법은 [localhost 앱 열기](../guides/browser.md#호스트-localhost-앱-열기), 검증·운영 미적용 상태는 [작업 기록](../work/command-port-previews.md#2026-10-28--직접-프리뷰의-spa-초기-경로-수정)이 소유한다.
