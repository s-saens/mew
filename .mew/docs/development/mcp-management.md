---
title: "Grouped MCP management"
description: "Defines service-group metadata, common/project usage resolution, owner boundaries, private summaries, safe scoped registration, and two-step Cloudflare consolidation. Links saved readiness, ACP application, external source editing, and verification."
created: "2026-11-05"
updated: "2026-11-05"
---

## Responsibilities and storage

[ADR 0141](../decisions/0141-grouped-mcp-management.md) adds a management layer over the [existing common registry and authentication](shared-mcp.md). `server/mcp-management.ts` owns grouping and usage; `server/mcp-management-routes.ts` adds authorization and saved readiness. `shared/mcp-management.ts` contains browser-safe types. The default UI is `src/components/mcp-manager.tsx`, with stateless draft forms and localized copy in adjacent files. It does not scan native source trees to render the managed list.

| Data | Canonical location |
| --- | --- |
| Connection definitions and secrets | Existing `<DATA_DIR>/mcp/servers.json` |
| Group names, assignments, common usage | `<DATA_DIR>/mcp/management.json` |
| Project server/group overrides | `<project>/.mew/mcp-usage.json` |
| Authentication and readiness | Existing private common MCP credential/status store |

`server/project-settings-root.ts` resolves the nearest ancestor containing `.mew` or `.git`, falling back to the supplied working directory. Skills and MCP usage share this boundary. Project files contain usage booleans only; definitions and credentials are not duplicated into them.

## Groups and usage

Each server has at most one group. Custom groups support creation, rename, assignment, explicit ungrouping, and removal. Remote definitions under `mcp.cloudflare.com` or its subdomains infer the Cloudflare group unless an explicit assignment overrides it. Lookalike suffixes and names alone do not establish service identity. Reads never create groups, connections, or files.

For a server and its group, resolve the common preference and then any project override. The old source `enabled` field supplies the server's common default. A server is selected only when its resolved preference and its group's resolved gate are on. Group toggles retain member preferences; removing a group keeps sources/authentication and lets their individual preferences apply. The confirmation states that consequence. Clearing a project preference restores common inheritance.

The inventory distinguishes requested server usage from effective group-gated usage. It shows counts and saved readiness without treating that readiness as continuous health monitoring. JSON, environment variables, headers, and URL paths/queries are excluded from summaries. Safe endpoint labels contain only origins or the `stdio` transport label.

## Mutations and access

All endpoints require authentication and `agent` permission and return `Cache-Control: no-store`. Owners manage common usage, definitions, groups, assignments, consolidation, and authentication. Agent-enabled nonowners may change project usage only. Raw source editing and imports retain the [native harness contract](agent-harness.md).

| Endpoint | Contract |
| --- | --- |
| `GET /api/agent/mcp-management?cwd=...` | Safe connections/groups, common/project usage, saved readiness, revision tokens, and Cloudflare preview |
| `POST /api/agent/mcp-management` | Typed usage, create-server, group creation/rename/removal, assignment, and Cloudflare consolidation |

Every mutation carries registry, common metadata, and project metadata revisions. Stale edits fail without overwriting originals. Writes use same-directory temporary files, reject symlink destinations, and enforce the 2 MiB read limit on the complete UTF-8 output before writing. A source is written before its usage sidecars; partial completion produces an explicit error. Project-only registration writes a disabled source default and common-off/project-on usage, preventing activation in other projects even if a sidecar write fails. Explicit use changes preserve definition bytes and authentication identity.

## Cloudflare consolidation

The helper uses `https://mcp.cloudflare.com/mcp`. It displays the chosen existing unified connection by name or adds a new one. It never merges authentication merely because endpoints share a host. The owner first adds/prepares the unified connection, then verifies its tools and selects dedicated registered Mew connections to stop using. The API rejects nonempty retirement selections until the unified connection's saved state is `connected`.

Only explicitly selected dedicated common connections are disabled. Their definitions and credentials remain. A project-only new connection starts off elsewhere; an existing unified connection keeps its group membership. Consolidation enables that server and its actual group gate in the selected scope. A project transition preserves other projects' preferences and effective usage. No provider login, network connection, or native edit occurs just by opening, grouping, or changing usage. Authentication still requires the existing explicit Connect flow.

## Runtime and verification boundaries

`resolveMcpUsage()` is the shared selector. ACP new/load/clear combines selected names with saved readiness before constructing common bindings. Internal debugger and Mewpet bindings keep their own rules. The bridge and authentication controller no longer treat the old source flag as a hard credential gate: users can prepare authentication while use is off, and a use toggle does not invalidate approval. An already active conversation keeps its bindings.

External runtime definitions remain independent and may expose duplicate tools even after import. Group switches govern Mew common connections only. No provider-native suppression, filesystem isolation, or live tool-list reload is claimed. The [work record](../work/grouped-mcp-management.md) records isolated store, HTTP, ACP, stdio, authentication, and desktop/mobile browser checks separately from operational application.
