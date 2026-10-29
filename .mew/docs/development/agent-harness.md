---
title: "Skills and MCP management implementation contract"
description: "Contracts for save atomicity, conflicts, scope discovery, input suggestions, APIs, and verification when managing skill and MCP source files. User operations follow the public settings guide."
updated: "2026-10-29"
---

## Storage and application scope

- JSON/JSONC patches only the relevant paths, and YAML uses document node editing to preserve surrounding settings and comments. Codex TOML reserializes MCP tables and validates other setting values. Comments and formatting in the MCP section are normalized, and inline `mcp_servers = {...}` is rejected because it cannot be safely modified.
- OpenClaw JSON5 is saved as JSON with all setting values preserved. The management dialog explains that comments and formatting are removed. JSON is valid JSON5.
- Invalid syntax is shown as a warning and is not overwritten. Creation and editing also validate basic MCP transport fields and core per-agent formats. This is not full provider schema validation or server connection verification.
- Saving uses a temporary file in the same directory and rename, preserving the original mode. New files use 0600. Skill folder moves use rename; cross-disk moves are rejected with the source preserved. Moving or deleting skills containing internal symbolic links is also rejected.
- MCP moves spanning two files save the destination first. If subsequent source deletion fails, both copies are preserved and a partial-completion error is displayed. Claude personal-to-global moves within the same file are saved in a single operation.
- Skill details and changes check for conflicts using a hash of the entire folder's contents. MCP uses a hash of the entire source configuration file. Limits are 2 MiB per file and 32 MiB per skill folder.
- Project discovery searches actual directories below the current cwd for folders containing `.mew`, `.git`, or supported configuration locations. It does not traverse hidden folders, dependencies, build outputs, archives, or docs-editor. When the depth limit of 16 or folder limit of 12,000 is reached, it warns and instructs the user to reopen that folder as cwd.
- The management dialog does not run or connect to MCP or restart sessions. Native CLI restart, trust, and configuration precedence rules apply. Antigravity entries are official CLI/IDE settings; automatic loading by Mew's pinned ACP 1.1.1 has not been verified. Prime may require a Python integration skill in addition to MCP definitions.

## Input fields and APIs

`GET /api/skills?cwd=...&runtime=...` searches for runtime-specific and shared skills from cwd up to the parent Git root and merges global skills. For identical names, the nearest project takes precedence, and runtime-specific skills precede shared skills within each scope. Child and sibling projects are excluded from prompt suggestions. Suggestions in open input fields are reloaded after management dialog changes, and immediate sending, queued message editing, and scheduled messages use the same cwd/runtime rules. These are Mew's explicit skill selection rules and do not replace the native runtime's automatic discovery precedence.

| API | Contract |
| --- | --- |
| `GET /api/agent/harness?cwd=...&kind=skills\|mcp` | Scope, runtime, storage location, item summaries, and read warnings. Excludes raw MCP content and authentication values |
| `GET /api/agent/harness/detail?cwd=...&kind=...&id=...` | Selected item's raw content, revision, and included file list |
| `POST /api/agent/harness` | `{cwd, kind, action, id?, revision?, target?, name?, content?}`. action is create/save/move/delete |

The server does not accept source paths directly in requests; it matches them to rediscovered IDs. All responses use no-store, and raw content and authentication values are not saved to logs or localStorage. Detailed raw content is edited in browser memory while the user has the item selected.

## Verification and sources

`server/agent-harness.test.ts` checks scopes, duplicates, links, supporting files, move conflicts, external changes, configuration preservation, runtime paths, and permissions in temporary homes/projects. `server/agent-harness-ui.test.ts` verifies desktop/mobile search and filters, read-only behavior, drafts, error recovery, editing, moving, deleting, adding MCP entries, and focus in actual React/Chromium. Tests do not modify actual user settings or run MCP.
