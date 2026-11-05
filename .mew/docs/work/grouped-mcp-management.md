---
title: "Grouped MCP management implementation"
description: "Records grouped MCP implementation, 88 passing local tests, successful build and lint, scoped document checks, and unrelated repository link failures. Separates fixture evidence from native/provider approval and operational application."
created: "2026-11-05"
updated: "2026-11-05"
status: "implemented"
---

## Purpose and behavior

Give services one expandable MCP row while retaining individual readiness and use choices. Reuse existing shared definitions, credentials, and transport bridges. Add common/project usage, a central resolver, safe project-only registration, custom groups, and an opt-in Cloudflare API transition. Keep external native originals intact. [ADR 0141](../decisions/0141-grouped-mcp-management.md) records the decision; the [management contract](../development/mcp-management.md) owns current behavior.

## Verification

Local checks on 2026-11-05:

| Check | Outcome |
| --- | --- |
| `node --test server/mcp-management.test.ts server/mcp-manager-ui.test.ts server/shared-mcp-routes.test.ts` | 24 passed: 21 management cases, desktop/mobile grouped UI, and existing shared-route permissions |
| `node --test server/mcp-management-routes.test.ts server/mcp-management-runtime.test.ts server/shared-mcp.test.ts server/shared-mcp-connections.test.ts server/agent-clear.test.ts server/skill-library.test.ts server/agent-harness.test.ts` | 61 passed: route boundaries, ACP selection, stdio forwarding, authentication, project boundaries, and source preservation |
| `node --test server/agent-harness-ui.test.ts server/skill-library-ui.test.ts` | 3 passed: desktop/mobile external editor, common connection lifecycle, Skills/MCP navigation, and draft protection |
| `npm run build` | Passed TypeScript and production Vite build; existing large-chunk warnings remain |
| `npm run lint` and scoped `npx oxlint` on changed TypeScript files | Passed with no errors; scoped output has three state-in-effect warnings, including two existing external-editor effects |
| Impeccable detector on four changed UI components | No findings |
| `npm run check:docs` | 724 descriptions passed. The final full link check failed with 48 errors outside this task, including missing MOC/decision entrypoints and incomplete concurrently authored setup links |
| Repository link checker filtered to eight changed documents | No link errors; existing shared headings retained and changed parent link repaired |
| `git diff --check` on task files | Passed |

Browser fixtures covered 1200 px dark and 390 px light layouts, group gates retaining child preferences, scope/reset, custom groups and assignments, URL registration, authentication/logout, two-step Cloudflare consolidation, readonly controls, draft recovery, keyboard focus, single-dialog navigation, and narrow-screen bounds. Ready/error text met 4.5:1 contrast. The managed list did not scan native sources until the external view opened, and summaries contained no fixture credentials.

Temporary filesystem regressions verified that project-only registration remains off elsewhere after sidecar failure, reusing a unified connection preserves shared membership and other projects' effective usage, oversized combined registries fail before replacing the original, and later reads still succeed. Fake ACP peers cover new/load/clear for Codex, Claude, and Antigravity with preserved internal bindings. A test-owned stdio JSON-RPC handshake verifies transport forwarding when project usage overrides the old source flag.

## Limits

No actual account connection, provider approval, native configuration migration, deployment, or application server lifecycle operation has been performed. Existing conversations and independently loaded native MCP definitions remain outside live group changes. Backend operations preserve shared credentials and do not imply that the unified API replaces every specialized server's workflow or account permissions.
