---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Decides to store agent guidance, model defaults, and runtime settings per Mew login account, migrate shared settings only to the first owner, and preserve execution accounts for independent supervision and scheduled runs."
title: "0202 — Per-account agent settings"
created: 2026-10-07
updated: 2026-10-07
---

- Date: 2026-10-07
- Status: Adopted
- Partially supersedes: [0171](0171-mew-agent-guidance-settings.md), [0165](0165-mew-common-agent-guidance-file.md) — Change server-wide storage scope to per-login-account storage; retain the Markdown canonical source, permissions, and application-on-next-request contracts
- Decision maker: User request

## Decision

Store default guidance, model, reasoning, and permission defaults, and runtime executable paths, arguments, and environment variables per Mew login account, and use them across all projects for that account. HTTP and WS use the server authentication context; independent supervision, scheduled runs, and Git AI runs use the execution account pinned by the server. Do not change the storage target based on an account name sent by the browser.

Preserve existing shared files and copy them once only to the owner account with the earliest creation time. Other accounts start with templates and runtime defaults. Existing CLI use without an account uses the existing shared files. This change does not isolate provider CLI authentication or installation, or OS home directories.

## Rationale

Prevent personal guidance and default model selections from affecting other accounts, and do not copy saved provider environment variables to other accounts. Existing independent supervision retains its starting account; to apply the new implementation, the user must build and apply it, then reopen the tab.
