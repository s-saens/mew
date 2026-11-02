---
title: "0120 — Account-owned common MCP connections"
description: "Adopts a Mew-owned account-private MCP registry and shared OAuth bridge across ACP runtimes, while retaining native settings and importing definitions without copying native authentication tokens."
created: "2026-11-02"
updated: "2026-11-02"
status: "accepted"
---

## Context

Mew's MCP manager edited each runtime's native configuration independently. A server registered in Claude Code therefore remained unavailable in Codex until it was registered and authorized there too. The user requested one Mew common connection that survives runtime changes.

## Decision

Add an account-private common registry to the existing MCP manager. Let users add definitions directly or import supported native definitions without changing their sources. Inject enabled common servers into ACP sessions through one stdio bridge format. Mew owns OAuth discovery, PKCE, credential storage, and refresh for remote common connections, independently of native client credentials.

Use account-owned private files rather than project-owned shared configuration. Reuse the MCP SDK for local/HTTP/SSE transports and OAuth, and the existing host login desktop for remote users' approval. Coordinate refresh across bridge processes and invalidate late credential saves after disconnect.

This extends the native-source-only boundary in [historical ADR 0157](../history/decisions/0157-mew-native-agent-harness-management.md) for explicit Mew common connections. Native source editing retains its preservation and runtime-application rules.

## Alternatives and rationale

Copying definitions between native files would remove repeated typing while leaving per-client OAuth and configuration drift. Copying private OAuth stores would depend on undocumented credential formats, client registrations, and grants. Passing remote URLs directly through ACP would still use each native runtime's authentication store and would retain differences in SSE support.

A Mew-owned stdio bridge provides the same transport to each ACP runtime while maintaining one explicit credential owner. The official SDK avoids implementing the OAuth protocol independently. A generic external proxy was considered, but its published shared-cache behavior did not provide the required cross-process refresh ownership guarantees without additional coordination.

## Consequences

The first Mew common authorization may require another provider approval. Common definitions apply when Mew starts, clears, or loads an ACP conversation; an active conversation keeps its existing bindings. External CLI use retains native configuration. Native registrations remain available and can appear alongside imported common bindings. OAuth through the host login desktop retains its Linux/WSL dependency. Account-private files do not provide OS process isolation from the server user, consistent with the existing agent boundary.

The [common MCP contract](../development/shared-mcp.md) owns current storage, API, authentication, and runtime behavior. The [work record](../work/shared-mcp.md) separates local verification from runtime application and real-provider approval.
