---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Connect Antigravity through Google's official ACP server. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0143 — Connect Antigravity through Google's official ACP server"
created: 2026-09-15
updated: 2026-09-15
---

- Date: 2026-09-15
- Status: Adopted
- Partially supersedes: [0117](0117-mew-terminal-agent-tabs-for-claude-and-antigravity.md) — Antigravity's terminal-only surface and ACP prohibition; retain the prohibition on re-adding Gemini
- Decision makers: User (requested Antigravity ACP implementation), Codex (implementation)

## Background

Google distributes an official Antigravity server in the ACP Registry and provides guidance for Free, Pro, and Ultra authentication with personal Google accounts in Zed. The user requested integrating Mew's Antigravity into ACP chat through this official path.

## Decision

- Switch `antigravity` to an ACP surface. Use Google's version-pinned `agy_acp_server` distribution; do not convert the regular `agy` CLI to a custom protocol.
- The Install button downloads from Google's official distribution source into the server data directory. Do not bundle proprietary binaries in Mew source or npm dependencies. Do not delete the user's existing CLI or credentials.
- Do not pass existing TUI commands or arguments to ACP. Specify the executable and arguments through ACP-specific environment variables, and retain the saved provider environment.
- Follow the official ACP initialize response for authentication methods. If a Google OAuth URL is printed to stderr, pass only a validated Google HTTPS URL to the existing authentication screen, and only during authentication. Do not store OAuth URLs in logs or transcripts. Clear the URL on success, failure, or cancellation, and provide a retry option.
- Do not infer account email, subscription, or remaining quota without a verifiable official contract. Use Google's authentication and usage limits as provided.
- Participates in the shared ACP model, permission, conversation, and agent set paths; session restoration and similar features depend on the capabilities advertised by the server.
- Do not build or restart running servers or forcibly terminate existing tmux sessions. Do not automatically verify actual account login or paid prompts.

## Rationale and scope

- [Google's Zed authentication documentation](https://antigravity.google/docs/ide/extensions/zed/)
- [Official ACP registry configuration](https://github.com/agentclientprotocol/registry/blob/main/antigravity-acp/agent.json)
- [Google Terms of Service](https://antigravity.google/terms)

Adopt the official ACP client connection. This decision does not permit unofficial OAuth extraction or internal API proxies, nor does it finalize the entire execution and billing contract for a managed cloud serving the general public.
