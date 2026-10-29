---
title: "Mewlink 중앙 서비스 배포 기록"
description: "Mewlink 중앙 서비스의 2026-10-12~24 배포·접속·키 보존·인증 및 지연 검증 기록. 반복 운영 절차와 현재 적용 상태를 구분한다."
updated: "2026-10-29"
---

## 2026-10-24 단회 준비·ICE 사전 수집·정적 자원 재검증

**2026-10-24 사용자 요청으로 로컬 빌드·재시작과 중앙 운영 배포를 완료했다. 500ms 달성은 아직 검증되지 않았다.** [원격 접속 계약](../development/remote-access.md)·[ADR 0060](../decisions/0060-mewlink-startup-handoffs.md)·[단계별 측정](../research/mewlink-startup-latency.md)을 함께 확인한다. 실제 로그인 화면과 저장된 로그인의 작업 화면을 구분해 측정한다.

### 운영 반영 결과

중앙 `mewlink`의 버전 `31744c32-0661-41cc-8ee4-3b4f587495ba`를 100% 배포했고 `0006_instance_rate_keys.sql` 적용 뒤 남은 migration이 없음을 확인했다. 기존 Worker secret은 다시 업로드하지 않고 유지했으며 D1·DO·기기 등록을 재생성하지 않았다. `--keep-vars`로 기존 운영 변수도 보존했다. 로컬은 기존 Node 실행본과 `./mew` 관리 방식을 유지해 재시작했다. 로컬 응답의 index entry·main 본문이 새 `dist`와 일치했고, 중앙 메인·앱 config·데모가 200·CSP 응답을 반환했다. 이 확인은 실제 계정의 전체 P2P 접속·회수·모바일 망 전환이나 표시 시간의 검증을 대신하지 않는다.

로컬 `npm run build`·중앙 타입 검사·중앙 Vite 빌드는 통과했다. `build:demo`는 고정 demo 저장소가 참조하는 과거 commit `a7bae991ce8f077af8504beacade86491ba4dc1d`가 로컬에 없어 실패했다. 기존 데모를 바꾸는 작업으로 넓히지 않고 아래 유지보수 경로로 기존 `dist/demo` 4,636개 파일을 별도 보관·복원해 모든 SHA-256 일치를 확인한 뒤 Worker와 런처만 갱신했다. 실패한 새 demo 산출물을 배포하지 않았다. 이전 로컬·중앙 자산과 배포 버전 정보는 로컬 Git 메타데이터에 보존했다.

컴파일을 인증 대기와 겹치는 시제품·새 SDK·폰트 분할·HEAD liveness 시제품은 이 배포에 포함하지 않았다. 이 절 아래의 운영 미적용·미배포 표기는 당시 검증 시점의 기록이며, 이번 운영 반영 여부는 이 절이 기준이다. 표시 지연의 실제 성과와 한계는 [측정 기록](../research/mewlink-startup-latency.md)을 따른다.

