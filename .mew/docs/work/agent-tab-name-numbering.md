---
title: "Agent tab names and position numbers"
description: "Preserves the earlier duplicate-name suffix implementation and records its replacement with unchanged default names and live tab position numbers on 2026-10-30, local verification, and pending application to the running instance."
created: "2026-10-27"
updated: "2026-10-30"
---

## Earlier duplicate-name suffixes — 2026-10-27

The following implementation was superseded by the position-number change below.

To distinguish tabs when multiple conversations use the same runtime, new conversation names receive numbers such as `Codex-1` and `Codex-2` when they conflict. Current rules are maintained in [agent set and tab creation](../features/terminals-agents-automation/agent-sets-and-tab-creation.md).

`nextAgentTabLabel` selects the first name not used by open tabs. `AgentPanel` determines the name from the latest tab state after checking the working folder. Runtimes and agent sets use the same flow; naming rules for existing and restored tabs and regular shells are preserved.

Verification results:

- `node --test src/utils/agentTabs.test.ts server/agent-new-tab-ui.test.ts`: 8 tests passed. Unit tests verified sequential numbering, manual name conflicts, reuse of available numbers and default names, and preservation of existing names. In isolated Chromium at 1100px and 390px in both themes, consecutive runtime selections produced `Codex`, `Codex-1`, and `Codex-2`, and regression checks covered existing input focus, tab creation, and restoration.
- `npx tsc -b` and targeted linting of the changed code and tests passed. Existing React lint warnings remain.
- The Impeccable check of `AgentPanel.tsx` found no issues.
- Document description and changed-document link checks passed. The full link check failed with 18 existing errors referencing files deleted in separate work.

App builds, deployment, server application, and actual provider execution were not performed.

## Default names and live positions — 2026-10-30

Remove the automatic duplicate-name suffix because it obscured the selected runtime name. New conversations keep the exact runtime or agent set name. Each shared agent/terminal tab row displays a muted gray one-based position immediately before the close button, independent of the saved name. Closing, restoration, and reordering recalculate positions from the current group order. Existing saved names remain intact. The current behavior belongs to the [tab creation contract](../features/terminals-agents-automation/agent-sets-and-tab-creation.md).

The implementation removes `nextAgentTabLabel` and its obsolete suffix tests. Browser regression coverage checks repeated runtime and agent set names, number placement and muted styling, middle-tab closure, restoration, and drag reordering at 1100px and 390px in both themes. Regular shell rows use the same position display.

Local verification:

- `node --test src/utils/agentTabs.test.ts server/agent-new-tab-ui.test.ts`: 6 tests passed, with no skips. The isolated Chromium fixture used mocked runtime and session APIs; desktop and mobile screenshots were inspected.
- `npx tsc -b`: passed.
- `npx oxlint src/components/AgentPanel.tsx src/utils/agentTabs.ts src/utils/agentTabs.test.ts server/agent-new-tab-ui.test.ts`: passed with existing React warnings in `AgentPanel.tsx`.
- `npm run check:docs`: passed with no description or local-link errors.
- `git diff --check`: passed.

No app build, deployment, server startup, or restart was performed. Actual provider execution and physical-device verification remain outside these checks; the user applies the changes to the running instance.
