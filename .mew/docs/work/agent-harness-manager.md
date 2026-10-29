---
title: "Skills and MCP management implementation plan"
created: 2026-09-17
updated: 2026-09-17
description: "Records the scope, source model, and implementation sequence for the skills and MCP source management GUI and API, file preservation, permissions, and conflict protection, and completion of isolated verification."
상위파일: "_work.md"
---

Add Skills and MCP entry points to the right of the information button in the existing agent panel.

## Implementation sequence

1. Discover configuration locations in the current working folder and subprojects, and model global/project, shared/runtime, and source as independent dimensions.
2. For skills, provide SKILL.md viewing and editing, and folder moves and deletion including supporting files. Check for name conflicts, external changes, and symbolic links.
3. For MCP, view, add, edit, move, and delete individual servers in the agent's actual configuration. Preserve other settings and do not automatically convert between runtimes with different formats.
4. Build list and detail views that retain existing theme and popup rules. Include scope and agent filters, search, source and read-only reasons, error and empty states, mobile detail navigation, keyboard support, and draft protection.
5. Run server tests with temporary homes and projects, isolated browser tests using actual React, and type, lint, and document checks. Do not build or restart.

## Boundaries

- Keep the original CLI configuration as the canonical source. Opening or saving in the management dialog does not launch MCP processes.
- Global settings belong to the server OS user, not the Mew account. The API requires agent feature permissions.
- Distinguish the shared skill repository from each runtime's automatic discovery scope. Do not create an arbitrary shared configuration file for MCP.
- Do not include authentication values in lists; return only the MCP entry selected in a detail request. Do not retain raw content in logs or persistent browser storage.
- Mark system-managed and plugin-managed skills as read-only. Mark unverified runtime configurations as unsupported.

## Verification results

Implemented server-side source management, panel buttons, a shared popup, and integration with skill input suggestions. Current support, usage, and APIs are documented in [Skills and MCP management](../../../docs/configuration/agent-harness.md), and the storage ownership decision is documented in [ADR 0157](../history/decisions/0157-mew-native-agent-harness-management.md).

- Server tests: scope, entries with the same name, read-only behavior, preservation of skill supporting files and executable modes, hash conflicts, move conflicts, Claude moves within the same file, TOML/JSONC/YAML/JSON5 preservation, and permission checks.
- Isolated Chromium: checked filters, details, draft protection, recovery from save failures, moves, deletion confirmation, MCP editing and addition, and keyboard focus in the dark theme at 1200px and the light theme at 390px.
- Reduced the list to 32px rows showing the name and an agent label on the right (`Global` for shared entries), with descriptions in the selected entry's detail area. Provides per-scope collapse and expand controls and item counts. Browser tests verified row height, description placement, keyboard expansion, and preservation of edit drafts when collapsed.
- Passed 12 tests combining dedicated tests and existing agent WS, account popup, and CLI input regressions. `npx tsc -b`, `npm run lint` (10 existing warnings, no new warnings), and document allowlist and workspace link checks also passed. No actual server build or restart, or changes to user skills or MCP, were performed.
- Fixed mobile focus and selected-row contrast issues identified in a separate UI review and verified them in an isolated browser. The review agent's follow-up assessment did not run due to usage limits, so no claim is made that it passed that assessment.
