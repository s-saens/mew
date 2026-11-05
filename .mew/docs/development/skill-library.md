---
title: "Managed skill library"
description: "Defines common/project skill resolution, persistent enablement and removal, source-preserving imports, hidden package dependencies, management APIs, and shared prompt/runtime application. Distinguishes native adapter controls from guidance and filesystem access."
created: "2026-11-05"
updated: "2026-11-05"
---

## Ownership and resolution

[ADR 0140](../decisions/0140-managed-skill-library.md) establishes a managed library for Mew skills. `server/skill-library.ts` owns registration, source discovery, revisions, and the effective inventory. `shared/skill-library.ts` defines its API types. MCP keeps the [native harness and common connection contracts](agent-harness.md).

The library has common and project scopes. Project definitions override same-name common definitions; project enablement can override a common choice without editing its source. The active list contains one effective row per name. Disabled registered skills remain visible in management and disappear from explicit suggestions and automatic workflow selection. External native sources are import candidates, with paths and runtime ownership available as provenance.

Common managed files use `<DATA_DIR>/skills/<name>/SKILL.md`; project files use `<project>/.mew/skills/<name>/SKILL.md`. Each scope persists enablement, overrides, and removed-default registrations in its `.library.json`. The nearest ancestor containing `.mew` or `.git` is the project boundary; otherwise use the supplied working directory. Common defaults reference packaged documentation resources without copying their shared dependencies. An existing customized common commit file is preserved.

Only the four language documentation entrypoints and the commit workflow are default registrations. Their packaged helpers, translation resources, and editing dependencies do not become independent suggestions. Removal is persistent; normal reads and runtime startup must not restore a removed registration. Explicit restoration is the recovery operation. Package resources retain their relative links and pinned original bytes.

Native source discovery follows supported runtime environment overrides and the current project ancestry. Child and sibling projects must not enter the active inventory or current import list. It never edits native runtime configuration, follows an import outside the selected rediscovered source, or deletes an external original.

## Management and preservation

`src/components/skill-library-manager.tsx` shows a searchable active inventory, scope, enablement, selected content, and source details. Adding and importing target common or project scope. External candidates are a separate import view. Defaults can be removed and restored. Unsaved edits survive failed saves and require a discard decision before navigation.

The store validates names and content and checks revisions before changing a registered source. Import carries its supporting files and executable modes, rejects unsafe links and special files, and preserves the external source. Existing destination files are never silently overwritten. File paths supplied by clients are not trusted as source identities.

Common settings are shared by accounts using the server OS user. The API requires the existing `agent` permission and runs under the requesting account's runtime settings. Source contents are returned only for selected details and are not logged or stored in browser persistent state.

| API | Purpose |
| --- | --- |
| `GET /api/agent/skill-library?cwd=...` | Effective rows, external import candidates, restorable defaults, and warnings |
| `GET /api/agent/skill-library/detail?cwd=...&id=...` | Selected content, source revision, and included files |
| `POST /api/agent/skill-library` | Typed create, save, enablement, removal, import, restore, and override-reset operations |
| `GET /api/skills?cwd=...&runtime=...` | Enabled effective skills for explicit composer selection |

## Applying the current inventory

`server/skills.ts` uses the library resolver for suggestions and selected skills. Documentation routing receives only enabled resolved entrypoints and preserves project language requirements. The optional commit workflow uses the enabled resolved commit source; disabling it leaves the built-in Git plan format and execution validation available without applying the disabled workflow.

Mew supplies the current active skill catalog and selection policy at each ACP prompt, including queued requests when they execute. The policy remains independent of the automatic project-document guidance setting. Disabled skills and unimported external candidates are not eligible for automatic selection. A parent documentation workflow can read its packaged dependencies for its requested task without exposing them as independent general writing instructions.

Codex process configuration suppresses native skill instructions, and Claude session metadata disables the SDK's native skill discovery. These controls do not change global native files. Other runtime adapters receive the policy as guidance; native suppression is not established for them. Current catalog changes do not erase content already present in a conversation and do not restrict filesystem tools. External CLIs remain outside this policy.

Codex suppression is configured when its adapter process starts; Claude's SDK filter is configured on session creation, clearing, and loading and governs the main session. Provider-specific subagent definitions can have their own preloaded skills. Processes already running older Mew code require the user's normal update/restart operation before receiving this implementation. Catalog and selected-hint refreshes then apply on each request without restarting for a toggle.

## Verification

Store tests use temporary homes, data directories, and projects for resolution, toggle persistence, removal/restore, source-preserving imports, stale revisions, collisions, and unsafe files. Browser tests exercise the actual React manager on desktop and mobile, including duplicate provenance, project overrides, drafts, errors, and keyboard dismissal. Runtime tests check scoped configuration and ACP request metadata without real provider sessions. Actual outcomes are maintained in the [work record](../work/managed-skill-library.md).