| 변경 | 반영 위치 |
| --- | --- |
| HTML의 단회 admission·D1 왕복 축소 | 중앙 D1 `0006_instance_rate_keys.sql`을 먼저 적용하고 Worker·connect HTML·해시 청크를 함께 반영한다. 기존 한도 키·기기 ID·서명 키는 유지한다. |
| 호스트 단회 challenge·generation 사전 공급 | 중앙 Worker와 로컬 호스트. DO가 `mew_signal_preparations`를 자동 생성하고 소비 기록을 만료까지 유지한다. 구버전·소진은 ready 경로를 사용한다. |
| 네이티브 초기화·인증서·ICE 사전 수집 | 로컬 호스트. 별도 대기 helper 한 개와 30초 소켓 회전을 사용한다. 실제 prepare 전에는 공유기 매핑을 하지 않는다. 닫힌 warmup wrapper는 최종 cleanup까지 참조해 조기 GC 뒤 충돌·정지를 막는다. |
| Linux 비동기 경로·주소 조회와 helper 종료 기한 | 로컬 호스트. 선택 인터페이스·주소 검증을 유지하고 동기 OS 조회를 피한다. 활성·대기 helper는 close 뒤 4초 안에 종료하지 않으면 강제 회수한다. |
| 코드·글꼴의 현재 호스트 SHA-256 묶음 검증 | 로컬 UI router와 중앙 앱 브리지. 기존 캐시 본문 재해시·호스트 분리·단절 시 사용 금지를 유지한다. |
| 정적 선행 코드·인증 조회 공유·JOSE 병렬 다운로드·빠른 복구 | 중앙 Worker·런처와 로컬 앱 UI. Worker가 같은 ASSETS HTML의 정확한 정적 본문 해시만 CSP에 허용한다. 구버전은 외부 진입점으로 연결하며 현재 계정·인증 수단 확인과 쓰기 작업 재전송 금지를 유지한다. |
| 브라우저 키 준비 결과 공유·공개 JWK export 병렬화 | 중앙 런처. 실제 비추출 키의 단회 준비 결과를 공유하며 IDB 원자적 저장·동시 탭 경합·취소를 유지한다. |
| 공개 앱 origin의 TLS preconnect | 중앙 Worker. 검토한 `mew.run`→`app.mew.run` connect GET HTML만 공개 origin 하나를 Link로 제공한다. Cloudflare zone의 Early Hints 활성·캐시가 별도로 필요하고 최초 URI·103 발행·개선량은 보장하지 않는다. 추가 migration·키 변경은 없다. |
| Workspace·편집기 렌더 대기 제거와 작업 화면 청크 묶음 | 로컬 Mew UI 변경. 인증·계정 저장소·권한 버전 설정 뒤 동적 import하며 다른 도구·프리뷰 경계는 유지한다. 편집기 전체의 공유 의존성을 묶는 안은 설정 창을 막아 제외했다. 고정 공개 자료를 검증하는 데모 테스트 경로와 실제 PC·모바일 검사를 통과했다. 적용에는 로컬 UI 빌드가 필요하며 중앙 변경만으로 반영되지 않는다. |

기존 기기는 `instance_rate_keys`의 값이 없으면 첫 조회에서 기존 경로로 연결하고 키를 보충한다. 이 행은 한도 키의 계산 결과이며 인가 사본이 아니다. 키가 맞지 않으면 허용하지 않는다. DO는 단회 admission 소비용 `mew_signal_admissions`도 자동 생성한다. 새 테이블을 적용해도 계정·브라우저 회수 상태·기기 등록·서명 키·데모 자산을 지우지 않는다.

admission은 연결 한도를 미리 소비한 10초 증명이다. 만료·IP 변경 뒤 기존 경로로 돌아가면 횟수를 추가 소비할 수 있다. Worker와 새 HTML·청크가 불일치해도 보수적으로 한도를 적용하므로 버전을 맞춰 배포한다. 되돌릴 때는 추가 테이블을 보존하고 Worker·HTML·청크를 같은 버전으로 복귀한 뒤 열린 탭을 새로고침한다.

