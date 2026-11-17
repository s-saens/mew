---
title: "Request GitHub workflow authorization"
description: "Decision to request the GitHub OAuth workflow scope for pushes that modify Actions workflows, including existing connection reauthorization and its security implications."
created: "2026-11-17"
updated: "2026-11-17"
---

# Request GitHub workflow authorization

Status: accepted.

GitHub rejects pushes that introduce or update Actions workflows without the OAuth `workflow` scope, subject to its existing-file exception. Mew requested `repo` and `read:user` only, so a connected account with repository write access could still fail after transferring objects.

Request `workflow` along with the existing scopes during device authorization. Existing tokens keep their granted scopes; their owners must reconnect and approve the additional permission. GitHub still enforces the account's repository access. The additional scope permits modifying workflows, which can access repository automation credentials, and is presented for the user's consent.

Keeping the existing scopes would leave ordinary workflow pushes unsupported. Using a separate personal token would bypass the per-account Mew connection and require separate credential management. This decision extends the [Git connection contract](../development/git-connections.md), retaining its credential handling and error disclosure boundaries.
