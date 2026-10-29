---
title: "Agent guidance settings autosave"
description: "Records removal of the Save buttons and 400ms autosave for default guidance settings on 2026-10-27, regression checks for validation and draft preservation, and the scope not applied to production."
created: "2026-10-27"
updated: "2026-10-27"
---

Removed the step of pressing a Save button for each setting. The current contract follows the [feature document](../features/projects-files-search/project-documentation-guidance-and-initialization.md), the save API follows the [session contract](../development/agent-sessions.md), and interaction instructions follow the [settings guide](../../../docs/guides/project-setup.md).

Removed Save buttons for retry, Git, global additional guidance, project additional guidance, and automatic guidance. Changes are saved automatically 400ms after the last change; other presets continue to save immediately upon selection. Invalid numeric or branch input is not sent. Drafts are preserved on save failures and conflicts, and unsaved branch input is now included in discard confirmations for Close and Reload.

## Verification and scope of application

- `node --test server/agent-guidance-ui.test.ts server/agent-guidance.test.ts server/branch-guidance.test.ts server/agent-capacity-retry-settings.test.ts`: 41 passed. UI checks in isolated Chromium at 1100, 390, and 320px screen widths covered autosave, invalid value blocking, recovery from additional guidance failures, project isolation, conflicts, and replacement of manually edited sections.
- Reran and passed 1 UI check using the final source with improved close and refresh confirmations for unsaved branch input.
- Separate description and local link checks on 4 changed documents: 0 errors.
- `npx tsc -b`, `oxlint` on 4 changed TS and TSX files, and `git diff --check` passed.
- `npm run check:docs`: description check passed. The full link check failed due to 17 references to the feature MOC and task documents deleted before this work. Those user changes were preserved.
- No app build, deployment, or server execution or restart was performed. The user will apply the changes to production.
