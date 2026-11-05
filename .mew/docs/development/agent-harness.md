---
title: "Skills and MCP management implementation contract"
description: "Contracts for external/native MCP source editing, installation-wide imports, atomic saves, conflicts, discovery, APIs, and verification. Links the managed skill library and grouped MCP management that own the default management views."
updated: "2026-11-05"
---

## Storage and application scope

The [managed skill library](skill-library.md) owns active skills, common/project settings, source-preserving imports, and prompt application under [ADR 0140](../decisions/0140-managed-skill-library.md). The native source store retains its internal skill file utilities for compatibility tests; the public native harness route accepts MCP management only. It returns HTTP 410 for `kind=skills` so the old mutation route cannot bypass library ownership or recreate removed defaults.

[Grouped MCP management](mcp-management.md) owns the default MCP list, service groups, usage preferences, scoped registration, and Cloudflare consolidation. **External connections** opens this source editor without stacking dialogs. Native scanning occurs only in that view; opening the managed list does not discover subprojects or native source trees. Editing a source remains distinct from choosing where to use a registered connection.

- JSON/JSONC patches only the relevant paths, and YAML uses document node editing to preserve surrounding settings and comments. Codex TOML reserializes MCP tables and validates other setting values. Comments and formatting in the MCP section are normalized, and inline `mcp_servers = {...}` is rejected because it cannot be safely modified.
- OpenClaw JSON5 is saved as JSON with all setting values preserved. The management dialog explains that comments and formatting are removed. JSON is valid JSON5.
- Invalid syntax is shown as a warning and is not overwritten. Creation and editing also validate basic MCP transport fields and core per-agent formats. This is not full provider schema validation or server connection verification.
- Saving uses a temporary file in the same directory and rename, preserving the original mode. New files use 0600. Skill folder moves use rename; cross-disk moves are rejected with the source preserved. Moving or deleting skills containing internal symbolic links is also rejected.
- MCP moves spanning two files save the destination first. If subsequent source deletion fails, both copies are preserved and a partial-completion error is displayed. Claude personal-to-global moves within the same file are saved in a single operation.
- Skill details and changes check for conflicts using a hash of the entire folder's contents. MCP uses a hash of the entire source configuration file. Limits are 2 MiB per file and 32 MiB per skill folder.
- Project discovery searches actual directories below the current cwd for folders containing `.mew`, `.git`, or supported configuration locations. It does not traverse hidden folders, dependencies, build outputs, archives, or docs-editor. When the depth limit of 16 or folder limit of 12,000 is reached, it warns and instructs the user to reopen that folder as cwd.
- Native source editing does not run MCP or restart sessions. Mew common MCP adds explicit connection checks and installation-wide authentication; its [shared connection contract](shared-mcp.md) defines storage, imports, permissions, and session injection. Native CLI restart, trust, and configuration precedence rules continue to apply to native definitions. Antigravity entries are official CLI/IDE settings; automatic loading by Mew's pinned ACP 1.1.1 has not been verified. Prime may require a Python integration skill in addition to MCP definitions.

## Input fields and APIs

`GET /api/skills?cwd=...&runtime=...` returns enabled effective library skills. Native folders supply external import candidates rather than automatically active skills. Project definitions and on/off overrides take precedence over common settings. Suggestions reload after management changes. Explicit selection, execution-time queue revalidation, documentation routing, and runtime policy follow the [skill library contract](skill-library.md).

| API | Contract |
| --- | --- |
| `GET /api/agent/harness?cwd=...&kind=mcp` | Scope, runtime, storage location, item summaries, and read warnings. Excludes raw MCP content and authentication values |
| `GET /api/agent/harness/detail?cwd=...&kind=...&id=...` | Selected item's raw content, revision, and included file list |
| `POST /api/agent/harness` | `{cwd, kind, action, id?, revision?, target?, name?, content?}`. action is create/save/move/delete/import. Import accepts a rediscovered native MCP ID, revision, and the Mew target ID; conversion happens on the server and leaves the source unchanged |

The server does not accept source paths directly in requests; it matches them to rediscovered IDs. All responses use no-store, and raw content and authentication values are not saved to logs or localStorage. Detailed raw content is edited in browser memory while the user has the item selected.

Mew common definitions appear first under the installation-wide `mew` scope. Their file is private server data, and they have no project/native move destination. Every account with agent access can list them and use their ACP bindings. Only owners with agent access can read raw common details, create, edit, delete, import, or change authentication. Native source permissions remain unchanged. Native read-only entries may be imported because importing reads the source and writes a new installation-wide definition; it does not grant permission to edit the source. Name collisions and stale source revisions fail without overwriting either side. Normalized TOML parsing uses ordinary cloned objects so null-prototype parser tables do not falsely fail semantic preservation checks.

## Verification and sources

`server/agent-harness.test.ts` checks scopes, duplicates, links, supporting files, move conflicts, external changes, configuration preservation, runtime paths, and permissions in temporary homes/projects. `server/agent-harness-ui.test.ts` verifies desktop/mobile search and filters, read-only behavior, drafts, error recovery, editing, moving, deleting, adding MCP entries, and focus in actual React/Chromium. Tests do not modify actual user settings or run MCP.
