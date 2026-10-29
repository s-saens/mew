---
title: "Mew ADR — Authentication, Accounts, and Subscriptions"
created: 2026-09-11
updated: 2026-10-09
description: "A historical map preserving the topic-based classification of Mew ADRs before independence. Current contracts follow Mew's own documentation and subsequent decisions."
---

Parent: [Mew ADR Map](../MOC.md). Even if the status is `채택`, also check the scope of changes if there is a **subsequent decision** at the top.

## History / raw — Classification at the time

- [0206 — mewlink direct email code login](../../0206-mewlink-email-code-login.md) — Single-use, cookie binding, delivery, and no automatic OAuth account merging

- [0195 — Central account authentication and P2P remote access](../../0195-mew-account-based-p2p-remote-access.md) — External account linking, proof of access, and final local authorization; design adopted, not implemented

- [0181 — Mew default GitHub OAuth app](../../0181-mew-default-github-oauth-app.md)

- [0179 — Git provider connections per Mew account](../../0179-mew-account-git-connections.md)

- [0172 — GitHub CLI login in the Git panel](../../0172-mew-github-cli-login.md)

- [0150 — Per-account feature permissions and file access table](../../0150-mew-account-feature-and-file-permissions.md)

- [0143 — Official Antigravity ACP and Google authentication](../../0143-mew-antigravity-official-acp.md)
- [0142 — Claude ACP chat and official CLI authentication](../../0142-mew-claude-acp-and-cli-authentication.md)
- [0130 — Separate login from subscription and usage limits](../../0130-mew-agent-account-entitlement.md)
- [0128 — Integrate all browser-based OAuth into the internal browser](../../0128-mew-browser-oauth-uses-internal-browser.md)
- [0121 — Codex OAuth uses a scoped server browser through the loopback callback](../../0121-mew-codex-oauth-through-scoped-server-browser.md) — Retain official codex login; forwarding context is in 0126 and 0128
- [0116 — Prefer an external browser for OAuth agent logins](../../0116-mew-oauth-agent-logins-use-external-browser.md) — retain CLI credential ownership; Claude/Gemini placement is in 0117, the browser surface in 0128
- [0110 — Unify agent authentication as declarative jobs in the registry](../../0110-mew-declarative-agent-authentication-jobs.md) — Declarative authentication jobs; browser surfaces are in 0128
- [0109 — Use device codes and server tokens for agent authentication, and restrict browser windows to loopback](../../0109-mew-agent-authentication-and-loopback-browser.md) — Retain the prohibition on retrying a general-purpose HTML proxy; subsequent decisions apply to OAuth and browser boundaries
- [0072 — Continue agent authentication in the GUI](../../0072-mew-agent-gui-authentication.md) — Basic ACP authentication boundaries; subsequent decisions apply to per-runtime placement