preconnect의 로컬 HTTP2 검사는 HTML 전 TLS 시작·HTTP/Referer 전송 0건·같은 site iframe의 연결 재사용을 확인했다. 다른 site는 재사용되지 않아 검토하지 않은 origin pair에는 hint를 넣지 않는다. 자원 preload는 103에 최종 `no-referrer`가 동반되지 않을 때 URL 경로·query가 Referer로 나가는 것을 확인해 채택하지 않았다. zone 설정·운영 응답은 변경하지 않았으며 Link 캐시·query 무시·생략·이전 hint 잔존은 [Cloudflare 계약](https://developers.cloudflare.com/cache/advanced-configuration/early-hints/)을 따른다. zone 활성 여부와 실제 103·Referrer-Policy·CSP·새 브라우저 시간을 운영 반영 뒤 확인한다.

기존 운영을 갱신할 때 `npm --prefix mewlink run deploy`를 단순 업로드 명령으로 취급하지 않는다. 이 스크립트는 데모 재빌드·중앙 빌드뿐 아니라 D1 생성 가능 단계·원격 migration·secret 확인/업로드도 포함한다. 원격 migration은 `CI=true`로 확인 프롬프트를 생략하며, 뒤의 키 확인이나 업로드가 실패해도 이미 적용한 migration은 남는다. 중앙 Vite 빌드는 `dist/demo`를 지우므로 기존 데모를 유지하는 갱신은 별도 보관·복원·해시 대조가 필요하다. 기존 등록과 키를 유지하는 단계별 배포 경로와 일반 초기 설치 경로를 구분한다.

검증 결과와 실제 적용은 구분한다. 사용자가 빌드·중앙 배포·로컬 적용을 수행한 뒤 첫 방문·후속 방문·같은 RTC 시그널링 재부착·새 RTC 복구·회수·계정 변경·모바일 망 전환을 확인한다. nonce·ticket·admission·SDP·ICE·세션을 운영 로그에 남기지 않는다.

구현 검증 시점에는 원격 접속 35파일·217개, 중앙 Workers 20파일·158개, 실제 Chromium CSP 6개, Node HTML 생성 hook 1개가 통과했다. 루트·중앙 타입 검사와 변경 파일 lint·문서 검사도 통과했다. 이는 운영 배포·외부망 500ms 달성의 증거가 아니며 이후 반복 측정은 [측정 기록](../research/mewlink-startup-latency.md)이 소유한다.

## 2026-10-23 공개 런처 캐시·브리지 사전 준비·초기 청크

**코드와 격리 검증 단계이며 운영에는 미배포 상태다.** 대기 화면부터 Mew 표시까지의 다운로드·직렬 준비를 줄인다. [공개 런처 캐시와 브리지 준비 계약](../development/remote-access.md#중앙-공개-런처와-설치된-호스트-코드의-캐시-구분), [초기 청크 계약](../development/architecture.md#브라우저-첫-시작), [ADR 0050](../decisions/0050-mewlink-startup-preparation.md)이 범위와 보안 경계를 정의한다.

| 변경 | 적용 위치·검증 범위 |
| --- | --- |
| 해시 공개 JS/CSS의 브라우저 캐시 | 중앙 Worker 변경. 작은 번들 fixture의 첫 JS/CSS 전송 389B/329B가 후속 문서에서 0B/0B였고 새 해시는 390B/330B를 다시 받았다. 503 뒤 다음 요청의 200도 확인했다. 운영 런처의 크기나 초 단위 개선 수치가 아니다. |
| 앱 브리지 사전 준비 | 중앙 connect 런처 변경. 공개 HTML의 origin을 먼저 확인하고 bootstrap 대기와 숨은 브리지 다운로드를 겹친다. 각각 300ms 지연의 fixture에서 기존 887ms→조기 396ms였다(각 1회·실제 망/ICE 제외). 기기 context·포트·설치 UI 요청은 기존 검증 경계를 따른다. |
| 초기 정적 청크 묶음 | 로컬 Mew UI의 다음 빌드에 적용. 실제 시작 코드·모의 Workspace fixture의 초기 JS 요청 8→3개, 로그인까지 9→4개. 실제 작업 화면 전체의 청크 수와 접속 시간은 별도로 측정해야 한다. |

검증은 중앙 캐시/역할 페이지 Workers 검사 7개·캐시 Chromium 1개, 준비 취소·위조 ready·설정 불일치·구버전·같은 계정 복구를 포함한 startup 브라우저 12개 경로를 분할 실행해 확인했다. 실제 Workers/DO·네이티브 RTC·Chromium의 P2P 통합 1개도 통과했다. 루트의 초기 청크·인증 경계·P2P 자원 압축/재검증·상대 preload 경로 검사 5개, 루트·중앙 타입 검사와 변경 파일 lint, 문서 description/링크 검사를 통과했다. 보안 검토에서도 인증·호스트 코드 재검증·정확한 탭/토큰 확인이 유지됨을 확인했다.

사용자가 기존 중앙 절차로 런처 자원과 Worker를 함께 배포하고, 로컬 Mew UI도 다음 빌드·적용을 수행한다. 중앙 변경만 적용하면 이전 호스트와 계속 연결되지만 로컬 청크 묶음은 바뀌지 않는다. D1 migration·기기 재등록·키 교체는 필요 없다. HTML·키·인증 API·Service Worker와 호스트 코드의 현재 P2P 재검증을 캐시 대상으로 넓히지 않는다. 비공개 중앙 소스·테스트의 공개 Git 제외는 유지한다.

배포 후 새 브라우저와 후속 방문에서 첫 HTML→bootstrap→P2P 준비→실제 Mew 화면 표시를 나눠 다시 측정한다. 런처 캐시는 따뜻한 방문에서, 브리지 중첩은 첫 방문에서도 효과 후보이며 외부망·휴대폰에서의 실제 단축량은 미측정이다. 변경을 되돌릴 때는 Worker와 역할별 HTML/청크를 일치시킨다. HTML을 저장하지 않으므로 다음 탐색은 배포된 HTML이 선택한 해시 파일을 사용하지만 이미 열린 탭은 새로고침이 필요할 수 있다.

## 2026-10-22 접속 지연 재측정과 요청 한도 batch

**요청 한도 batch는 로컬 비공개 중앙 소스의 변경이며 운영에는 미배포 상태다.** 기존 운영 주소를 새 Chromium 컨텍스트에서 열고 익명 로컬 로그인 화면의 비밀번호 필드가 보일 때까지 측정했다. 같은 탭의 후속 방문 두 번도 비교했다. 저장된 로그인 세션·로그인 후 workspace·휴대폰 외부망은 포함하지 않는다.

| 적용 전 측정 | 첫 방문 | 후속 방문 1 | 후속 방문 2 |
| --- | --- | --- | --- |
| 로그인 화면까지 | 4.478초 | 2.220초 | 2.211초 |
| 중앙 challenge 수신 | 2.358초 | 1.181초 | 1.073초 |
| ticket 수신 | 2.852초 | 1.723초 | 1.555초 |
| 호스트 answer 수신 | 3.032초 | 1.890초 | 1.704초 |

모든 시각은 탐색 시작 기준이다. 세 번 모두 새 WebSocket bootstrap을 사용했고 `/central/launch`·`/central/key`·`/config` HTTP 요청은 없었다. 첫 방문은 HTML·런처 코드·앱 프레임 준비가 더 오래 걸렸고, 후속 방문에도 challenge·ticket·answer 대기가 남았다. 이 관측만으로 개별 DB 쿼리·네트워크·DO 실행의 소요 시간을 확정하지 않는다.

중앙 Worker의 bootstrap 경로는 기기 조회 뒤 요청 한도를 세 번 순서대로 D1에 요청했다. `mewlink/src/store.ts`의 `limitedBatch`와 `mewlink/src/worker.ts`의 호출을 통해 세 검사를 한 번의 DB 호출로 묶었다. 한도·검사 순서·거절 후 카운터·만료·구버전 경로는 [현재 접속 계약](../development/remote-access.md#연결-인증과-회수)을 따른다. [D1 batch 계약](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)에 따라 SQL은 같은 트랜잭션에서 순서대로 실행한다.

격리 검증에서 `rate-limit.test.ts`·`bootstrap.test.ts`·`worker.test.ts`·`signaling-performance.test.ts`·`signaling.test.ts`의 46개 검사와 실제 Workers/DO·네이티브 RTC·Chromium의 `p2p.browser.test.ts` 1개가 통과했다. 중앙 타입 검사·변경 파일 lint·문서 description/링크 검사도 통과했으며 기존 lint 경고 3개는 유지했다. 이 결과는 위 운영 측정 이후 수정본의 로컬 검증이다.

기존 중앙 배포 절차로 사용자가 Worker를 반영한다. 이번 변경만 적용할 때는 로컬 mew UI 빌드·호스트 재시작·D1 migration·재등록이 필요 없다. 비공개 `mewlink/`의 소스와 테스트는 계속 공개 Git에서 제외한다. 이전 Worker로 복귀해도 DB 스키마와 카운터 키는 같다. 배포 후 동일 조건의 첫 방문·후속 방문을 다시 측정해야 하며, DB 왕복 두 번 제거를 실제 초 단위 개선이나 0.5초 달성으로 표현하지 않는다.

## 소비 기반 전송과 시그널링 재부착 적용

[표시용 도구 이벤트](../decisions/0031-agent-display-events.md)·[소비 기반 전송](../decisions/0032-mewlink-consumer-flow-control.md)·[시그널링 재부착](../decisions/0033-mewlink-signaling-resume.md)는 적용 위치가 다르다. 전사 투영·선표시와 송신 제어는 로컬 서버, 앱의 수신 제어는 로컬 UI 빌드, 각 브리지와 중앙 시그널링은 Mewlink 런처·Worker가 담당한다. 중앙만 배포하면 기존 호스트와 계속 연결되지만 로컬 서버·UI 변경까지 적용되지는 않는다.

중앙과 로컬 실행본을 모두 적용한 뒤 새 기기 페이지를 열어 기능 협상을 확인한다. 미협상 상대는 기존 16개 공통 슬롯·HTTP 수신 창·전체 RTC 복구를 사용한다. 새 상대는 HTTP·WS 슬롯 분리와 소비 기반 수신 창, 현재 lease 안의 같은 RTC 시그널링 재부착을 사용한다. 실제 연결의 회수·로그아웃·만료 검사를 생략하지 않는다.

이 변경에는 D1 migration·기기 재등록·키 교체가 필요 없다. DO는 분리된 시그널링 상태를 기존 SQLite에 추가하며 최대 8개와 기존 만료 시각으로 정리한다. 구버전 복귀 시 회수의 DO·D1 보존 규칙은 아래 절을 따른다. 새 재부착 상태가 구버전에서 사용되지 않으면 기존 전체 재연결로 복귀하며, 소켓 상태 전체를 잃는 플랫폼 강제 종료까지 무중단을 보장하지 않는다.

2026-10-20 중앙 변경 배포에서는 기존 운영의 데모 HTML과 로컬 자산이 같은지 확인한 뒤 데모 파일 565개를 보존했다. `mewlink/`에서 런처를 빌드하고 데모 파일을 복원·해시 대조했다. 기존 Worker·D1 ID·공개 origin·서명 공개 키를 확인하고 프로젝트 Wrangler의 `deploy --dry-run --keep-vars` 뒤 `deploy --keep-vars`로 배포했다. 초기 설정·새 DB 생성·secret 업로드와 루트 앱·데모 재빌드는 수행하지 않았다. 일반 초기 설치는 아래 절차를 따른다.

### 2026-10-20 운영 검증

활성 버전은 `35616b2c-18ad-4315-bf9f-6f2144aac36f`이며 12:01:12 UTC에 100% 배포했다. 서명 공개 키와 기존 데모 HTML이 배포 전과 같은 것을 확인했다. 이전 버전은 `4c888aac-7ce5-4b95-b385-b513333f34a4`다. 로컬 mew 서버는 빌드·재시작하지 않았으므로 대화 표시용 전송·호스트 송신 창·앱 수신 창·native ACK 격리의 운영 적용은 남아 있다.

업로드 직후에는 일부 DO가 `context`·`signalResume` 없는 이전 challenge를 보내 HTTP launch로 우회했다. 이후 새 challenge를 직접 확인한 뒤 아래 브라우저 검사를 다시 수행했다. 배포 100% 표시는 이 응답 검증을 대신하지 않는다. Worker와 DO의 신구 코드가 전파 중 섞일 수 있으므로 실제 bootstrap challenge를 확인한다. 같은 클래스의 코드 수정에 별도 DO 마이그레이션은 필요 없다. [코드 업데이트](https://developers.cloudflare.com/durable-objects/platform/known-issues/#code-updates) · [기존 클래스 코드 배포](https://developers.cloudflare.com/durable-objects/reference/durable-object-class-migrations-legacy/)

| 검사 | 실제 결과·범위 |
| --- | --- |
| 새 Chromium 세션 3개의 첫 접속·새로고침 | 6회 모두 WebSocket bootstrap. `/central/launch`·`/central/key`·`/config` HTTP 각 0회, 연결 오류 0건 |
| 익명 로컬 로그인 화면까지 | 첫 접속 1.95~2.85초·중앙값 2.35초, 새로고침 1.76~2.30초·중앙값 2.19초. 현재 측정 환경이며 0.5초 목표 미달 |
| 마지막 연결 유지 | 80초·서버 갱신 요청 7회, 추가 시그널링 연결·RTC 재접속·오류·복구 안내 0건 |
| 격리 회귀 | Workers 93개, 소비 기반 전송 관련 61개, 시그널링 복구 관련 52개·호스트 startup 13개 통과. 범위가 겹치므로 합산하지 않음 |
| 브라우저 회귀 | 14개 경로를 분할 실행해 통과. 실제 RTC·양쪽 신호 순단·정상 종료 뒤 전체 재연결·65초 갱신·혼합 전송·회수 포함 |
| 정적 검증 | 로컬·중앙 타입 검사, lint와 문서 description·링크 검사. 기존 lint 경고는 유지 |

이 운영 검사는 익명 로그인 화면과 연결 유지까지만 확인했다. 로그인 후 실제 에이전트 대화의 전체 표시 시간과 로컬 수정 적용 후의 외부망 순단·모바일 성공률은 포함하지 않는다. 격리 데이터 검사에서 최근 전사 20개의 표시용 전송은 합계 65,539,527바이트에서 7,816,900바이트로 줄었고 원본 저장은 유지했다. 100ms RTT 모사 4MiB 전송과 혼합 RTC 부하 결과는 [원격 접속 계약](../development/remote-access.md#소비-기반-httpwebsocket-수신-제어)을 따른다.

## 역할별 런처 HTML·청크 적용

[ADR 0029](../decisions/0029-mewlink-launcher-entries.md)의 중앙 빌드는 connect·app·dashboard HTML과 `/launcher/`의 역할별 JS/CSS를 함께 생성한다. Worker가 해당 HTML을 직접 선택하므로 동적 라우터를 추가로 받지 않는다. HTML의 CSS·정적 의존성 preload는 Vite가 구성하고 앱 브리지는 HTML의 두 공개 origin 설정을 사용해 `/config` 왕복을 생략한다.

역할 HTML·청크·Worker는 기존 중앙 배포 절차로 함께 반영한다. 이 역할 분리만으로 로컬 mew를 다시 빌드하거나 재시작할 필요는 없으며, 앞선 WebSocket·호스트 RTC 변경의 로컬 적용 조건은 아래 절을 따른다. 공개 기기·내부 launch의 GET/HEAD가 redirect 없이 200인지, 일반 연결이 관리 코드·제공자 SVG를 받지 않는지 확인한다. 기존 `launcher.js`·`launcher.css`는 이전 HTML의 호환 경로로 유지한다. 비공개 중앙 코드의 Git 제외와 사용자 빌드·배포 원칙은 변하지 않는다.

## WebSocket bootstrap과 RTC 병렬 준비 적용

[ADR 0028](../decisions/0028-mewlink-websocket-bootstrap.md)의 새 런처는 별도 HTTP launch 없이 기기 WebSocket에서 연결을 시작하고 중앙 공개 키도 같은 challenge에서 받는다. 호스트는 ready 뒤 RTC를 준비하면서 최종 ticket을 검증한다. 인증 전 작업 차단·브라우저 키 증명·회수·lease·중앙/앱 origin 분리는 유지한다.

중앙 Worker·런처와 로컬 호스트 코드를 사용자가 함께 적용한다. 중앙의 `npm run build`는 정적 런처만 만들며 Worker 배포를 대신하지 않는다. 기존 배포 절차로 중앙을 재배포하고 로컬 호스트도 업데이트·재시작한다. 추가 D1 마이그레이션·등록·키 교체는 필요 없다. 에이전트는 빌드·배포·재시작하지 않으며 중앙 소스는 공개 Git에서 계속 제외한다.

구버전 브라우저의 HTTP launch·토큰 소비와 기존 호스트의 ready/ticket 흐름은 유지한다. 새 브라우저가 bootstrap 문맥을 받기 전 연결에 실패하면 기존 HTTP 경로로 복귀할 수 있다. 잘못된 문맥·회수·문맥을 받은 뒤 실패에는 복귀하지 않는다. 되돌릴 때는 이 변경과 별개인 [DO·D1 회수 보존 규칙](#시그널링-인가-상태의-보존과-복귀)을 함께 지킨다.

적용 후 캐시 없는 첫 접속·새로고침에서 `/central/launch`와 `/central/key` HTTP가 없는지, 연결·앱 표시·회수·재연결이 동작하는지 확인한다. 격리 테스트 통과는 운영 배포 완료나 0.5초 달성을 뜻하지 않는다. 외부 기기·모바일 망의 시간은 별도로 측정한다.

## mew.run 운영 주소와 이전 등록 유지

기기 접속은 `https://mew.run/{username}/{device}`, 기기 대시보드는 `https://mew.run/{username}`을 사용한다. 대시보드는 중앙 로그인한 본인에게만 기기 목록을 표시하고, 기기 접속은 중앙 로그인 없이 로컬 mew 로그인 화면을 연다. 이전 `/dashboard`와 기기 링크는 호환 이동을 제공한다.

같은 `mewlink` Worker에 `mew.run`·`app.mew.run`을 Custom Domain으로 연결한다. `app.mew.run`은 같은 site의 별도 실행 origin이며 중앙 세션·계정 API를 제공하지 않는다. 기존 `mew.saens.kr`은 기기 등록과 상시 연결 및 제공자 콜백을 위해 유지한다. 다음 설정과 D1 migration을 적용한다.

| 설정 | 운영값·역할 |
| --- | --- |
| `CENTRAL_ORIGIN` | `https://mew.run` |
| `APP_ORIGIN` | `https://app.mew.run` |
| `LEGACY_CENTRAL_ORIGINS` | `https://mew.saens.kr`; 명시한 이전 origin만 호환 |
| `EMAIL_IDENTITY_ISSUER` | `https://mew.saens.kr`; 기존 이메일 계정 namespace 보존 |
| `OAUTH_ORIGIN` | `https://mew.saens.kr`; 기존 Google·GitHub 등 제공자 callback 유지 |
| `0004_oauth_bridge.sql` | 브라우저에 결합한 일회용 로그인 이전 요청·증명 저장 |
| `0005_browser_access.sql` | 호스트별 신뢰 브라우저 이름·시각·영속 접근 회수 기록 |

기존 로컬 등록 파일의 origin·instance ID·키를 수동 변경하거나 서명 키·DB를 새로 만들지 않는다. 중앙은 실제 host origin의 서명 audience·ticket issuer와 승인 신원을 유지한다. OAuth는 위 고정 origin의 기존 콜백을 사용하고, 60초 일회용 증명과 새 관리 origin의 브라우저 쿠키를 함께 확인한 뒤 관리 세션을 발급한다. 아래 제공자 설정의 `mew.saens.kr` 콜백은 이 호환 운영값이다. 새로 설치하는 독립 서비스는 자신의 OAuth origin을 등록한다.

Mewlink의 UDP 범위는 `55000–55031`이다. 새 로컬 실행본은 owner의 기기 등록 때 Windows 수신 규칙을 준비하고, 기존 등록은 **Mewlink → 연결 준비**로 키를 보존하며 복구한다. 필요할 때만 UAC를 요청하고 상태 조회·서버 시작·외부 접속은 승격하지 않는다. helper는 지연된 직접 연결에 한해 지원 공유기의 임시 PCP/NAT-PMP/UPnP 매핑도 시도한다. 데이터 전송은 WebRTC 직접 연결만 사용한다. 지원 조건·정리·수동 회수 범위는 [원격 접속 계약](../development/remote-access.md#wsl-외부-접속과-udp-수신)을 따른다.

2026-10-15 Cloudflare MCP로 두 신규 Custom Domain을 연결하고 중앙 Worker와 additive D1 migration을 운영 반영했다. 새 익명 모바일 Chromium에서 `mew.run/saens`는 기기 없이 로그인 화면을, `mew.run/saens/home`은 기존 호스트의 로컬 로그인 화면을 표시했다. 이전 기기 URL의 이동·기기 목록 API의 비로그인 401·앱 origin의 중앙 API 차단도 확인했다. 제공자 실제 로그인 완료와 외부 LTE·WebKit은 별도 확인이 필요하다. WSL UDP 규칙 추가는 관리자 권한 부족으로 거부되어 아직 적용하지 않았다.

2026-10-16 네트워크 자동 준비·등록/복구 UI와 임시 NAT 매핑의 격리 검사를 추가했다. 새 준비 API·UI는 로컬 업데이트 적용이 필요하며 이번 변경을 위해 중앙 재배포는 필요하지 않다. 현재 PC의 실제 Windows 규칙 적용과 외부 폰 연결 성공은 아직 확인하지 않았다.

## 브라우저 로그인 유지와 접근 회수 적용 (2026-10-19)

이 변경은 **로컬 mew 서버·앱 업데이트와 중앙 프론트·Worker·D1 `0005_browser_access.sql` 적용**이 모두 필요하다. 사용자가 로컬 변경을 빌드·재시작하고 `mewlink/`에서 기존 `npm run deploy`로 중앙을 배포한다. 기존 D1·서명 키·호스트 instance ID는 유지한다. 에이전트는 빌드·배포·재시작하지 않는다. 중앙 소스는 공개 mew Git에서 계속 제외되므로 공개 코드 커밋만으로 전달되지 않으며, 별도 보관한 중앙 사본에도 같은 수정과 마이그레이션을 적용해야 한다.

연결 후 로컬 비밀번호 또는 승인된 외부 계정으로 로그인하고 **이 브라우저에서 로그인 유지 → 기억하기**에 동의하면 브라우저 키에 결합한 90일 미사용 세션을 보관한다. 중앙 origin의 IndexedDB 키는 호스트 instance별로 나누며 같은 호스트의 탭끼리 공유한다. 이후 중앙 로그인 쿠키가 끝나도 현재 호스트 자격증명이 유효하면 자동 재개한다. 60초 연결 lease·20초 갱신·중앙 단절 시 작업 종료는 유지하며, 새 launch로 최대 30초 대기의 자동 재연결을 시도한다. 앱 iframe·미저장 입력은 같은 계정·인증 수단 확인 후 이어 쓰고 진행 중 요청·저장·명령은 재실행하지 않는다. 원격 데스크톱의 별도 영상·입력 peer는 수동 재연결 범위를 유지한다. [인증·복구 계약](../development/remote-access.md#브라우저-로그인-유지와-접근-해제).

중앙 owner는 자신의 대시보드에서 기기의 **접속 브라우저 관리**를 열고 이름·최근 접속·연결 상태를 확인한 뒤 **접근 해제**할 수 있다. 최초 등록 시각은 조회 API에서 제공하며 현재 목록 UI에는 표시하지 않는다. 해제하면 해당 호스트·키의 모든 탭을 즉시 끊고 같은 키의 새 연결을 거부한다. 다른 브라우저와 다른 호스트의 접속은 유지한다. 회수 기록은 D1에 남기며 재신뢰로 재활성화하지 않는다. 호스트 자체의 **등록 해제**와 구분한다. 브라우저 키를 지우고 유효한 계정으로 새 키를 인증하는 것은 새 브라우저 등록이므로 인증 수단 탈취에는 로컬 비밀번호 변경·외부 승인 회수도 필요하다.

중앙 타입 검사와 Workers Vitest **9개 파일·56개 테스트**, 로컬 타입 검사와 호스트·전송 관련 **69개 테스트**를 통과했다. 중앙 검증에는 owner·Origin 검사, 같은 키의 여러 탭 회수·다른 브라우저/호스트 격리, pending/재등록 경쟁과 앱 브리지의 동의 우회 차단을 포함한다. 별도의 네이티브 P2P 브라우저 검사와 모의 런처·RTC 응답을 사용한 신뢰/복구 Chromium 검사도 수행했으며 PC 1100px·모바일 390px의 양 테마 화면을 확인했다. D1의 운영 적용은 아래 기록을 따른다. 중앙 코드 배포·로컬 적용과 휴대폰 절전·외부망 자동 복구는 아직 확인하지 않았다. 검증별 범위는 [원격 접속](../development/remote-access.md#검증과-남은-게이트), 저장 경계와 위험은 [보안](../../../docs/operations/security.md#브라우저-로그인-유지와-회수)을 따른다.

2026-10-19 06:01:26 UTC에 운영 D1 `mewlink`에 `0005_browser_access.sql`을 적용했다. 적용 이력과 `browser_access`의 6개 열·`(instance, id)` 복합 기본 키·`instances(id)` 참조를 원격 조회로 확인했고, 미적용 마이그레이션은 0건이다. 이번 작업에서는 DB 스키마만 적용했으며 중앙 Worker 코드 배포와 로컬 빌드·재시작은 수행하지 않았다.

## 기기 접속의 인증 경계 (2026-10-12)

Mewlink 로그인은 기기 등록·목록·삭제와 중앙 계정 관리에 사용한다. 등록된 `/<유저이름>/<기기이름>` 주소는 중앙 로그인 없이 WebRTC 연결을 시작하고, 해당 컴퓨터의 mew 이메일·비밀번호로 로그인한다. 중앙 계정 ID와 로컬 계정을 연결하는 기존 멤버 접근은 신규 접속에 사용하지 않는다. 자세한 현재 계약은 [원격 접속](../development/remote-access.md)과 [ADR 0207](../history/decisions/0207-mewlink-device-access-local-auth.md)을 따른다.

이 인증 전환은 중앙 `mewlink` 재배포와 로컬 mew 서버·UI 업데이트를 함께 적용해야 한다. 기존 등록 키·instance ID는 유지하며 재등록·서명 키 교체·DB 삭제를 하지 않는다. 중앙과 로컬 버전이 다르면 기존 중앙 계정 권한으로 접속을 우회하지 않고 연결을 거부한다. 중앙 소스는 계속 공개 mew Git에서 제외한다. 배포·빌드·서버 적용은 사용자가 실행한다.
