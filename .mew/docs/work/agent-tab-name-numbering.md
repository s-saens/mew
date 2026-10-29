---
title: "Preventing duplicate names for new agent tabs"
description: "Records the implementation of hyphenated numbering for new runtime and agent set conversation names, unit and isolated UI verification, existing documentation link errors, and the scope not applied to production."
created: "2026-10-27"
updated: "2026-10-27"
---

To distinguish tabs when multiple conversations use the same runtime, new conversation names receive numbers such as `Codex-1` and `Codex-2` when they conflict. Current rules are maintained in [agent set and tab creation](../features/terminals-agents-automation/agent-sets-and-tab-creation.md).

`nextAgentTabLabel` selects the first name not used by open tabs. `AgentPanel` determines the name from the latest tab state after checking the working folder. Runtimes and agent sets use the same flow; naming rules for existing and restored tabs and regular shells are preserved.

Verification results:

- `node --test src/utils/agentTabs.test.ts server/agent-new-tab-ui.test.ts`: 8 tests passed. Unit tests verified sequential numbering, manual name conflicts, reuse of available numbers and default names, and preservation of existing names. In isolated Chromium at 1100px and 390px in both themes, consecutive runtime selections produced `Codex`, `Codex-1`, and `Codex-2`, and regression checks covered existing input focus, tab creation, and restoration.
- `npx tsc -b` and targeted linting of the changed code and tests passed. Existing React lint warnings remain.
- The Impeccable check of `AgentPanel.tsx` found no issues.
- Document description and changed-document link checks passed. The full link check failed with 18 existing errors referencing files deleted in separate work.

App builds, deployment, server application, and actual provider execution were not performed.
