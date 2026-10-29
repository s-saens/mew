---
title: "Mewlink 최초 표시와 재접속 지연 측정"
description: "2026-10-24 Mewlink의 운영 적용 전 지연과 실제 대상 DO의 SJC 배치, 실제 README의 반복 표시·재접속 측정을 기록한다. 초기화·후보 해석·세대 경합·복귀 감지·모듈 활성화, 네트워크·캐시·폰트·압축 및 대체 구조의 효과와 보안·검증 한계를 구분한다."
created: 2026-10-24
updated: 2026-10-24
---

# Mewlink 최초 표시와 재접속 지연

이 문서는 `feat/mewlink-fast-connect`의 조사·측정 기록이다. 현재 구현 계약은 [원격 접속](../development/remote-access.md), 적용 절차는 [중앙 배포](../operations/remote-central.md)가 소유한다. 아래 운영 수치는 수정 적용 전이며, 격리 수치를 운영 성능으로 해석하지 않는다.

## 목표와 측정 경계

주소 탐색 시작부터 실제 Mew 화면이 열릴 때까지 500ms 이하를 목표로 한다. 인증 전에는 비밀번호 입력, 저장된 로그인에서는 실제 메뉴·탐색기·예제 파일 표시를 구분해 측정한다. 대기 화면이나 연결 상태 문구를 성공으로 세지 않으며 로그인 화면만의 결과로 작업 화면의 목표 달성을 판정하지 않는다. 문서 편집 준비·외부 이동통신망·절전 후 복구도 별도 검증 대상이다.

운영 관측에는 저장된 인증이 없는 새 Chromium 컨텍스트를 사용했다. 첫 방문과 같은 탭의 후속 방문을 구분하고, WebSocket 신호의 종류·상대 시각과 자원 전송량만 수집했다. 비밀번호·세션·ticket·SDP·ICE 내용은 기록하지 않았다. 운영 서버의 빌드·배포·재시작은 하지 않았다.

후속 격리 측정의 주 지표는 Chrome 최상위 문서의 `performance.timeOrigin`부터 실제 로그인 입력이 삽입된 뒤 첫 rAF까지다. Node의 탐색 명령 시각과 브라우저 시각을 빼던 이전 값은 비교용으로 구분한다. 최소 RTT의 CDP 왕복으로 추정한 Node−Chrome offset은 반복 측정에서 약 ±0.8ms 안이었다. 따라서 아래의 수십 ms 단계 차이를 시계 차이로 설명하지는 않지만, 브라우저 송신과 Node 수신 사이의 대기를 브라우저 코드의 직렬 실행으로 해석하지 않는다. rAF는 다음 표시 기회이며 픽셀 paint 완료의 측정은 아니다.

## 적용 전 운영 관측

2026-10-24 KST의 같은 등록 기기에 대한 연속 세 번의 탐색이다. 시각은 탐색 시작 기준이며 단위는 ms다.

| 단계 | 첫 방문 | 후속 방문 1 | 후속 방문 2 |
| --- | ---: | ---: | ---: |
| 중앙 HTML 첫 바이트 | 652 | 210 | 206 |
| challenge 수신 | 1,784 | 751 | 794 |
| ticket 수신 | 2,320 | 1,226 | 1,275 |
| 호스트 answer 수신 | 2,887 | 1,624 | 1,540 |
| 실제 로그인 화면 | 3,442 | 1,798 | 1,869 |

별도 두 번의 관측에서 challenge 수신 뒤 connect 전송까지는 2~8ms, connect 전송부터 ticket 수신까지는 413~474ms였다. 로컬의 Ed25519 서명·검증 CPU 비용만으로 이 차이를 설명할 수 없으며 중앙·호스트의 왕복이 주요 조사 대상이다. 실제 DO의 물리적 위치나 각 운영 DB 문장의 실행 시간은 이 관측으로 확정하지 않는다.

