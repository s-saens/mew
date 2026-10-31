---
title: "Saved agent prompt drafts"
description: "Records the 2026-10-31 replacement of the composer runtime-default Save action with reusable browser-local prompt drafts, attachment restoration, local regression checks, and pending application to the running instance."
created: "2026-10-31"
updated: "2026-10-31"
---

The composer Save button now saves a reusable prompt snapshot and opens the saved list. An empty input opens the list without adding an entry. Loading returns text, attachment metadata and image bytes, and CLI mode to the input without sending; entries can be deleted individually. Identical snapshots are deduplicated. The current behavior and storage scope are defined in [agent input](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md#saved-prompt-drafts).

This replaces the button's runtime-default write action. Existing account defaults and the defaults API remain in place. The new browser key is protected user state, separate from automatic tab drafts and sent-input history. Save/delete failures preserve previously saved data. Uploads, pending queue editing, and CLI submission disable the control; terminal permissions also gate loading CLI drafts.

Local verification:

- `node --test src/utils/agent-saved-prompts.test.ts src/utils/agentInputDrafts.test.ts packages/ui/src/i18n.test.ts`: All 14 tests passed. Covers exact text, CLI mode, image bytes, duplicate handling, project/account isolation, deletion, corrupted data, quota failures, existing automatic drafts, and translated placeholders.
- `node --test server/agent-model-controls-ui.test.ts`: Both runtime tests passed in isolated Chromium at 1100px and 390px, using dark and light themes respectively. Covers saving, deduplication, refresh after clearing the automatic draft, loading and deleting, empty lists, menu viewport bounds, focus, no unintended prompt sends or runtime-default writes, queue-edit disabling, and image bytes/references in an actual composer submission. Desktop and mobile saved-list screenshots were inspected. Provider connections were mocked.
- `npx tsc -b`: Passed.
- Targeted Oxlint: No errors; the existing `AgentPanel` React warnings remain. The new component, storage utility, unit tests, and changed browser test pass without warnings.
- The Impeccable detector reported no findings in the changed components.
- `npm run check:docs` and `git diff --check`: Passed.

Saved prompts remain local to the browser and depend on available browser storage; attachment files must still exist. No app build, deployment, server startup, or restart was performed. Application to the running instance and physical mobile device behavior remain unverified.
