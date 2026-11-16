---
title: "Mewlink Paddle 결제 설정"
description: "Mewlink Paddle 결제의 승인 준비, 테스트, 설정과 운영 전 확인 사항을 설명하는 간단한 안내."
created: "2026-11-16"
updated: "2026-11-16"
---

# Mewlink Paddle 결제 설정

결제는 기본적으로 꺼져 있습니다. 기존 Mewlink는 무료이며, 유료 혜택과 가격은 아직 정하지 않았습니다. 결제 연동은 코드만 준비됐고 실제 결제와 배포는 확인하지 않았습니다.

1. **승인 준비:** 유료 혜택과 가격을 정하고, 서비스 소개·가격표·이용약관·환불정책·개인정보 처리방침·문의처를 공개합니다. Paddle에서 운영 계정과 결제 도메인 `link.mew.run`의 승인을 받습니다. [Paddle 심사 기준](https://www.paddle.com/help/start/account-verification/what-is-domain-verification)

2. **테스트 준비:** Paddle 샌드박스에서 정기 결제 상품과 가격, API 키, 클라이언트 토큰을 만듭니다. 테스트용 Worker와 D1 데이터베이스는 운영 환경과 분리합니다.

3. **Paddle 연결:** 기본 결제 링크를 테스트 Worker의 `/central/billing/checkout`으로 설정합니다. 구독 이벤트 알림은 테스트 Worker의 `/central/billing/webhook`으로 설정하고 서명 비밀키를 복사합니다. 운영 환경에서는 도메인 승인 후 각각 `https://link.mew.run/central/billing/checkout`과 `https://link.mew.run/central/billing/webhook`을 사용합니다.

4. **설정값 저장:** `mewlink/.secrets.json`의 기존 항목을 유지하면서 아래 값을 문자열로 추가합니다. 키와 비밀값은 문서나 채팅에 넣지 않습니다.

   - `PADDLE_ENVIRONMENT`: 테스트는 `sandbox`, 운영은 `production`
   - `PADDLE_API_KEY`: Paddle API 키
   - `PADDLE_CLIENT_TOKEN`: 클라이언트 토큰
   - `PADDLE_PRICE_ID`: 정기 결제 가격 ID
   - `PADDLE_WEBHOOK_SECRET`: 알림 서명 비밀키
   - `PADDLE_ENABLED`: 신규 결제를 허용할 때 `true`

5. **검증 후 운영:** [중앙 서비스 배포 절차](remote-central.md)에 따라 테스트 환경에 적용하고 결제·갱신·취소·고객 포털을 확인합니다. 빌드만으로는 배포되지 않습니다. 실제 결제 전에는 운영용 상품과 별도 키를 만들고 운영 환경에서도 확인합니다. 정산과 세무 처리는 사업자 상황에 맞게 확인합니다.

결제 생성 결과가 불확실하거나 알림이 계속 실패하면 Paddle에서 거래와 구독 상태를 확인한 후 수동으로 복구해야 합니다. 자동 복구는 아직 없습니다. 자세한 동작은 [결제 계약](../development/mewlink-billing.md)을 참고하세요.