Cloudflare의 [DO 위치 계약](https://developers.cloudflare.com/durable-objects/reference/data-location/)상 기존 객체는 생성 뒤 자동으로 위치를 바꾸지 않으며 위치 힌트는 최초 생성에만 적용한다. 이름만 바꿔 새 객체로 연결하면 이전 회수 상태를 잃을 수 있으므로 단순 교체를 성능 수정으로 사용하지 않는다.

2026-06-19 추가된 `apac-ne` 힌트도 기존 객체를 옮기지는 않는다. 한국·일본에 집중된 새 객체의 최초 배치 후보이지만 현재 운영 객체의 위치나 성능 개선을 보장하지 않는다. [Cloudflare 변경 기록](https://developers.cloudflare.com/changelog/post/2026-06-19-apac-ne-apac-se-location-hints/).

### 네트워크 왕복의 하한

새 호스트 준비 경로도 fresh WSS의 upgrade·challenge와 connect가 필요하다. 브라우저↔DO 왕복을 `R_BD`, DO↔호스트 왕복을 `R_DH`라고 두면 answer 도착은 대략 `2 × R_BD + R_DH + 호스트 처리`보다 빠를 수 없다. HTTP·TLS·코드 준비·직접 ICE·실제 UI 렌더링은 별도이며 일부는 이 구간과 겹친다.

별도 운영 heartbeat의 첫 응답은 약 150~210ms였다. 이 값이 브라우저↔DO 왕복을 대표하고 이전 HTML TTFB 약 210ms가 그대로라면, 호스트 왕복과 UI를 0으로 보아도 시작부터 510~630ms다. 다만 HTML·D1 최적화 후 운영 수치와 DO↔호스트 RTT는 아직 측정하지 않았으므로 운영 500ms의 가능·불가를 확정하지 않는다. 당시 브라우저의 Cloudflare edge는 HKG였으며 실제 DO 위치는 확인하지 못했다.

### 운영 위치의 읽기 전용 확인

이후 기존 계정의 읽기 권한으로 D1 정보와 [DO Analytics](https://developers.cloudflare.com/durable-objects/observability/metrics-and-analytics/)를 조회했다. D1은 `APAC`, read replication은 disabled였다. 공개 접속 경로의 익명 bootstrap은 challenge만 받은 뒤 닫았고 offer·키 증명은 보내지 않았다. 이 응답의 기기 ID를 현재 `getByName(instance.id)`와 같은 Analytics `name` 필터에 결합하니, 2026-10-23 17:00~23:50 UTC의 해당 Mewlink 객체 호출은 `SJC` 한 그룹이었다. 계정·객체 식별자와 자격증명은 연구 자료에 남기지 않았다.

따라서 앞선 HKG edge 관측과 별개로 실제 대상의 신호 처리가 미국 SJC에 배치된 근거를 확보했다. D1의 APAC는 도시나 SQL 실행 시간을 뜻하지 않으며, 이 집계도 개별 handshake의 왕복 시간을 대신하지 않는다. 익명 새 WSS의 challenge까지는 한 번 873ms였지만 DNS·TLS·HTTP·D1·DO를 포함하므로 이를 SJC 왕복 하나의 비용으로 사용하지 않는다. 기기 등록·회원 권한·운영 배포는 변경하지 않았다.

### 기존 신호 객체를 옮길 때의 경계

기존 DO를 가까운 지역으로 옮겨야 한다면 namespace·인가 데이터를 보존하는 별도 이관 설계가 필요하다. 원본 snapshot과 이후 변경을 대상에 전달하고, 원본의 영속 fence가 확정된 뒤에만 대상을 writer로 활성화해야 한다. 중간에는 양쪽 writer를 동시에 허용하지 않으며 회수·단회 소비 기록과 실패 후 재시도를 보존해야 한다. 원본 DO는 이전 요청을 거절하거나 새 권한 상태로 안내하는 경계로 남긴다. 새 위치 힌트만 추가하거나 데이터만 삭제하는 변경은 구현하지 않았다.

현 구현을 읽어 보니 활성 브라우저의 nonce·challenge·소비 상태와 연결 세대는 WebSocket attachment에도 있다. disconnected 복구 테이블만 옮기거나 기존 host 종료 함수를 재사용하면 이 상태를 잃는다. 안전한 이관에는 영속 fence·lease 확정, attachment의 명시적 상태화와 진행 중 요청 drain, snapshot 이후 회수·소비 변경 전달, 검증된 import, D1 경로의 원자적 전환, 새 호스트·브라우저 증명이 필요하다. 현재는 이 경로 테이블·epoch가 없으며 online·목록·회수를 포함한 모든 호출자도 함께 바꿔야 한다. 새 대상이 활성화된 뒤 복귀할 때도 더 높은 epoch의 역방향 이관이 필요하다. 무중단 이관의 구현·성능을 검증한 것은 아니다.

더 작은 v1은 기존 연결을 명시적으로 종료하고, 영속 source fence 뒤 마지막 실제 ticket·lease·prepare·admission·recovery의 유효 상한과 native dispatcher 종료를 확인한 뒤 authority·회수 tombstone만 옮기는 방식이다. 현재 정책이 60초여도 입력 허용 여유·clock tolerance·진행 중 발급이 있어 고정 60초 완료를 약속할 수 없다. 만료나 host drain ACK의 근거가 불충분하면 대상은 열지 않는다. 회수는 snapshot 이후에도 deny delta와 seal을 거쳐 보존하고, 기존 다섯 route 호출과 HTML cap의 epoch까지 함께 전환해야 한다. 유지보수 구간이 생기는 미구현 대안이며 객체 ID만 바꾸는 우회로 사용하지 않는다.

## 격리 전체 연결

`mewlink/test/p2p-startup.browser.test.ts`는 서로 다른 HTTPS origin, 실제 Miniflare Workers/D1/DO, 네이티브 RTC 호스트와 Chromium을 연결한다. 임시 데이터 폴더와 예제 owner만 사용한다. 이미 설치된 `dist/`는 읽기만 하며, `MEW_STARTUP_BENCH_SOURCE=1`은 현재 main·인증 진입점을 메모리 fixture로 컴파일하고 Workspace·포트 프리뷰만 대체한다. 이 fixture 컴파일은 운영 앱 빌드가 아니다.

조사 중간의 installed-dist 실행은 첫 방문 925ms, 후속 방문 646/638ms였다. 후속 방문에도 정적 글꼴 약 809KB를 다시 전송했다. 글꼴 CSS·폰트를 기존 SHA-256 검증 캐시에 포함한 뒤 후속 전송량은 810,707B에서 약 1,416B로 감소했다. 표시 시간은 631/626ms여서 이 전송량 감소만으로 500ms 목표를 달성하지는 못했다.

현재 main fixture의 중간 결과는 첫 방문 883ms, 후속 방문 624/599ms, 후속 호스트 응답 본문 약 1,385B였다. `/api/auth/me`는 한 번만 요청했다. answer 이후 ICE/DTLS 연결에 약 230~245ms가 남아 있었고, 인증 조회 자체는 약 3ms였다. 이 값은 수정 중인 소스·로컬 네트워크의 측정이며 최종 검증 결과를 대신하지 않는다.

네이티브 상태 로그와 Node inspector의 실제 breakpoint를 대조하니 잔여 약 250ms는 ICE 단계였고 DTLS·SCTP는 합쳐 약 3ms였다. 후보의 우선순위·광고 순서만 바꾼 실험은 일관된 개선이 없어 채택하지 않았다. 대기 helper에서 ICE를 먼저 수집하고 실제 offer에 자동 rollback해 응답하는 실험은 설치된 UI의 후속 표시 338/275ms, 첫 방문 619ms였다. 별도 실제 RTC fixture에서는 answer 약 8ms·채널 열기 약 64ms를 관측했다. 미사용 소켓의 수명·단회 사용·취소와 통합 검증이 끝나기 전에는 이 중간 값을 최종 성능으로 표현하지 않는다.

### 다음 대기 helper의 CPU 경쟁

이미 1.5초 이상 온라인인 호스트와 새 Chromium을 사용해 첫 연결과 다음 대기 helper의 초기화를 분리했다. 실제 연결용 helper의 ICE는 모든 표본에서 탐색 1.52~1.59초 전에 완료됐다. 두 번째 이후 helper의 네이티브 초기화만 800ms 늦춘 fixture를 기존 fixture와 교차 실행했다.

| 조건 | 첫 방문 세 번(ms) | 중앙값 |
| --- | --- | ---: |
| 다음 helper 즉시 초기화 | 581 / 582 / 565 | 581 |
| 다음 helper 초기화 800ms 지연 | 503 / 466 / 534 | 503 |

쌍별 78/116/31ms가 줄었으며 다음 helper의 초기 CPU 사용은 약 82~101ms였다. 호스트의 브라우저 proof 검증·dispatcher 준비·응답은 약 1~2ms였다. 다만 지연 조건에서도 브라우저 송신→네이티브 수신에 110ms가 남은 표본이 있어 모든 첫 연결 변동을 이 경쟁 하나로 설명하지 않는다.

이후 제품 소스에 생성 예약 800ms를 적용해 새 호스트·새 Chromium으로 다섯 번 검증하니 첫 방문은 559/541/558/600/580ms, 후속 열 번의 중앙값은 522.5ms, 새 RTC 복구 다섯 번의 중앙값은 815ms였다. 첫 표시 직후 다음 방문·복구가 들어오면 대기 helper가 없어 새 프로세스를 기다리는 회귀였다. 이 예약은 채택하지 않고 즉시 보충으로 돌아갔다. 초기 CPU 경쟁의 근거와 특정 시간 예약의 성능 개선 여부는 구분한다.

## 저수준·압축·구조 대안

| 후보 | 확인한 근거와 판단 |
| --- | --- |
| 네이티브 helper·인증서·ICE 사전 준비 | 초기화만 미리 끝내면 채널 열기 250~351ms→162~275ms였고 ICE 준비를 포함한 별도 실측은 약 64ms였다. 실제 offer의 서명·DTLS와 연결별 별도 프로세스는 유지한다. |
| 단회용 호스트 증명 사전 공급 | 호스트 prepare→ready→중앙 ticket의 왕복을 줄이는 구현을 검증 중이다. 짧은 만료·프로세스 세대·양쪽 단회 소비·현재 권한과 최종 ticket 검사를 유지해야 한다. |
| 정적 자원 일괄 재검증 | 현재 index 응답에 캐시 경로의 SHA-256 목록을 결합해 자원별 추가 왕복을 줄인다. 저장 본문은 다시 해시하며 연결 세대·1초·한 번의 사용으로 범위를 제한한다. |
| gzip→Brotli | 설치 main JS 578,956B를 같은 CPU에서 비교했다. gzip 181,601B/약 8.5ms, Brotli quality 4는 180,695B/약 6.4ms였다. 이 파일에서는 크기 차이가 약 0.5%여서 주된 지연 해소 수단으로 채택하지 않았다. |
| 네이티브 라이브러리 교체·주소 처리 | 격리 syscall 추적에서 원격 description 처리 중 인터페이스·주소 조회 비용을 확인했다. 운영 libc나 네트워크 설정은 교체하지 않았으며 실제 ICE/DTLS 대기와 구분해 조사한다. |
| 네이티브 thread pool 축소 | [libdatachannel 0.24.5](https://raw.githubusercontent.com/paullouisageneau/libdatachannel/v0.24.5/src/impl/init.cpp)는 CPU 수를 기준으로 pool을 만들며 C++ 설정 함수를 제공한다. 현재 [node-datachannel 0.33.4 바인딩](https://raw.githubusercontent.com/murat-dogan/node-datachannel/v0.33.4/src/cpp/rtc-wrapper.cpp)은 이를 노출하지 않는다. 고정 OpenSSL 3.5 기준의 wrapper에만 `SetThreadPoolSize(4)`를 넣어 원래 archive를 읽기 전용으로 재사용한 격리 비교에서, 새 자식 열 개씩의 초기 생성 중앙값은 118.723→118.416ms였다. 스레드는 23→15개, CPU는 9.544→8.898ms였고 RSS는 비슷했다. 모두 정상 종료했지만 지연 개선 근거가 없어 채택하지 않았다. 전체 P2P·부하·플랫폼 검증이나 설치 바이너리 변경은 하지 않았다. |
| WebTransport | [W3C 계약](https://www.w3.org/TR/webtransport/)은 인증서 SHA-256 확인을 제공하지만 클라이언트 신원은 별도 검증해야 한다. NAT 통과·UDP 도달성·브라우저 호환을 포함한 새 구현이 필요하므로 기존 WebRTC의 즉시 대체로 취급하지 않는다. |
| HTML nonce 사전 발급 | 현재 challenge는 101 응답과 같은 첫 응답 구간에 실린다. `onopen`도 handshake 완료 뒤이므로 nonce를 HTML에서 먼저 알아도 필수 왕복은 줄지 않는다. [WebSockets 표준](https://websockets.spec.whatwg.org/#feedback-from-the-protocol). nonce 귀속·만료·호환을 복잡하게 만드는 데 비해 이득 근거가 없어 채택하지 않았다. |
| Upgrade 요청부터 offer 전달 | 브라우저→DO→호스트 준비를 handshake와 겹칠 수 있는 후속 구조다. 브라우저 WebSocket API의 요청 본문 제약·별도 POST 비용과 단회 증명의 준비/소켓 귀속/소비 원자성, offer·키 바꿔치기·회수 검증이 필요하다. 이번 구현에는 포함하지 않는다. |
| 상시 역터널·TURN | NAT 접근성을 개선할 수 있지만 중앙 시그널링 왕복을 저절로 없애지는 않는다. 역터널에는 relay가 평문을 볼 수 없는 별도 종단 간 암호화·호스트 키 결합이 필요하다. TURN은 현재 DTLS를 유지하는 접근성 대안으로 구분한다. |
| 종단 간 암호화 WSS 중계 | PC 초기화는 피할 수 있으나 현재 SDP fingerprint에 결합한 최종 ticket·proof를 새 채널에 결합해야 한다. [Noise XX](https://noiseprotocol.org/noise.html) 같은 기존 프로토콜도 비추출 브라우저 signer·정확한 구현/감사 범위 검증이 남는다. 양 WSS가 이미 열렸고 인가가 겹친 낙관 모델에서도 인증 ACK와 첫 read가 각각 약 2R·3R이므로, relay 경유 종단간 RTT R이 167ms 이상이면 UI 전에도 500ms를 넘는다. 실제 SJC R을 측정한 값이 아니며 평문 relay·0-RTT 쓰기·두 dispatcher race는 채택하지 않는다. |
| D1을 기다리지 않는 고정 connect HTML | 현재 HTML은 조회·요청 제한을 한 batch로 처리하고 signed cap의 WSS는 D1을 생략한다. 단순히 HTML 조회를 없애면 instance 없는 WSS는 lookup→rate 두 번의 순차 조회와 늦은 기기 키 준비가 생긴다. 고정 공개 bytes를 기존 ASSETS 예외처럼 취급할지의 정책 판단도 필요하며, HTML-only/HEAD의 기존 전역 HTTP300 계수까지 그대로 보존하면 critical D1을 없앨 수 없다. cap 응답을 공유 캐시하는 우회는 사용하지 않는다. |

네트워크 도달 범위를 줄이거나 인증서·키 소유 증명·단회 nonce·권한 회수 검사를 생략하는 방식은 사용하지 않는다. 정적 UI 캐시를 문서·계정·세션 캐시로 확대하지 않는다.

공개 UI 자산을 연결 협상 중 먼저 내려받는 구조도 검토했다. 최소안은 고정된 공개 release의 main·인증·runtime JS만 제한된 미확인 후보로 보관하고, 현재 인증된 P2P index 응답의 파일별 SHA와 본문 재해시·instance·generation·1초·단회 사용 검사를 그대로 통과시키는 방식이다. 이 경계에는 새 host JWT나 서명 endpoint가 필수는 아니며 CDN은 바이트 출처만 바꾼다. 인증 전 Workspace 요청은 늘리지 않고 HTML·API·세션·사용자 파일을 CDN에 넣지 않는다. 후보 저장도 기존 64개·32MiB·파일별 8MiB 안에서 직렬화하고, 헤더·decoded body·gzip ETag를 정규화해야 한다. 내려받은 코드를 미리 compile하는 안은 [문서별 module map](https://html.spec.whatwg.org/multipage/webappapis.html#module-map)을 나중 UI iframe으로 이전할 수 없어 별도 구조 변경이다. 같은 최종 문서·전체 정적 자식의 개별 무결성·현재 호스트 확인·불일치 시 문서 폐기가 필요하며, preload 한 개나 루트 SRI만으로 이 조건을 대체하지 않는다.

이후 같은 app origin의 임시 공개 정적 경로로 fetch-only 한 쌍을 비교했다. 원래 `connect-src 'self'`는 그대로였고 제품 Worker에 이 release 경로를 추가하거나 자산을 배포하지 않았다. Node 24·설치 SDK·전체 UI 소스·CSS/폰트를 고정한 첫 메뉴/트리/편집 준비는 733/817/1,020→686/770/968ms, 후속은 333/412/500→333/407/503ms, 새 RTC 복구는 139→147ms였다. 최종 두 조건은 각 1pass·0skip, helper 여덟 개 정상 종료였다. 준비 단계의 이름 선택 오류와 별도 예비 기준 실행은 이 한 쌍에 합치지 않았다.

후보 세 개는 탐색 시작 뒤 308~345ms에 받아 저장했고, 526/543/573ms의 기존 live-host batch 검증 통과 분기에서만 사용됐다. App 사전 요청과 후속 CDN 요청은 0개였다. 첫 UI 시작→메뉴는 221→184ms였지만 전체 첫 메뉴는 500ms를 넘었고, native 시작 변동·최종 Vite preload 부재·한 쌍의 한계를 유지한다. P2P 정적 요청은 45→42개, JS는 39→36개, 호스트 정적 본문은 2,187,277→1,981,112B였다. 별도 공개 다운로드의 decoded raw body 663,534B가 더해지므로 전체 네트워크 전송량 절감으로 부르지 않는다. host header 원문을 별도로 덤프한 검증이나 gzip·취소·악성 catalog의 부정 검사는 수행하지 않았으며 제품에는 채택하지 않았다.

### 같은 문서에서 컴파일을 선행할 때의 실행 경계

별도 정적 Chromium·ServiceWorker fixture에서 세 조건을 검사했다. preload 중 entry·정적 자식의 평가와 API 호출은 0이었다. 이후 SW가 새 fetch를 403으로 거절해도 같은 문서의 import는 추가 fetch 없이 기존 module record를 한 번 평가했다. 따라서 실행 때 기존 캐시의 현재 호스트 검증이 자동으로 재실행된다는 설계는 성립하지 않는다. 별도 fresh body의 SHA 불일치를 명시적으로 확인하고 문서를 폐기한 조건은 entry 평가 0이었으며, navigation으로 새 문서를 만들면 모듈 fetch·평가도 새로 필요했다. Node 24에서 상위 검사를 포함한 4개가 pass·0skip이었다. 실제 Mew·P2P의 활성화 게이트나 성능을 검증한 결과는 아니다.

이를 적용하려면 실제 compile에 사용한 고정 바이트와 현재 호스트 확인 결과를 정확한 문서·연결 세대에 결합하는 새 client activation gate가 필요하다. 기존 `fetchRemoteUiResource()`의 304/200 fallback을 batch의 1초·단회 소비로 오인할 수 없어 strict batch hit의 출처도 구분해야 한다. 문서의 client ID·token·instance·attempt·index version·auth revision과 유효시간을 모든 비동기 경계 뒤 다시 확인하고, 활성화 전 취소·불일치는 frame 전체 폐기로 끝내야 한다. 활성화 commit 뒤 실제 module 평가까지는 별도 작업이므로 script 제거만으로 평가 0을 보장하지 않으며 기존 초기 인증·scope·App import gate를 유지해야 한다. host protocol을 바꾸지 않더라도 새로운 보안 계약이며 아직 제품에 채택하지 않았다.

후속 정적 stream 검사까지 추가한 실행은 상위 검사를 포함해 5pass·0skip이었다. 열린 head와 preload만 보낸 동안 평가·API 호출이 없었고, 같은 Response의 나머지 HTML을 전달한 뒤에도 원래 stylesheet를 기다리는 동안 module 평가는 0이었다. stylesheet를 해제하자 같은 Document에서 theme→정적 자식→entry→DOMContentLoaded 순서를 유지했고 module 추가 fetch는 없었다. 초기 stream 검사의 timeout은 렌더링을 보류한 head·stylesheet와 프레임 기반 관측을 함께 기다리는 문제였으며 원문을 보존했다. 비프레임 관측과 실제 stylesheet 요청의 완료 조건으로 보완한 결과다. Mew의 문서·계정·세대·receipt 게이트나 실제 표시 시간은 이 정적 검사로 검증하지 않았다.

격리된 streaming overlay의 단위 검사에서는 strict batch 출처·단회 소비, 이전 index 무효화, 연결 세대·instance·문서·인증 revision 변경, 본문 변조, 만료·취소, 미등록 자산·API 차단과 template 불일치를 검사했다. 최초 실행은 개별 조건 12개가 통과했어도 취소 직후 생성된 Promise의 미처리 rejection 때문에 파일 전체가 실패했다. 이미 취소된 대기에서도 전달받은 Promise의 rejection을 소비하도록 고친 뒤 같은 검사는 12pass·0fail·0skip, 실제 worktree를 기준으로 한 virtual overlay 타입 검사는 진단 0이었다. 임시 디렉터리에서 실행한 첫 타입 검사는 `vite/client` 탐색 실패였으므로 통과로 세지 않는다. 이 코드는 `/tmp`에만 있으며 실제 Mew 브라우저의 활성화·Worker·PDF·preview 회귀나 표시 시간을 검증하지 않았다. 실패한 문서의 client ID는 bridge 수명 동안 제거하지 않는 제한된 tombstone으로 차단하는 설계이며, 전체 정상 UI를 한 client ID로 제한해 기존 Worker를 막는 방식은 피한다. ID를 잡기 전에 폐기한 문서의 늦은 index GET까지 0이라고 주장하지 않는다.

후속 Chromium 검사는 시제품 controller·cache·resource bridge·ServiceWorker의 실제 코드를 사용하되 host transport만 모의 구현했다. 인증 대기 중 세 JS와 theme의 평가·host 호출은 모두 0이었다. 승인 뒤 동일 Document에서 각각 한 번 평가됐고, 정상 경로의 Worker·Worker 하위 import·API GET도 처리됐다. fresh index 불일치·인증 revision 변경·명시적 취소에서는 entry·theme 평가 없이 frame이 제거됐다. 최종 실행은 상위 검사를 포함해 5pass·0fail·0skip이었다. 초기 두 실행은 실험용 Worker URL을 문서 기준으로 지정한 오류로 성공 조건을 못 채웠고, module URL 기준으로 고친 뒤 통과했다. 첫 관측의 Playwright 인자 오류도 수정했으며 실패 로그를 보존했다. HTTPS fixture의 단일 임시 인증서 SPKI만 신뢰하는 별도 Chromium을 사용했고 제품 TLS 설정은 바꾸지 않았다. 실제 launcher·P2P·인증 구현·전체 UI·PDF·preview·지연을 검증한 결과가 아니므로 이 실행 시간을 Mew 접속 성능으로 해석하지 않는다. 제품 채택은 보류한다.

실제 전체 Mew 소스·설치 CSS/글꼴·현행 native SDK·실제 격리 owner/IDB/trusted-session/README를 사용한 후속 비교도 수행했다. 첫 두 실험은 disk index를 기준으로 계산한 digest가 서버의 고정 `mew-p2p-app` 메타 삽입 뒤 본문과 달라 fallback assertion에서 실패했다. 인증 조건을 완화하지 않고 정확한 전송 template의 digest로 실험 메타데이터만 고쳤다. 같은 launcher overlay·소스·SDK·설치 자산의 한 쌍에서는 최초 메뉴/트리/편집기가 686/755/972→704/782/991ms, 캐시 방문은 348/424/512→356/439/533ms, 명시적 helper 종료 후 같은 frame의 새 인증 RTC 복구는 142→138ms였다. 두 실행 모두 stage 조건의 동일 Document·commit·fallback 0을 확인했지만 성능 개선은 확인되지 않았다.

현재 fixture가 원 script의 crossorigin을 제거한다는 차이도 분리했다. 양 조건에서 설치 template의 crossorigin을 보존한 별도 한 쌍은 최초 741/881/1055→654/731/961ms, 캐시 361/431/533→315/408/505ms, 복구 139→152ms였다. 두 쌍 모두 최초 500ms에는 미달하며 n=1 변동을 시제품 효과로 단정하지 않는다. 별도 진단에서는 main JS가 호스트에서 gzip 181,380B로 다시 전송됐고 캐시 방문에도 이 한 파일의 재전송이 남았다. 첫 CDP 시도는 UI frame이 부모 세션을 공유해 관측하지 못했고, 앱 bridge 세션에 연결한 뒤 main 실행 직전 breakpoint에서 UTF-8·interactive 문서, preload 세 개의 URL/SRI/crossOrigin과 실제 entry 속성·한 프레임의 호출 스택을 확인한 뒤 resume·detach했다. 이 진단 실행의 시간은 성능 비교에서 제외한다. crossorigin 보존만으로 main 재전송은 사라지지 않았다. 재요청의 정확한 원인은 미확정이며 시제품은 미채택이다. 전체 10회 중 8회 통과·2회 위 실패였고, 소유 native helper 36개는 모두 정상 종료했다. 공개/비공개 제품 소스·설치 SDK는 수정하지 않았다.

대기 helper는 상시 자원을 사용한다. 한 환경의 유휴 프로세스에서 RSS 약 83.9MiB·스레드 27개를 관측했으며 공유 메모리의 실제 추가 사용량이나 다른 플랫폼의 비용을 뜻하지는 않는다. 대기 한 개·30초 회전·연결별 프로세스 격리는 이 비용을 감수하고 초기 지연과 장애 범위를 줄이는 선택이다.

## 남은 확인

최종 소스에서 첫 방문·후속 방문·실제 RTC 교체·시그널링 재부착을 다시 측정한다. 중앙 런처·Worker와 로컬 호스트/UI의 반영 위치를 나누고, 운영 반영 뒤 같은 익명 조건 및 실제 모바일 망에서 재측정해야 한다. 격리 회귀 통과나 전송량 감소를 운영 500ms 달성으로 표현하지 않는다.

## 구현 검증 시점

2026-10-24 KST의 코드 검증은 원격 접속 관련 35파일·217개 검사, 중앙 Workers 20파일·158개 검사, 실제 Chromium CSP 6개와 Node 전용 HTML 생성 hook 1개를 모두 통과했다. 루트·중앙 타입 검사와 변경 파일 lint, 문서 description·링크 검사도 통과했다. 취소·회수·단회 사용·변조 캐시·현재 연결 세대를 대상으로 한 독립 소스 검토에서 구체적인 보안 회귀를 발견하지 못했다.

이후 키 준비 공유·공개 키 export 병렬화·Linux 비동기 주소 조회·helper 강제 회수 변경은 공개 연결/호스트/경로/NAT 7파일의 89개 검사, 비공개 키 준비 Node 13개·HTML hook 1개·실제 브라우저 startup/역할 그래프 16개를 통과했다. 루트 타입 검사와 변경 파일 lint·문서 검사를 다시 통과했다. 같은 검사를 여러 묶음에서 실행한 합계를 서로 다른 검사 수로 더하지 않는다. 별도 실제 작업 화면 P2P/direct fixture도 1개 통과했다.

정확한 정적 코드 해시만 허용한 inline 선행 코드·즉시 helper 보충·캐시 IO 제한을 함께 적용한 첫 통합 실행은 첫 방문 704ms, 후속 270/256ms, 새 RTC 복구 210ms였다. 선행 WSS는 HTML 78ms 뒤 101ms에 시작했고 connect는 188ms였다. 첫 RTC 단계의 변동이 남아 있어 500ms 달성으로 판정하지 않는다. 새 호스트 즉시 접속과 이미 온라인인 호스트에 새 브라우저로 접속하는 조건을 구분해 반복 측정한다.

같은 코드에서 각 다섯 번 새 호스트·새 Chromium으로 반복했다. 각 실행 안에서 후속 탐색 두 번과 새 RTC 복구 한 번을 연속 수행했다.

| 호스트 조건 | 첫 방문 다섯 번(ms) | 첫 방문 중앙값 | 후속 열 번 중앙값 | 새 RTC 복구 다섯 번 중앙값 |
| --- | --- | ---: | ---: | ---: |
| online 직후 | 669 / 756 / 532 / 595 / 609 | 609 | 283.5 | 212 |
| online 이후 1.5초 대기 | 635 / 820 / 689 / 627 / 685 | 685 | 290 | 210 |

모든 첫 연결 helper의 ICE 수집은 탐색 전에 완료됐다. 선택된 경로는 UDP 직접 연결이며 ICE RTT는 대부분 0~1ms였다. 호스트 검증·응답은 약 1~2ms, 캐시 목록 조회는 약 1ms, 인증 응답부터 index까지 중앙값은 약 6~8ms였다. 첫 방문의 HTTP 본문 합계 1,016,486B에는 이미 gzip을 적용한 코드와 약 809KB WOFF2가 포함되고 런처·프레이밍 바이트는 포함하지 않는다. 후속 본문은 약 1,385B였다.

키·offer·challenge가 준비된 뒤 Node가 connect를 받기까지 70~76ms가 남는 표본을 찾았다. inline IIFE와 외부 ESM의 기기 키 Map이 분리돼 IndexedDB를 다시 여는 것을 후보로 조사했다. 단회 준비 결과 공유와 IDB 계측을 추가한 표본에서는 키 생성·원자적 저장이 84ms에 끝났고 제어기는 152ms에 같은 promise를 가져갔으며 중복 조회는 없었다. DOM·스토리지·MessageChannel 초기화는 각각 0~1ms, 공개 JWK export도 다른 표본에서 0ms였다. 브라우저 WSS 송신을 별도로 재니 송신→Node 수신이 55ms인 표본과 1ms인 표본이 있었다. 따라서 이 대기를 키 저장·export·화면 준비의 직렬 실행으로 단정하지 않는다.

Linux 비동기 주소 조회·키 준비 공유·공개 키 export 병렬화를 반영하고 Chrome 시계로 다섯 번 다시 측정했다. 새 호스트 online 직후의 첫 방문은 683/730/677/707/625ms로 중앙값 683ms, 후속 열 번의 중앙값은 271ms였다. 같은 브라우저에서 실제 RTC 단절부터 같은 frame의 현재 인증 확인까지는 141/126/132/137/136ms로 중앙값 136ms였다. 이전 복구 206~218ms에는 Node의 Playwright 관측 대기가 약 70ms 포함돼 있어 직접 비교하지 않는다. 첫 방문 500ms는 여전히 미달이다.

### 네이티브 helper의 동기 OS 조회

호스트가 인증 메시지를 받기 전 간헐적으로 약 150ms가 멈추는 구간을 Node inspector CPU profile·조건부 breakpoint·event-loop 지연으로 조사했다. 한 재현에서는 브라우저 인증 송신이 473ms, 호스트 수신이 630ms였고, 그 사이 `os.networkInterfaces()`가 393~578ms에 185ms 동안 동기로 실행됐다. 해당 호출의 user CPU 증가는 0ms, system CPU 증가는 약 12.4ms였으며 event-loop 최대 지연은 약 196ms였다. 계산량만으로 설명하지 않고 OS 주소 조회가 이벤트 루프를 막은 것으로 판단한다.

이 조회는 Linux NAT 경로 준비가 실제 선택 경로의 로컬 주소를 확인할 때 사용한다. 매핑 시작 대기를 2초에서 100ms로 줄인 뒤 초기 RTC 구간과 겹쳤다. 주소·경로 검증이나 NAT 도달성을 없애지 않고 비동기 조회로 바꾸는 수정을 검증한다. 연결별 breakpoint는 약 0.4ms에 재개했고 프로파일러·debug 연결·임시 fixture 프로세스는 정리한다. 이 재현 하나로 모든 플랫폼이나 첫 연결 변동의 원인을 같다고 단정하지 않는다.

비동기 수정 뒤 한 실제 RTC 검사에서는 해당 Linux 동기 호출이 0회였고 인증 송신→호스트 수신은 3ms였다. 별도의 이벤트 루프 정지는 남아 있어 모든 지연을 제거한 것으로 표현하지 않는다.

추가 NAPI·CPU profile 계측에서는 `addRemoteCandidate()`가 117ms와 145ms 동안 동기로 멈췄다. 각 호출의 user/system CPU 증가는 벽시간보다 작았고, 같은 helper의 최장 이벤트 루프 정지와 native 호출 stack이 겹쳤다. 조건부 breakpoint로 호출명·시간·CPU만 확인한 뒤 재개했다. 별도 후보 종류 검사에서도 숫자 IPv4·UDP·srflx 후보에서 150ms가 재현돼 mDNS 이름만의 문제로 볼 수 없다.

버전별 원문에서는 [libdatachannel의 Simple resolve](https://github.com/paullouisageneau/libdatachannel/blob/v0.24.5/src/impl/peerconnection.cpp#L1090-L1121)와 [후보 해석](https://github.com/paullouisageneau/libdatachannel/blob/v0.24.5/src/candidate.cpp#L139-L158), 이어지는 [libjuice의 후보 해석](https://github.com/paullouisageneau/libjuice/blob/3c40a3545b6b1b62c7adee7f8f2bd58aa290afd6/src/ice.c#L143-L205)이 숫자 주소에도 `AI_ADDRCONFIG`를 포함한 `getaddrinfo()`를 동기로 호출한다. 조용한 별도 C probe에서는 고정 문서용 IPv4/IPv6의 numeric-only 조회가 약 0.00017~0.024ms, 같은 조회에 `AI_ADDRCONFIG`를 더하면 약 0.667~10.109ms였다. 이 차이는 주소 조회 비용의 근거지만 연결 중 150ms 전체의 원인을 증명하지 않는다. native 내부 lock 대기 등은 추가 확인 대상이다. 설치 바이너리를 수정하거나 DNS·IPv6·TCP 후보를 제외하지 않았다.

고정된 node-datachannel 0.33.4·libdatachannel 0.24.5와 원래 submodule 소스로 별도 baseline/수정 바이너리를 만들었다. 두 바이너리는 같은 도구·의존성·기능 설정을 사용하고, 수정은 libdatachannel과 libjuice의 **Simple 모드에서만 `AI_ADDRCONFIG`를 제외하는 두 조건**이다. 기존 `AI_NUMERICHOST`와 libjuice의 `AI_NUMERICSERV`, Lookup 모드·파싱·후보 순서·서명·DTLS 검사는 유지했다. 자체 주소 파서나 비동기 NAPI·후보 제거를 추가하지 않았다. 숫자 후보를 사용할 수 있는 주소 계열인지 미리 거르는 동작은 달라지므로 모든 플랫폼에서 의미가 같다고 주장하지 않는다.

기본 환경의 IPv4/IPv6·mapped·zone·UDP/TCP·잘못된 주소/포트·서비스 이름·Simple hostname/mDNS·Lookup localhost 44개 비교는 성공 여부·주소 계열·포트·파싱 오류가 같았다. 이 환경에서 합계 시간은 445.28→25.39ms였다. 같은 도구로 만든 두 바이너리의 실제 P2P 비교 한 쌍에서는 숫자 IPv4 후보의 동기 호출이 158.832→0.102ms, mDNS Simple 확인은 25.742→0.139ms였다. 해당 쌍의 첫 로그인 표시는 606→513ms였고 후속·복구는 각각 283/262→297/255ms, 129→128ms였다.

이후 부모와 다른 user/network namespace를 매번 만들고 loopback down/up·IPv4 전용·IPv6 전용·dual stack에서 각 44쌍을 비교했다. 호스트의 인터페이스·경로·sysctl은 바꾸지 않았다. loopback 두 조건과 dual stack은 같았지만 IPv4 전용은 16개, IPv6 전용은 7개의 결과가 달랐다. 비구성 주소 계열이 허용되고, IPv4 전용의 mapped 주소는 원본의 AF_INET에서 수정본의 AF_INET6로 표현이 바뀌었다. IPv6 전용에서는 원본이 주소 계열 때문에 거르던 overflow 포트 65536→0과 TCP 서비스 이름→80도 나타났다. 이는 원래 dual stack에서도 허용하던 파싱 결과이며 파서 변경은 아니다. Lookup·파싱 오류·잘못된 literal/zone·Simple hostname/mDNS의 결과는 같았다.

이 비교는 모든 환경에서 원본과 동등하다는 가설을 반박한다. 공개 익명 연결도 최종 ticket·로컬 로그인 전에 ICE를 시작하므로 추가 주소 계열의 사전 인증 접속 시도가 달라질 수 있다. DTLS·키 증명은 이 초기 시도를 소급 차단하지 않는다. [ICE의 제3자 STUN 전송 표면](https://www.rfc-editor.org/rfc/rfc8445.html#section-19.5.1)과 [libjuice의 주소 계열별 TCP 후보 제한](https://github.com/paullouisageneau/libjuice/blob/3c40a3545b6b1b62c7adee7f8f2bd58aa290afd6/src/agent.c#L2419-L2435)을 함께 검토했다. mapped의 계열 변경은 TCP 후보 상한에도 영향을 줄 수 있다. 실제 송신·도달성은 parse-only matrix로 검증하지 못했으므로 두 조건을 제품에 채택하지 않는다. 원래 주소 해석·도달 범위를 보존하는 비동기 대안을 별도로 검토한다.

수정본으로 새 호스트·새 브라우저를 다섯 번 실행한 첫 로그인 표시는 479/674/527/515/622ms로 중앙값 527ms였다. 후속 열 번은 중앙값 281.5ms, 실제 단절→현재 인증 확인 다섯 번은 중앙값 130ms였다. 모든 첫 대기 helper의 ICE 준비는 접속 전에 완료됐고 후보 처리 28회의 최장 호출은 0.278ms였다. 같은 Chrome 시계의 answer→RTC connected는 57/200/62/68/216ms로 남은 변동이 있어 첫 방문 500ms 달성으로 판정하지 않는다.

별도 단계 관측 한 번에서는 helper의 20ms heartbeat가 5ms 넘게 밀리지 않았고, native 로그의 JS 전달 시각 기준 DTLS 시작→완료가 약 57~60ms, SCTP 연결 약 1.5~1.6ms, DCEP/open 약 1ms였다. 선택 경로는 UDP이고 RTT는 0~1ms였다. 200ms 표본은 재현하지 못했다. Chrome의 WSS 송신과 서버 수신 사이 약 62ms, 서버 answer와 Chrome 수신 사이 약 60ms도 있었고 해당 구간에 부모 JS 루프 정지는 없었다. socket·네트워크 전달과 프로토콜 단계를 더 구분할 대상이며 한 원인으로 묶지 않는다.

이 바이너리는 임시 Linux glibc x64 실험 전용이다. 설치·운영 바이너리를 바꾸지 않았다. 임시 빌드의 static OpenSSL 3.0.13·컴파일러를 기존 배포 prebuilt와 동등한 보안·배포 기준으로 승인한 것이 아니다. 제품 적용에는 검토된 upstream/fork 버전, 플랫폼별 고정 도구·암호 라이브러리·공급망 검증과 배포 아카이브·원문 고지가 필요하다. 임시 `.node` 복사나 환경 shim으로 적용하지 않는다.

다음 helper를 첫 인증 송신 ACK 뒤에 보충하는 fixture도 기존 즉시 보충과 교차 비교했다. 첫 방문 두 번의 중앙값은 701.5→614ms였지만 후속 네 번은 266→289.5ms, 실제 복구 두 번은 122.5→174ms로 악화했다. ACK 조건에서도 다음 helper를 fork하기 전 97/114ms의 정지가 나타났다. 보충 작업만을 원인으로 볼 수 없으므로 제품은 즉시 보충을 유지하고 이 조건의 확대 검증은 중단했다.

### 유지보수 중인 암호 라이브러리와 warmup wrapper 수명

설치된 Linux GNU/musl 바이너리에서는 OpenSSL 1.1.1w 문자열과 SSL/crypto 동적 의존성이 없는 것을 확인했다. 시스템 OpenSSL 패키지만 갱신하면 번들 내부 암호 구현까지 바뀐다고 가정하지 않는다. 별도 기준을 위해 공식 OpenSSL 3.5.9 소스의 SHA-256·서명·공식 공개 키 지문을 대조한 뒤 임시 static 라이브러리를 만들었다. 기본 보안 설정을 유지한 네 개 DTLS/SSL API recipe의 외부 검사 일곱 개를 통과했으며, 비-FIPS 기본 구성의 FIPS 준비 recipe는 예상된 skip이었다. 전체 OpenSSL suite·FIPS 검증이나 배포 승인의 결과가 아니다. [공식 소스](https://openssl-library.org/source/)·[보안 공지](https://openssl-library.org/news/secadv/20260929.txt).

같은 wrapper·RTC 원본과 새 암호 기준의 실제 Workspace 검사는 화면·인증 이후 helper 종료에서 SIGSEGV가 났다. 구 3.0 기준에서도 같아 암호 버전 고유 문제로 단정하지 않았다. 자기 자식만 추적한 native debugger는 `ThreadSafeCallback` 소멸→DataChannel wrapper close→전역 close→cleanup stack의 충돌·정지를 확인했다. warmup 채널을 닫고 JS 참조를 버리면 destructor는 실행되지만 SDK 전역 raw pointer 목록에는 남는 경로였다.

닫힌 warmup wrapper 한 개를 최종 cleanup까지 참조하도록 바꾸고 강제 GC로 비교했다.

| SDK 조건 | 참조 해제 열 번 | 참조 보존 열 번 |
| --- | --- | --- |
| 설치 prebuilt | 충돌 9·정지 1 | 정상 종료 10 |
| 같은 도구의 OpenSSL 3.0 기준 | 충돌 10 | 정상 종료 10 |
| 같은 도구의 OpenSSL 3.5.9 기준 | 충돌 7·정지 3 | 정상 종료 10 |

정지는 debugger로 중단한 뒤 함수명만 확인하고 자기 프로세스를 종료했으며 core를 만들지 않았다. native 채널의 close는 즉시 실행돼 shared pointer를 해제하고 두 번째 close도 안전했다. 남는 것은 helper당 닫힌 JS wrapper 최대 한 개이며 추가 소켓·세션·권한을 유지하지 않는다. 실제 Workspace의 참조 보존 조건도 helper 네 개가 모두 정상 종료했다. 저장소에 실제 helper·합성 SDP·격리 NAT 대체물·강제 GC의 회귀 검사를 추가했다. 원본 조건은 SIGABRT/SIGSEGV, 수정 조건은 exit 0이었고 상태·버퍼·GC 12개와 cold/pregather NAT Chromium 2개·타입·lint·문서 검사를 통과했다. 이 수명 수정은 main의 `fae33cc`에 통합했다.

### 원래 주소 검증을 유지하는 비동기 시제품 — 미채택

두 조건 삭제안 대신 Simple/Lookup의 원래 parser·flags·주소 계열·TCP 제한을 보존한 native worker 초안을 만들었다. Simple 한 개와 Lookup 최대 두 개, 실행 중인 작업을 포함한 128개·후보 4KiB 한도, weak peer/ICE·runtime token·epoch·취소 경계를 둔다. peer mutex를 기다릴 때 strong 참조를 잡지 않고 1→2→4→8ms 취소 가능한 재시도를 사용한다. `remoteDescription`에 후보가 즉시 보이는 기존 API와는 달라지고, 새 한도 초과 예외도 생기므로 단순 구현 동등성을 주장하지 않는다.

고정된 OpenSSL 3.5.9 기준/수정 두 바이너리의 44개×다섯 namespace 조건은 성공·계열·포트·파싱 오류가 모두 같았다. 별도 resolver 일곱 개, 실제 peer/ICE 세 개, 실제 NAPI P2P echo·강제 GC 한 개를 통과했다. 이 검사에는 FIFO·한도·Lookup 포화와 숫자 후보 진행·OS 호출 중 close·peer 참조 반환·동일/거절/성공 SDP epoch를 포함한다. 실제 OS DNS의 종료 시간·ASAN/TSAN·모든 플랫폼의 수명을 검증한 것은 아니다.

같은 retained helper와 실제 Workspace의 한 쌍은 첫 메뉴/트리 720/795→661/731ms, 후속 336/406→338/418ms였다. 양쪽 2,174개 모듈·205개 청크와 소스 해시가 같았고 P2P 첫 정적 응답도 63개·1,774,833B로 같았다. 실제 인증·탐색기 전환·설치 자산 불변·각 helper 네 개 정상 종료를 확인했다. 한 쌍의 첫 59/64ms 차이를 안정된 개선이나 500ms 달성으로 해석하지 않는다.

통과 뒤 독립 검토에서 이전 worker의 예외와 새 SDP epoch가 경합하면 새 연결 세대를 닫을 수 있는 실패 callback 경계를 찾았다. 이 가용성 회귀가 남은 버전은 제품에 채택하지 않는다. 실패도 target·epoch·closing CAS로 선형화하는 별도 초안을 검토하며, 닫기 callback을 signaling mutex 안에서 호출해 재진입 교착을 만들지 않아야 한다. 임시 SDK·원본 patch·검증 기록은 구분해 보존하고 설치 바이너리는 바꾸지 않았다.

별도 실패 경계 수정본은 signaling guard 안에서 현재 target·epoch를 확인하고 closing CAS만 확정한 뒤 guard·ICE 참조를 놓고 원래 종료 본문을 실행한다. 새 SDP setter도 같은 closing 경계를 확인한다. 이 버전의 ON 컴파일과 resolver 10개·실제 peer 8개 검사는 통과했다. 정상·실패 Closed callback의 재진입, close/실패 CAS 경합, 이전 실패 뒤 새 SDP 유지도 확인했다. 원래 parser·주소 flags·공개 C++ header·NAPI wrapper 67소스는 바뀌지 않았다. 이전 220개 주소 비교·Workspace 수치는 앞 버전의 결과이며 이 버전의 검증으로 옮겨 쓰지 않는다. OFF 실행·TSAN·Node/NAPI 계측·지원 플랫폼 검증은 남아 있어 계속 미채택이다. OS `getaddrinfo` 자체의 취소나 종료 시간도 보장하지 않는다.

같은 수정 바이너리의 후속 격리 검사 세 개도 통과했다. 실제 NAPI peer 두 개의 양방향 echo·강제 GC 뒤 정상 종료를 확인했고, 시험 이름만 `localhost`의 실제 OS resolver로 연결해 원래 Simple→Lookup→libjuice 전달과 flags를 보존했다. 대상은 시험이 소유한 loopback 소켓뿐이며 hosts 파일을 바꾸지 않았다. 이는 실제 mDNS wire·모든 네트워크의 이름 도달성 검증은 아니다. 반환하지 않는 resolver surrogate에서는 close가 즉시 반환해도 native runtime token 때문에 cleanup이 계속 기다렸고, 실제 부모의 4초 강제 회수가 4,003ms에 작동했다. 부모 event loop는 계속 응답했다. OS resolver 자체 취소나 Node IPC의 정상 close 메시지 경로를 검증한 결과로 쓰지 않는다.

failure-fenced 소스를 새 임시 디렉터리에서 ASAN·UBSAN·프레임포인터로 다시 컴파일해 resolver 10개·실제 peer 8개·성공 Lookup 1개를 통과했다. RTC·libjuice·usrsctp·libsrtp의 compile flags와 archive 참조, 실행 파일의 sanitizer runtime 링크를 대조했다. 자체 user/network namespace의 IPv4·IPv6 dummy와 loopback만 사용했고 default route는 없었다. 정상 종료 시 ASAN·UBSAN·LSAN finding은 없었고 원본 소스·기존 바이너리·설치 SDK는 바꾸지 않았다. 기존 OpenSSL archive·Node/NAPI는 비계측이며 데이터 경쟁·다른 플랫폼·제품 채택의 검증은 남는다.

최신 failure-fenced 바이너리도 같은 OpenSSL 3.5.9 baseline과 현재 실제 README 전체 소스에서 한 쌍 비교했다. Node 24의 첫 메뉴/트리/편집 준비는 650/719/938→650/734/930ms, 후속은 351/421/522→301/374/470ms, 새 RTC 복구는 124→123ms였다. 소스 2,175개·185청크·그래프와 자산은 같았고 인증·편집·같은 frame·helper 총 여덟 개 정상 종료를 확인했다. 양쪽에 같은 IPC·20ms heartbeat 관찰만 더했으며 대표 다섯 번과 합치지 않는다. native 시작→open의 10ms 초과 heartbeat gap은 수정 조건에서 관측되지 않았지만 첫 open은 204→225ms로 늦어졌다. 이벤트 루프 정지 완화와 전체 첫 접속 개선은 별개이며 이 한 쌍도 첫 500ms 달성 근거가 아니다.

### 후보 처리를 event-loop 턴으로 나눈 비교 — 미채택

SDK나 주소 parser 대신 helper의 기존 후보 처리를 한 `setImmediate`에 한 개씩 진행하는 임시 FIFO를 비교했다. 후보 128개 한도·시작 전 초과 처리·close 정리를 보존했지만, 긴 후보 호출은 약 147→143ms로 남았고 각 dequeue 때 대기 후보는 0개였다. 두 조건 모두 answer는 후보 처리 전에 도착했다. 전체 첫 메뉴/트리는 한 쌍에서 750/823→706/782ms였지만 native 채널 열기는 260→291ms로 늦어졌다. 총시간 변동을 FIFO 효과로 채택하지 않았다.

이 비교의 부모·자식은 모두 Node 22.22.2였다. thread-pool·inline dummy PC와 앞선 NAPI 후속 검사도 같은 실제 runtime으로 구분한다. 이후 Node 24.16.0에서 같은 failure-fenced 바이너리의 NAPI echo·GC를 별도로 통과했지만, 이 한 검사로 다른 runtime의 전체 성능 표본을 바꾸거나 모든 ABI·플랫폼 지원을 주장하지 않는다.

### 브라우저 WebRTC 초기화와 신호 전송

호스트·Workers·IDB·서명을 뺀 작은 HTTPS/WSS 대조에서도 Linux Chrome 153의 WebRTC 초기화가 첫 신호 전달과 겹쳤다. 새 브라우저 네 번의 no-RTC/RTC/RTC/no-RTC 조건에서 CDP 송신→Node 수신은 0.96/96.58/66.70/0.33ms였다. 같은 구간에 부모 event loop의 5ms 초과 정지는 없었다. 실제 연결의 TLS 수신→WebSocket message 처리는 약 0.03~0.07ms였고 이미 `TCP_NODELAY`가 켜져 있었다. 이 관측으로 서버 Nagle 지연을 제품 원인으로 단정하지 않는다.

별도 여덟 조건에서는 PeerConnection·DataChannel 생성만으로도 약 85ms가 남았다. `setLocalDescription` 전에 connect를 보내거나 WSS보다 먼저 PeerConnection을 만드는 순서 변경은 준비 시작→answer 전체 시간을 줄이지 못했다. ICE pool도 같은 비용을 앞으로 옮기는 결과여서 제품 순서를 바꾸지 않았다. 각 조건은 한 번이며 평균·상한 보장으로 사용하지 않는다.

사용 중인 프로필과 분리한 Windows Chrome 156의 새 프로세스 네 번도 no-RTC/RTC/RTC/no-RTC로 비교했다. 신호 전달은 0.62/0.54/0.73/0.42ms였지만 두 RTC 조건의 `new RTCPeerConnection()` 자체는 동기로 455.8/441.0ms가 걸렸다. 프로필·프로세스는 해당 fixture가 만든 것만 정리했다. Linux와는 OS·버전·드라이버·프로세스 상태가 달라 OS나 버전 회귀의 증거로 묶지 않는다. 이미 사용 중인 브라우저의 새 탭과도 같은 조건이 아니다.

같은 Windows 버전의 새 프로세스에서 1초 idle 뒤 첫 생성은 451.9ms, 같은 페이지의 두 번째는 0.5ms, 같은 Chrome의 새 페이지에서 1초 뒤 첫 생성은 1.9ms였다. 같은 순서의 신호 전달은 1.11/0.45/0.27ms였다. 한 프로세스 안에서 초기화 결과가 재사용되는 근거이며 1초 idle만으로 최초 비용이 사라지지는 않았다. 이것은 사용자 브라우저를 미리 준비한 제품 변경이 아니며 원래 첫 방문 수치를 대체하지 않는다.

기존 WSS를 시작한 직후 inline 선행 코드에서 브라우저의 임시 PC·DataChannel을 만들고 즉시 닫는 별도 비교도 했다. 같은 실제 소스·설치 CSS/폰트·신뢰된 정적 코드의 정확한 CSP hash 조건에서 첫 메뉴/트리는 708/782→789/861ms, 후속 352/437→329/428ms, 복구는 255→256ms였다. 첫 frame 시작도 442→514ms로 늦어졌고 호스트의 정적 응답 63개·본문 1,775,150B는 같았다. 한 쌍으로 개선 근거가 없어 제품에는 넣지 않았다. 새로 만든 임시 PC를 실제 인증 연결로 재사용하거나 SDP·키·권한 검사를 바꾼 실험은 아니다.

별도 임시 시제품에서는 inline에서 실제 PC·DataChannel을 만들고, 제어기가 검증한 뒤 한 번 인수했다. offer·SDP·fresh nonce·키·ticket·answer·최종 proof 순서는 그대로 뒀다. 같은 전체 README의 한 쌍은 첫 메뉴/트리/편집 준비 680/748/970→676/743/954ms, 후속 323/420/512→341/430/508ms, 복구 139→151ms였다. Linux의 실제 constructor는 2.5→2.7ms였고 생성 횟수·기본 설정·인증·정상 종료를 확인했다. 전체 이득이 일관되지 않아 미채택이다. 슬롯 교체·혼합 버전·만료 등 미실행 수명 경계와 native PC/DC 소속 확인의 한계도 남아 있으므로 정상 한 쌍을 보안 동등성 검증으로 표현하지 않는다.

고정된 [Chromium 156의 PeerConnection factory](https://chromium.googlesource.com/chromium/src/+/1d17a2e2ee147bb7d6ae2ab6abdb3a2510c17775/third_party/blink/renderer/modules/peerconnection/peer_connection_dependency_factory.cc)에는 main→signaling 초기화 대기와 GPU factory 준비가 있다. 데이터채널 전용이어도 공통 codec 지원 조회 경로를 만들 수 있다. 다만 실제 441ms가 GPU·codec·다른 초기화 중 어느 구간이었는지는 stack/trace로 확정하지 못했다. 네트워크 manager 생성 대기만으로 동기 인터페이스 조회를 원인으로 지목하지 않으며 브라우저 보안 플래그·코덱·샌드박스는 변경하지 않았다.

### Early Hints의 자원 preload와 공개 TLS 준비

중앙 HTML의 DB 대기와 공개 자원 준비를 겹치는 대안도 실제 HTTP2에서 비교했다. 103에 Link만 넣으면 최종 `Referrer-Policy: no-referrer`가 도착하기 전에 JS/CSS 요청의 Referer로 탐색 경로·query가 전송됐다. 모두 임시 더미 값으로 검사했다. 103에도 명시적 no-referrer를 넣은 조건은 노출이 없었으나 Cloudflare가 최종 Referrer-Policy를 Link와 함께 복사한다는 보장은 확인하지 못했다. 자원은 최종 HTML 전에 받되 실행은 이후 한 번, 최종 CSP none 조건은 실행·스타일 적용 0회였어도 privacy 동등성을 충족하지 않아 preload는 채택하지 않는다.

대신 공개 앱 origin만의 `rel=preconnect`를 별도 비교했다. 같은 site는 HTML 전 약 3ms에 TLS를 시작했고 HTTP·쿠키·Referer 전송 없이 최종 iframe이 같은 H2 연결을 재사용했다. 다른 site는 TLS를 준비해도 iframe이 별도 연결을 만들어 이득을 확인하지 못했다. 따라서 구현은 검토한 공개 `mew.run`→`app.mew.run` pair의 connect GET·200 HTML만 대상으로 하고 ASSETS의 Link는 상속하지 않는다. HTTP2 다섯 조건과 별도 Workers 여섯 개를 통과했다. [Cloudflare의 URI 캐시·query 무시·캐시 miss·발행 생략](https://developers.cloudflare.com/cache/advanced-configuration/early-hints/) 조건 때문에 최초 URL이나 운영 효과는 보장하지 않는다. zone 설정·운영 배포는 변경하지 않았다.

### 저장된 로그인과 실제 작업 화면

별도 authenticated fixture는 메모리의 가짜 Workspace 대신 설치된 `dist/`를 읽기만 한다. 새 임시 owner·비추출 IDB 키·공개 키 지문에 결합한 실제 trusted session으로 nonce·ticket·키 증명·세션 재개 검사를 통과한다. workspace·user UI·tree 함수는 임시 폴더의 예제 파일만 제공하고 업데이트·에이전트 실행 등 부수 경로는 차단한다. 운영 계정·시크릿·데이터를 읽지 않고 전체 설치 자산의 SHA-256과 mtime이 전후 같은지 확인한다.

동일한 설치 자산·임시 API를 직접 self-host 경로와 비교했다. 브라우저 DOM observer가 실제 메뉴와 예제 파일 트리의 첫 rAF를 각각 기록한다. 앞선 1,155/1,064ms는 Playwright 관측 후 rAF까지의 제어 왕복을 포함했으므로 이 주 지표로 사용하지 않는다.

| 경로 | 실제 메뉴 표시 | 예제 파일 트리 표시 |
| --- | ---: | ---: |
| P2P 첫 방문 | 849ms | 941ms |
| P2P 후속 방문 | 616ms | 699ms |
| 직접 self-host 첫 방문 | 454ms | 544ms |
| 직접 self-host 후속 방문 | 359ms | 416ms |

같은 frame을 유지한 복구 관측은 273ms였다. 이 값은 브라우저 시각의 차이지만 시작·종료를 Node와 Playwright가 제어·검증하는 왕복을 포함한다. 순수 내부 이벤트인 실제 단절→online 지표와 구분한다. 로그인 화면이 나오지 않고 파일·문서 탐색기 전환이 동작했으며 중앙으로 보낸 작업 요청은 0회였다.

직접 self-host의 후속 방문은 App 청크가 40ms, 초기 동적 그래프가 64ms에 완료됐는데 Workspace API는 349ms에 시작했다. 긴 CPU 작업이나 전송만으로 약 285ms를 설명하지 못했고 설치 React의 300ms Suspense 재시도 제한과 일치했다. 이는 timer stack으로 확정하기 전의 원인 후보다. P2P 후속의 호스트 본문은 총 27,562B였고 WOFF 재전송은 없었다.

이것은 실제 설치 UI와 인증/P2P를 사용하는 로컬 결과다. 설치 UI가 후속 소스 변경을 포함한다거나 운영 작업 화면 성능을 보장하지 않는다. 같은 설치 자산·임시 API의 직접 self-host 경로와 비교해 앱 자체 초기화와 Mewlink의 추가 비용을 분리한다. 현재 작업 화면도 500ms 목표에 미달이다.

### 최상위 Workspace의 재시도 지연 제거

인증·저장소 범위·콘텐츠 identity·권한 버전이 준비된 뒤 Workspace를 동적 import하고 일반 Component state로 렌더하도록 바꿨다. 실제 production React의 기존 lazy 경로가 약 255~299ms 재시도 타이머를 기다리는 조건을 통제하니, 새 경로는 같은 모듈 응답 뒤 타이머를 해제하기 전에 마운트했다. 기존 시작·로그인·PC/모바일 도구 경계 검사도 보존해 총 10개를 통과했고 타입·변경 lint·문서 검사도 통과했다. lint는 기존 initialAuth effect 경고 한 개만 남았다.

이 UI 변경의 초기 `0838f9a`는 추가 데모 검사가 없는 고정 snapshot revision 때문에 시작하지 못해 main 통합을 보류했다. 이미 있는 base snapshot으로 재생성한 대조도 원래 압축 크기 상한을 넘었다. 이후 고정 index·초기 사본의 SHA와 이미 공개된 2,003개 본문의 content-address·크기·형식을 확인하는 test-only 경로를 마련했다. 원 Git 객체가 있으면 원래 생성기가 우선이며, fallback을 Git-tree 검증으로 표현하지 않는다. 예산·사본은 바꾸지 않았다. 기존 host 표시 assertion도 서로 다른 API의 관리자 요청과 기기명을 같은 창에서 찾던 문제여서 실제 계정 관리·Mewlink 메뉴에서 각각 검사하도록 옮겼다. 실제 PC·모바일 전체 demo 세 개와 fixture 단위 두 개가 통과했고 UI 통합 검증을 재개했다. [데모 검증 계약](../development/demo.md#검증과-유지보수)이 이 경로를 소유한다.

정확한 전체 소스 A/B는 AppBootstrap의 `3d22d67` 본문과 수정 본문만 바꿨다. 나머지 실제 2,174개 모듈의 합성 해시·205개 청크 수·main/App 소스 해시가 같은지 검사했다. 메모리·임시 fixture 컴파일만 사용하고 운영 `dist/`는 수정하지 않았다. 각 실행의 실제 인증·탐색기 전환·중앙 작업 요청 0건·설치 자산 불변도 통과했다.

이 소스 fixture는 Rolldown의 실제 JS 그래프와 설치된 CSS·폰트를 사용하지만 Vite의 HTML·동적 import preload 생성 후처리까지 재현한 운영 산출물은 아니다. 설치된 authentication 청크는 App과 동기 의존성을 이미 함께 preload하는 반면 이 소스 fixture는 App 수신 뒤 일부 의존성 요청을 시작했다. 같은 fixture의 AppBootstrap A/B와 실제 설치 UI의 측정을 구분하고, 이 차이를 새로운 제품 병목으로 단정하지 않는다.

| 경로 | 기존 메뉴/트리 | 수정 메뉴/트리 |
| --- | ---: | ---: |
| P2P 첫 방문 | 848 / 912ms | 737 / 819ms |
| P2P 후속 방문 | 590 / 690ms | 319 / 427ms |
| 직접 self-host 첫 방문 | 440 / 499ms | 225 / 340ms |
| 직접 self-host 후속 방문 | 353 / 409ms | 71 / 152ms |

직접 self-host의 후속 방문은 App 완료 39ms→Workspace 요청 345ms가 수정 뒤 36ms→60ms였다. 이 A/B와 통제된 React 검사는 최초 마운트의 약 300ms 대기를 제거한 근거다. 별도 수정 소스 실행에서도 P2P 후속 메뉴/트리는 322/407ms였다. 후속 방문의 로컬 목표는 충족한 표본이지만 첫 방문·운영·외부망 500ms를 달성한 것으로 표현하지 않는다.

이후 임시 숫자 후보 수정 바이너리를 같은 실제 Workspace fixture에 연결한 한 번의 실행은 P2P 첫 메뉴/트리 583/666ms, 후속 362/463ms였다. 같은 실행의 직접 self-host는 첫 200/318ms, 후속 69/163ms였다. 실제 인증·탐색기 전환·중앙 작업 요청 0건·설치 자산 불변을 확인했다. 이 실행과 앞선 Workspace 표는 네이티브 도구·암호 라이브러리도 달라 두 조건만의 정확한 A/B로 사용하지 않는다. 패치 자체의 비교는 위의 같은 도구로 만든 baseline/수정 쌍과 구분한다. 실제 작업 화면도 첫 방문 500ms에 미달한다.

이 실행에서 직접 경로의 메뉴 69ms→트리 163ms를 별도 계측했다. Workspace 응답 완료 68ms→적용 103ms, UI·tree 요청 110~112ms→네트워크 완료 125ms→JSON continuation 150ms, sidebar 복원 153ms→React render 153ms→FileTree layout 156ms→rAF 163ms였다. sidebar의 ref만 바꾸는 경로가 render를 늦춘다는 가설은 이 재현에서 지지되지 않아 수정하지 않았다. CPU profile과 실제 callback breakpoint는 코드 평가·editor 초기화·layout 중 추가 구분을 위한 진단이며, 그 계측의 느린 수치를 성능 결과로 사용하지 않는다.

### 편집기 자체의 재시도 대기 제거

저장된 예제 README의 실제 권한·본문 캐시·파일 버전 확인을 통과한 뒤에도 하위 `EditorPane`의 lazy 경계가 남았다. 한 후속 방문에서 import 완료 522ms→첫 EditorState 770ms였고 React의 남은 재시도 대기는 약 239ms였다. 편집기만 일반 Component state로 바꾼 임시 비교에서는 import→EditorState가 약 230→8ms였다. 다른 도구·프리뷰의 지연 경계와 파일·협업 검사는 유지했다.

추출한 제품 helper는 계정·역할·루트·게스트/협업 상태·현재 권한 버전을 결과에 결합한다. 실제 production React의 보류된 재시도와 기존 `deferredComponent`를 비교하는 검사, 범위 변경·오래된 성공/실패·unmount·현재 오류 검사 여섯 개와 기존 UI 열 개가 통과했다. 실제 README 전체 소스 fixture 한 번에서도 import→EditorState는 첫 11ms·후속 6ms였고 편집 가능한 CodeMirror·현재 인증·파일 버전·같은 콘텐츠를 확인했다. helper 네 개가 정상 종료했으며 canonical fixture·설치 자산은 바뀌지 않았다.

| 실제 소스 README 경로 | 메뉴 | 탐색기 | 편집 준비 |
| --- | ---: | ---: | ---: |
| P2P 첫 방문 | 735ms | 834ms | 1,064ms |
| P2P 후속 방문 | 377ms | 478ms | 577ms |
| 직접 self-host 첫 방문 | 191ms | 361ms | 433ms |
| 직접 self-host 후속 방문 | 103ms | 214ms | 269ms |

각 조건 한 번이며 단계 계측과 Vite 최종 preload 후처리 부재의 한계가 있다. 최상위·하위의 불필요한 React 대기를 제거한 근거와 전체 첫 접속 500ms 달성 여부는 구분한다. 이 실행도 첫 접속과 후속 편집 준비는 목표에 미달이다.

### 작업 화면의 정적 의존성 묶음

작업 화면과 편집기를 각각 재귀 그룹으로 묶은 임시 한 쌍은 JS 요청 59→18개, 편집 준비 첫 1,059→947ms·후속 592→499ms였다. 전체 소스와 초기·인증 모듈 집합, 기존 동적 import 경계는 같았지만 실제 PC·모바일 검사에서 편집기 응답을 보류하면 설정 창도 기다렸다. 공유 의존성이 큰 편집기 청크로 이동한 가용성 회귀여서 이 조합은 채택하지 않았다.

편집기 그룹을 빼고 `App` 정적 의존성만 묶은 제품 후보는 95개 기존 동적 경계·23개 도구의 새 유입 없음과 초기·인증 모듈 집합 동일을 확인했다. 호출자가 이미 준비한 작업 화면 청크에 대한 의존성만 허용하고, 편집기 보류 중 설정 열기의 PC·모바일 검사도 통과했다. 기존·새 UI 검사는 17개 모두 통과했고 타입·lint 검사도 통과했다.

같은 실제 README 소스의 App 그룹 비교 한 쌍은 첫 메뉴/트리/편집 준비 693/774/1,189→720/805/1,119ms, 후속 558/688/807→346/463/580ms였다. 직접 self-host는 첫 243/374/571→161/296/464ms, 후속 153/287/357→101/222/285ms였다. 양쪽 실제 인증·파일 버전·편집·탐색 전환·설치 자산 불변과 helper 네 개씩 정상 종료를 확인했다. 후속 기준의 전체 연결 변동이 커 이 총시간 차이를 청크 그룹만의 효과로 주장하지 않는다. 요청 수·로딩 경계의 효과와 운영 Vite의 preload 후처리·외부망 성능은 계속 구분한다.

### 계측을 줄인 실제 README 반복 측정

제품의 현재 helper와 설치된 SDK를 사용해 새 호스트·Workers·Chromium 프로필로 다섯 번 반복했다. 매번 비추출 IDB 키와 그 지문에 결합한 실제 trusted session만 사전에 등록했고 UI·네트워크 캐시는 비웠다. 실제 App·EditorPane·CodePane을 그대로 사용하며 소스 계측·언어 기능 대체·Profiler·trace·보류 타이머를 모두 제거했다. DOM observer만 rAF에 묶어 실제 메뉴·파일 트리·저장된 README의 편집 가능한 CodeMirror를 기록하고 종료했다.

| 경로·대상 | 중앙값 | 범위 | 500ms 이하 |
| --- | ---: | ---: | ---: |
| 첫 방문 메뉴 | 679ms | 660~815ms | 0/5 |
| 첫 방문 트리 | 772ms | 750~895ms | 0/5 |
| 첫 방문 편집 준비 | 947ms | 933~1,096ms | 0/5 |
| 후속 방문 메뉴 | 339ms | 316~356ms | 5/5 |
| 후속 방문 트리 | 411ms | 398~431ms | 5/5 |
| 후속 방문 편집 준비 | 507ms | 486~538ms | 2/5 |
| 실제 RTC 종료 뒤 새 인증 연결 복구 | 141ms | 121~155ms | 5/5 |

후속 방문은 같은 프로필의 새 탐색이다. 복구는 현재 소유한 helper만 기존 close IPC로 종료한 뒤 새 native 연결·동일 계정의 인증 재확인·같은 frame과 README를 검증했다. 시작 직전부터 복구 overlay가 사라진 다음 rAF까지 같은 최상위 브라우저 시계로 측정했으며 Playwright polling 종료 시각을 지표로 쓰지 않았다. 별도 예비 한 번은 이 다섯 표본에 합치지 않았다.

실제 부모·자식은 Node 24.16.0이고 20개 helper가 모두 정상 종료했다. 소스 그래프·SDK SHA와 Node 버전·실행 경로는 일치했고 설치 자산의 SHA·mtime은 불변이었다. 호스트 online부터 첫 탐색 명령까지는 848~896ms로, 앞선 1.5초 이상 준비한 조건과 구분한다. 실제 로그인 전환·중앙 작업 요청은 없었다. 관측한 non-GET request ID의 중복은 0개지만 편집 입력을 만들지 않았으므로 새 ID를 사용한 의미적 쓰기 재전송까지 증명한 것은 아니다. 첫 방문 JS 요청은 39개·정적 요청은 45개였고 후속 JS·폰트 전송은 없었다.

이 측정도 Vite의 최종 preload 후처리·운영 네트워크·Windows의 새 프로세스를 재현하지 않는다. 새 UI 캐시를 가진 첫 방문은 목표에 미달했고, 기존 캐시의 편집 준비도 다섯 번 중 세 번은 500ms를 넘었다.

별도 한 번은 DOM 준비 뒤 완료된 ResourceTiming만 읽었다. 첫 UI 문서 368ms→main 완료 422ms→인증 청크 473ms→작업 화면 청크 526ms→메뉴 575ms, 후속은 183→220→253→271→319ms였다. 작업 화면 청크 뒤 약 48~49ms에는 custom transport API·React·렌더가 섞여 있어 CPU 시간으로 단정하지 않는다. Regular 폰트는 첫 App과 겹쳐 519ms에 끝났고 Bold·Mono는 메뉴 뒤에 시작했다. 이 표본도 첫 500ms에는 미달이며 앞선 다섯 번에 합치지 않는다. ServiceWorker 응답은 첫 방문에도 transferSize 0·cache로 나타나므로 이를 호스트 P2P 캐시 hit의 근거로 사용하지 않는다. native/WSS를 관찰하지 않아 UI 문서 시작 전 구간과 bridge 대기의 원인은 이 자료로 확정하지 못했다.

같은 소스 그래프를 메모리에서 한 번 더 분해하니 약 1MB의 공통 editor 청크는 CodeMirror가 아니라 Tiptap·ProseMirror였다. 일반 텍스트 README도 `EditorPane`의 정적 rich Editor와 `CodePane`의 annotation/comment helper, `DatabaseListModal`의 root export 경로를 통해 이를 받았다. 좁은 helper export와 rich Editor의 조건부 준비를 분리할 여지가 있지만, 이 청크의 요청은 메뉴 575ms 뒤인 625ms에 시작했다. 첫 메뉴 500ms의 직접 해결책으로 보지 않으며 기본 Markdown WYSIWYG의 새 waterfall·ref·협업·권한·공용 CSS 회귀도 검증하지 않아 채택하지 않았다.

### 연결이 살아 보이는 복귀 이벤트

실제 인증·화면 표시 뒤 시험이 소유한 RTC helper만 `SIGSTOP`으로 정지했다. 부모 프로세스와 WSS는 유지한 채 online·pageshow·visible 이벤트를 보냈다. 세 번의 WSS lease 응답이 있었지만 RTC는 연결된 상태로 남았고, 약 5,945ms 뒤에야 `disconnected`가 됐다. 그때 즉시 `SIGCONT`하니 약 5,965ms에 같은 peer가 connected로 돌아왔다. 새 ticket·인증을 마친 새 연결의 복구 시간이 아니며 실제 Wi-Fi 전환도 아니다.

이 표본은 복귀 이벤트 뒤 RTC 자체의 단절 감지를 기다리는 구간이 별도로 길 수 있다는 근거다. 짧게 나타난 overlay를 polling이 놓친 초기 출력의 “7초 동안 감지 없음” 해석은 폐기했고, 영속 DOM mark와 실제 peer sequence로 정정했다. Node 24의 소유 helper 세 개는 정상 종료했으며 쓰기 요청은 없었다. foreground에서 현재 RTC data path를 제한된 읽기 요청으로 확인하는 방안은 혼잡·스트림 한도·취소·현재 인증 검사가 경합하는 경우를 먼저 검증해야 하며 아직 제품에 넣지 않았다.

별도 시제품은 visible·online 복귀 때만 기존 request quota 안에서 favicon HEAD 한 개를 보내고, 실제 인증 확인 중·busy 요청·backpressure·세대나 세션 변경에서는 판정을 취소하도록 했다. 최종 판정은 1,500ms, 단순 관찰은 500ms였으며 인증을 허용하거나 쓰기를 재전송하지 않는다. fake clock·실제 stream slot을 이용한 회귀 검사 28개와 타입 검사는 통과했지만 실제 native 시험 두 번은 모두 새 인증 복구 assertion에서 실패했다. 정상 HEAD는 3~4ms였으나 정지 조건의 진단에서는 95ms 뒤 앱 요청이 생겨 보수적 guard가 취소했고, 약 6,480ms 뒤 native 감지·같은 peer 복귀로 끝났다. 각 실행의 소유 helper 세 개는 정상 종료했고 제품·설치 자산은 불변이었다. 이 시제품은 1,500ms 복구의 성과가 아니며, 중간 요청을 무시하는 방향으로 조건을 완화하지 않고 미채택으로 남긴다.

같은 DTLS·DataChannel을 유지하는 ICE restart도 소스만 검토했다. 현재 native API에는 restart가 없고 polyfill 메서드는 미구현 예외다. 보존된 libjuice 소스는 기존 remote ICE credentials의 변경과 gathering 이후 local credentials의 변경을 거절하며 설치 Linux 바이너리 문자열도 이 경로와 부합한다. [표준의 restart](https://w3c.github.io/webrtc-pc/#dom-rtcpeerconnection-restartice)가 가능하다는 사실과 현재 SDK의 지원은 구분한다. 기존 signal-resume도 동일 SDP·키·lease의 WSS 재부착이며 재협상이 아니다. 지원 backend와 별도의 nonce·SDP hash·restart epoch·현재 권한 검증이 필요하고, SIGSTOP으로 멈춘 동일 helper는 restart offer도 처리할 수 없으므로 이 시험의 약 6초를 즉시 해결하는 변경으로 보지 않는다. 제품 수정·SDK 교체·실행 실험은 하지 않았다.

### 공식 폰트 분할 비교 — 미채택

익명 로그인 화면의 약 809KB와 달리 위 실제 Workspace 첫 표시에서는 Regular 완본 438,540B가 필요했고 Bold는 받지 않았다. IBM Plex Sans KR 1.1.0의 공식 WOFF2 분할 원본과 400/700·`font-display: swap` 조건을 별도 임시 fixture에서 비교했다. 완본·분할의 문자 coverage 합집합은 같았고, 실제 Workspace의 가시 Sans 문자 83종은 Regular 7개·72,156B로 줄었다. 다만 전체 분할 CSS는 104,345B(gzip 22,004B)이고 작은 폰트 요청도 늘어난다. 이 문자 수는 임시 예제 화면의 관측이며 모든 사용자 문서의 크기 추산으로 사용하지 않는다.

같은 소스 그래프와 실제 인증·탭 전환을 유지했지만 분할본은 64개 캐시에서 JS를 밀어냈다. 후속 Workspace도 폰트 27,956B와 JS 3개를 다시 받았고 완본의 같은 후속 방문은 정적 본문·폰트·JS 재전송이 없었다. 188개 분할 자원을 순차 요청한 압박 뒤 캐시는 64개·재검증 64경로·encoded query 4,419B 한도를 지켰지만 다음 UI는 JS 59개·약 1.31MB를 다시 받았다. 1초 검증 수명이 지난 뒤의 자원별 304와 현재 호스트 SHA 검사는 유지됐다. 캐시 한도를 지켰다는 사실과 재방문 성능 보존은 별개다.

완본 대조 16개 샘플은 모두 같았으나 분할본은 같은 weight·크기의 샘플 8개에서 픽셀이 달랐고 NFD 한글은 폭도 바뀌었다. coverage만으로 글자 조합·렌더 동등성을 보장할 수 없어 제품에 채택하지 않았다. 예시에서 고른 14개만 사용하는 혼합안도 실제 화면에 필요한 분할 하나를 놓쳐 완본까지 받으면 501,660B가 되는 추산이었으며 브라우저 실행은 하지 않았다. 설치 폰트·CSS·의존성·운영 자산은 변경하지 않았다.
