---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: per-account Git provider connections in Mew. Preserves the choices, rationale, and subsequent changes from that time; consult Mew's owning documents for the current contract."
title: "0179 — Per-account Git provider connections in Mew"
created: 2026-09-29
updated: 2026-09-29
---

- Date: 2026-09-29
- Status: Adopted
- Follow-up decision: [0181](0181-mew-default-github-oauth-app.md) — ship a shared Client ID by default and support custom app configuration; retain per-account authentication boundaries
- Partially supersedes: [0172](0172-mew-github-cli-login.md) — OS-shared CLI authentication, token ownership, concurrent login, and authorship boundaries
- Decision makers: user (requested implementation of per-account OAuth connections), Codex (implementation)

## Background

Sharing the server's gh credentials prevents distinguishing commit authorship and remote permissions between different Mew users.

## Decision

- Start all Mew accounts disconnected without migrating existing OS authentication. Connect GitHub directly through OAuth device authentication and store tokens by user, provider, and host. The initial provider is github.com, with expansion through a provider interface.
- Store tokens in a server-only encrypted store. Do not put tokens in user browsers, Git URLs, command arguments, or AI prompts. Isolation from terminals or agents with server OS permissions is not guaranteed.
- Require an account connection for explicit regular, file, and AI commits and remote operations. If login is canceled, do not execute the operation and preserve the input. When disconnected, automatic file tasks only modify files and skip automatic commits.
- Specify the commit author and committer for each command using the requesting user's connection information. Do not change shared Git configuration. AI tasks pin the connection used at startup and check for disconnection or replacement before committing.
- Remote transfers inject only that user's token into a verified HTTPS provider address. They do not fall back to OS credential helpers, SSH, or environment tokens. GitHub SSH addresses are normalized to HTTPS at execution time without changing repository settings.
- Only logged-in users can access the status, initiation, cancellation, and disconnection of their own connections. An official external authorization URL is provided, and using the internal browser requires the existing browser feature permission. Mew login and provider OAuth are separate.
- Each account defaults to disconnected only before its first connection. Subsequent connections persist across reconnects, and users log in again after explicit disconnection or expiration. Server-wide gh logout is not run.

## Rationale

[GitHub OAuth device flow](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow) does not require deploying a callback address or client secret for each installation. The operator is responsible for app registration and enabling device flow. Current usage and configuration are documented in the [project guide](../../../../docs/guides/projects.md#github-login).
