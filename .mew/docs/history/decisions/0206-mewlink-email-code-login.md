---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
title: "0206 — Direct email login in mewlink authenticates with a one-time code"
description: "Add direct email code authentication to mewlink and define identity, delivery, expiration, single-use, and attempt-limit boundaries without automatically merging accounts with existing OAuth accounts."
created: 2026-10-09
updated: 2026-10-09
---

- Date: 2026-10-09
- Status: Adopted
- Decision makers: user (email login support), Codex (verification codes as the default method pending a separate preference response)
- Related decisions: [0195](0195-mew-account-based-p2p-remote-access.md), [0203](0203-mewlink-workers-p2p-ui.md) — Preserve the boundaries of central authentication, local authorization, and direct work-data connections

## Background

The user requested email login in addition to OAuth. The existing optional email OIDC alone does not allow users to enter an email address and log in on the central screen.

## Options

1. Keep only external email OIDC — Requires provider installation and configuration and does not provide the requested direct-entry flow.
2. Store passwords centrally — Requires separate credential lifecycle management, including password resets and breach response.
3. Verify email ownership with a one-time code — Requires email delivery configuration but does not store passwords centrally.

## Decision

Implement option 3 as the default. Send login codes through the Cloudflare Email Service Workers binding; the user activates the sending domain and deploys it. Do not change actual email or external account settings through automated verification.

- Perform email entry and code verification on the central origin. Apply short expiration, single-use consumption, and attempt limits to codes, and bind them to a Secure, HttpOnly, host-only challenge cookie in the browser. Store only challenge and code hashes in D1, and do not log codes, sessions, or email bodies.
- Only after successful verification, create the central account and the existing central session, then proceed to initial username setup. Do not link to OAuth or existing local mew accounts or elevate privileges based solely on an email address.
- Keep the identity namespace for direct email accounts separate from OAuth/OIDC. Record email case-normalization rules in the current implementation contract, and do not arbitrarily merge provider-specific aliases such as Gmail dots or plus addressing.
- End mail failures, excessive repeat requests, incorrect codes, and expiration with recoverable errors. Do not describe sending without configuration or success in a development environment as successful email delivery in production.

## Rationale

Meet the user's requirement by verifying email ownership without adding password storage or reset flows. Avoid automatic account merging and preserve device, member, and P2P authentication boundaries based on immutable internal IDs. The sending API follows the [Cloudflare Workers Email API](https://developers.cloudflare.com/email-service/api/send-emails/workers-api/). The [Remote Access Contract](../../development/remote-access.md) owns detailed screens, limits, configuration, and verification.
