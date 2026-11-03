---
title: "Common MCP readiness and ACP startup"
description: "Records the 2026-11-04 fix for unready shared MCP definitions blocking ACP startup. Covers saved Connected-state injection, owner connection preparation, regression and build verification, and remaining provider and runtime-application limits."
created: "2026-11-04"
updated: "2026-11-04"
---

## Purpose and resulting behavior

A reported Antigravity startup failure ended during MCP initialization while a shared server required authorization. Enabled common definitions were injected before connection readiness had been established, allowing an unready optional tool to block the conversation.

Common bindings now include only enabled definitions whose existing saved connection state resolves to `connected`. New and cleared conversations and saved-session loads reread that state. Other registrations remain visible in MCP management. Owners connect and complete any required login there before the next conversation refresh; local commands and unauthenticated remote servers also require that connection check. Native runtime configuration, optional debugger bindings, and Mewpet helper bindings retain their existing behavior.

The [common MCP contract](../development/shared-mcp.md) owns runtime behavior, the [user guide](../../../docs/configuration/agent-harness.md#mew-common-mcp) owns controls, and [ADR 0128](../decisions/0128-shared-mcp-readiness.md) records the readiness choice.

## Verification

- Read-only connection-status inspection found the affected common registration in `needs_auth`. An isolated failed-initialize relay reproduction returned the safe connection error and closed its downstream connection, consistent with the reported runtime failure.
- Before the fix, the regression failed because authentication-required, disconnected, and unreadable-environment definitions appeared in the ACP request. After the fix, the combined shared MCP, OAuth, bridge, connection, route, ACP, supervisor, and WebSocket run passed 84 tests.
- The session fixture covers Codex, Claude, and Antigravity across new/load/clear requests and separate account contexts. It checks that ready bindings and existing internal bindings remain present, unavailable registrations stay out, a newly connected replacement is included on load, and disconnect excludes it on clear.
- `npm run build` passed, including TypeScript project checks, with the existing large-chunk warning. `npm run lint` passed with existing repository warnings.

The five changed documentation files passed description and local-link validation. `git diff --check` passed. The full `npm run check:docs` run checked 678 descriptions without errors; its link stage reported the existing unrelated `/api/asset` link in `.mew/tasks/Image preview and attachment editing.md`. That task was left unchanged.

## Application and limits

Saved Connected status reflects prior connection or authentication state rather than continuous health. A previously connected server can still fail actual runtime initialization after an outage or authorization change. The bridge retains actual initialization errors and does not report fabricated success.

No real-provider approval or live runtime recovery has been verified for this fix. No deployment, launcher execution, or server start, stop, or restart was performed. Applying server-side changes remains a user operation. After the owner connects the server, users must start or clear a conversation, or load a saved one, to refresh its common bindings.
