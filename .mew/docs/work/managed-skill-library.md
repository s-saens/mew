---
title: "Managed skill library implementation"
description: "Records common/project skill management, unified enablement, native adapter controls, and completed local tests/build. Documents the unrelated repository link failures and remaining operational/provider verification limits."
created: "2026-11-05"
updated: "2026-11-05"
status: "completed"
---

## Purpose and result

Replace scattered native source rows with one effective skill per name, common/project scopes, visible enablement, source-preserving imports, and removable defaults. Keep MCP behavior and external native files intact. [ADR 0140](../decisions/0140-managed-skill-library.md) records the ownership change; the [current contract](../development/skill-library.md) owns behavior and APIs.

## Verification

- Library unit tests: 12 passed, covering source resolution and provenance, common/project overrides, disabled/removal persistence, explicit restoration, complete asset copies, collisions, stale revisions, unsafe links, and project isolation.
- Integration, routing, documentation, legacy source utilities, commit skills, and project context: 20 passed across `skill-library-integration`, `skill-library-routes`, `documentation-skills`, `mew-skills`, `agent-context`, `agent-harness`, and `agent-harness-routes` test files. The legacy public Skills route returns HTTP 410 and cannot bypass the library.
- Runtime policy: six focused tests passed, including fake ACP new/clear/load requests, live catalog changes, selected-hint parsing, and queue-time disablement/path replacement. The WebSocket regression also passed.
- Existing ACP, startup, and clear-session tests: 46 passed. Git AI commit, packet, and response tests: 33 passed.
- Actual React/Chromium: the new Skills test and two existing native/common MCP tests passed at desktop 1200px and mobile 390px. Screenshots were inspected; tests cover source details, scope state, defaults, imports, draft protection, failed saves, keyboard dismissal, tab switching, viewport bounds, and placeholder contrast.
- `npm run build` passed, including TypeScript checks. Vite reported its large-chunk advisory. `npm run lint` exited successfully with warnings, including effect warnings in the new manager. The Impeccable detector returned no findings for the two changed UI components.
- `npm run check:docs`: all 714 descriptions passed, but the full link check failed on 42 links in unchanged documents. Missing targets include `.mew/docs/MOC.md`, `.mew/docs/decisions/MOC.md`, and `.mew/docs/decisions/README.md`. The existing checker reported zero link errors across this task's six changed/new documents; their existing incoming heading anchors were retained.
- Installed Codex validation used an isolated temporary configuration and working directory: name-based and absolute-path skill rules with `include_instructions=false` were accepted by the read-only `features list` command. Native global settings were not changed.

## Application limits

No deployment, launcher execution, or application server start/stop/restart was performed. The build updates local frontend assets, but running server code requires the user's normal restart operation. No live provider conversation or native subagent was used to establish provider behavior; Codex configuration parsing and fake ACP requests are local evidence only. Other adapters receive the catalog as guidance without verified native suppression. Existing conversation text, old unversioned persisted selection hints, and external CLI behavior remain outside retroactive library changes.
