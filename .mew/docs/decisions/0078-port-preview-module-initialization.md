---
title: "프리뷰 모듈 지정자 분석과 원격 초기화 완료 확인"
description: "직접 프리뷰의 인라인·여러 줄 모듈 누락을 정규식 대신 es-module-lexer로 수정하고, 원격 launcher 초기화 완료·실패 통지와 15초 준비 제한을 추가한 결정이다. 기존 origin·capability 경계와 운영 준비 조건은 유지하며, 일반 SPA의 주소 참조 변환은 후속 결정 0083이 확장한다."
created: "2026-10-27"
updated: "2026-10-28"
---

상태: 채택. 직접 프리뷰의 주소 참조 변환 범위는 [결정 0083](0083-direct-preview-spa-routing.md)이 확장한다.

## 배경

포트 주소 접속 실패를 조사하면서 실제 Vite 앱의 인라인 React Refresh 모듈과 여러 줄 import가 Mew 루트로 요청되어 CORS 오류·빈 화면이 발생하는 것을 재현했다. 기존 정규식은 인라인 스크립트와 여러 줄 구문을 처리하지 않고 주석·문자열까지 바꿀 수 있었다. Mewlink는 공개 기기 페이지와 별개로 프리뷰 DNS가 준비되지 않았으며, launcher의 준비 완료를 기다리지 않아 실패가 빈 화면으로 남았다.

## 결정

서버 런타임 의존성에 `es-module-lexer`를 고정 버전으로 추가한다. HTML의 실행 가능한 인라인 스크립트와 외부 JavaScript에서 분석한 실제 import/re-export 지정자 위치만 뒤에서부터 바꾼다. 일반 문자열·주석·JSON 데이터·source map과 import.meta는 보존하며 구문 분석 실패 시 원문을 전달한다.

원격 프리뷰는 지정 iframe·origin의 ready 이후 Service Worker 준비 완료 통지를 기다린다. 실패 통지나 15초 제한은 호출자 오류로 반환하고 세션·요청·소켓·포트·타이머를 해제한다. launcher와 호스트의 변경을 함께 적용한다.

## 대안과 근거

- 정규식의 줄 제한만 풀면 문자열·주석·이스케이프·동적 import를 실제 구문과 구분하기 어렵다.
- 범용 AST 전체 변환은 모듈 지정자만 바꾸는 작업보다 변경 범위와 비용이 크다. [모듈 전용 lexer](https://github.com/guybedford/es-module-lexer)는 필요한 위치와 문자열 지정자를 제공한다.
- 준비 메시지 없이 iframe 설정만 성공으로 처리하면 DNS·TLS·Service Worker 실패를 감지하지 못한다. 명시적인 초기화 완료와 제한 시간을 둔다.

## 영향

[ADR 0023](0023-login-desktop-and-port-preview.md)의 직접 opaque sandbox·원격 독립 origin과 포트 capability를 유지한다. 임의의 앱 라우터·런타임 조합 import·브라우저 정책까지 무수정 지원을 보장하지 않는다. DNS·HTTPS·Worker 준비와 사용자 빌드·배포도 여전히 필요하다. 현재 계약은 [포트 프리뷰](../development/port-preview.md), 운영 준비는 [중앙 배포](../operations/remote-central.md#localhost-앱-프리뷰-origin), 실제 검증은 [작업 기록](../work/command-port-previews.md)이 소유한다.
