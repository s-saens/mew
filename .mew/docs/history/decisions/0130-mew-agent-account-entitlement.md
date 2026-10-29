---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Separate agent login from subscriptions and usage limits. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0130 — Separate agent login from subscriptions and usage limits"
created: 2026-09-11
updated: 2026-09-11
---

- Date: 2026-09-11
- Status: Adopted
- Supersedes: [0104](0104-mew-agent-account-usage-dashboard-link.md) — Prohibiting account queries and showing only an external dashboard; the prohibition on direct credential access remains in this ADR
- Decision makers: User (requirements), Codex (implementation)

## Background

Even after a successful Kimi login, requests may be rejected because there is no subscription or the monthly usage allowance is exhausted.
When the provider wrapped this error as ACP Authentication required(-32000), Mew displayed the login screen again. The user requested a way
to check the connected account and subscription status and open the subscription page in the built-in browser.

## Decision

- Classify provider errors indicating a required subscription, exhausted limits, or insufficient credits before authentication expiration. Do not conclude that there is no subscription based solely on 403, 429, or an RPC code.
- Check accounts and plans using read-only status functionality provided by official CLIs. For Kimi, use the account and usage APIs of a temporary loopback server owned by the CLI; for Codex, use official app-server account RPCs; for Claude and Cursor, use CLI status commands.
- Receive Kimi temporary-server access credentials into memory only from the startup output of the process Mew launched, and do not copy them to logs, responses, or disk. Do not disable server authentication or arbitrarily connect to an existing server. Terminate the created process when the query completes, fails, or times out.
- Mew must not directly read provider authentication files, Keychain, or tokens. Do not send model prompts or insert slash commands into existing conversations to query accounts.
- Exclude Antigravity from this implementation following the user's scope revision. Retain the official TUI and existing behavior.
- Distinguish free plans from unavailable states. Do not block products with free usage allowances or additional credits solely because there is no subscription. When limits are exhausted, preserve queued messages and stop automatic successive sending.
- Open official subscription and usage pages in the internal DOM browser for the same Mew account. Do not use arbitrary URLs included in errors as payment links. The user decides whether to pay and actually resend.
- Limit queries to owner/manager and temporarily return only the required account display name, plan, and limit status. Do not retain account query results in transcripts, browser storage, or Mew logs.

## Rationale

Retrying authentication does not resolve insufficient usage allowance. The [official Codex account RPC](https://learn.chatgpt.com/docs/app-server#auth-endpoints) provides account, plan, and limit information, and [Antigravity
plans](https://www.antigravity.google/docs/plans/) also specify free baseline limits. Login status, paid status, and whether requests can currently be made must be distinguished to avoid incorrectly requiring payment.

Keep the implementation contract and per-provider query support scope in the code repository README, and screen criteria in the [operations document](../../specs/agent-panel.md).
