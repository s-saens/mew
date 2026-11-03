---
title: "0128 — Common MCP connection readiness before runtime injection"
description: "Requires saved Connected status before enabled Mew common MCP definitions enter ACP new/load/clear requests. Keeps unready registrations visible without blocking startup and preserves actual initialization errors and cached-health limits."
created: "2026-11-04"
updated: "2026-11-04"
status: "accepted"
---

## Context

Installation-wide common MCP registration under [ADR 0127](0127-installation-wide-mcp.md) made enabled definitions available across accounts and runtimes. Injecting an enabled server that still needed authorization could terminate its stdio bridge during MCP initialization and prevent an ACP runtime from opening the conversation. A registered definition did not establish connection readiness.

## Decision

Include an enabled common definition in an ACP session request only when its existing saved connection state resolves to `connected`. Reevaluate readiness for each new or cleared conversation and each saved-session load. Keep definitions whose saved state is disconnected, authentication-required, or failed in the management list, outside that request's common bindings.

Owners use the existing Connect operation to check MCP initialization and complete any required authorization. This preparation also applies to local stdio and unauthenticated remote servers. Preserve installation sharing, owner-only management, native source behavior, and debugger and Mewpet bindings. An active conversation retains its bindings until the normal refresh boundary.

This narrows ADR 0127's enabled-definition injection rule. The [common MCP contract](../development/shared-mcp.md) owns current session and authentication details; the [user guide](../../../docs/configuration/agent-harness.md#mew-common-mcp) owns connection and conversation controls.

## Alternatives and rationale

Continuing to inject every enabled definition lets an optional, unready tool prevent an otherwise usable conversation from opening. Pretending that MCP initialization succeeded would hide the missing connection and misrepresent available tools. Probing every server during each conversation start would add process and network work and could prompt unattended authorization.

The saved connection state reuses Mew's explicit connection and login flow. It separates registration from readiness while keeping the definition available for the owner to repair.

## Consequences

A newly registered or imported common server needs a successful owner connection before runtime use. After connecting, users start or clear a conversation, or load a saved one, to obtain the current common bindings. Reconnecting an active conversation alone does not refresh them.

Saved Connected status is not continuous health monitoring. A server that was previously connected can become unavailable before actual runtime initialization; its real failure remains visible. This decision neither retries provider approval automatically nor returns fabricated initialization success. The [work record](../work/shared-mcp-readiness.md) separates local checks from provider approval and application to the running server.
