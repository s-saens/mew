---
title: "mewlink Direct Email Login Setup"
description: "Covers domain, sender, and Workers binding configuration for sending direct email login codes through Cloudflare Email Service, central service deployment, and the distinction between mock verification and actual delivery checks."
created: 2026-10-09
updated: 2026-10-09
---

For direct email login, users enter their email and verification code on the central screen. Separate issuer/client configuration for external email OIDC follows the [Central Deployment Guide](remote-central.md#4-optional-email-oidc-obtain-from-the-provider); direct login requires no OIDC provider. Identity, security, and limitations are owned by the [Remote Access Contract](../development/remote-access.md#direct-email-login), and the rationale is owned by [ADR 0206](../history/decisions/0206-mewlink-email-code-login.md).

## Sending Setup and Deployment

`mewlink/wrangler.jsonc` configures the `EMAIL` send binding, `EMAIL_FROM=login@saens.kr`, and `allowed_sender_addresses` for the same address. The Worker sends through the binding without a separate email API key or SMTP password. When changing the sending address, change both the variable and the allowed sender, and ensure the domain is ready for sending. [Workers Email API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/), [binding restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/).

In the mewlink folder, the user verifies the target Cloudflare account, permissions, and sending domain.

```bash
cd mewlink
npx wrangler email sending list
# 발송 도메인이 아직 활성화되지 않았다면 사용자 실행:
npx wrangler email sending enable saens.kr
npx wrangler email sending list saens.kr
npm run deploy
```

Deploy after completing Cloudflare's required domain verification and sending service activation. The `enable` command above changes sending service configuration, so distinguish it from query and test commands. If `Unauthorized` appears, check the target Cloudflare account and Email Sending permissions and access. Passing automated tests does not replace checks of activation, DNS, permissions, or actual receipt.

`npm run deploy` applies D1 `0003_email_logins.sql` and the central UI and Worker. This feature alone does not require re-registering local A or building or restarting local mew. If the binding or sender is not configured, the email UI is hidden and the API returns 503. Domain or sending failures appear as 502 errors and invalidate pending codes.

## Verification and Production Checks

Use `npm run check`, `npm test`, and `npm run test:browser` to verify types, the Worker, and the browser. Email tests deliver messages to a mock binding and do not send actual email. Browser verification covers email entry, recovery from an incorrect code, authentication, initial username setup, and returning to the original device registration flow.

After production deployment, use an actual email address owned by the user to check code receipt, expiration after 10 minutes, resending, and initial name setup. Successful simulation with Cloudflare's local email binding does not mean actual delivery succeeded. The user explicitly selects a remote binding only when actual delivery is needed in development mode. [Local sending and remote bindings](https://developers.cloudflare.com/email-service/local-development/sending/).

Do not record verification codes, challenge cookies, session cookies, or email bodies in application logs or documentation. Distinguish automated verification results from actual delivery check results.
