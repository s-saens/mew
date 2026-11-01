---
title: "Document reference tags in agent questions"
description: "Records the 2026-11-01 replacement of raw document references in sent agent questions with document icon tags, filename popup actions, local verification, and runtime and physical-device limits."
created: "2026-11-01"
updated: "2026-11-01"
---

Sent user messages now display ordinary document references as compact icon tags. Activating an icon reveals the filename; activating the filename opens the original project/path in Mew's editor. This also covers reference-only messages and repeated references mixed with attachments. The [input feature contract](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md) owns current behavior, and [ADR 0039](../decisions/0039-agent-inline-attachments.md#2026-11-01-follow-up-changes) records the presentation change.

The implementation reuses the shared action menu for focus, keyboard operation, viewport bounds, and dismissal. Question copying and runtime delivery preserve ordinary reference strings, and upload metadata and media previews retain their existing behavior. Folder and extensionless references share the tag because their serialized tokens contain no file-type information.

Local verification:

- `node --test src/utils/agent-attachments.test.ts src/utils/agent-attachment-prompt.test.ts src/utils/agentInputMentions.test.ts`: 13 tests passed. Covers exact scoped paths, repeated references, Unicode and special characters, malformed references, upload separation, copy/transport preservation, and existing mention candidates.
- `node --test server/agent-history-ui.test.ts`: Passed in isolated Chromium at 1100px and 390px in light and dark themes, including touch-emulated document activation at 390px. Covers document-only and mixed/repeated references, filename activation, keyboard input, disclosure state, Esc/outside/Back dismissal, focus restoration, viewport bounds, copy, exact scoped paths, refresh, and existing image/video previews. Provider and file APIs were mocked. Desktop dark and mobile light filename-popup screenshots were inspected.
- `npm run lint`: Passed with repository warnings. Targeted Oxlint on the new component, attachment utility/tests, and history browser test passed without warnings after cleanup.
- The Impeccable detector reported no findings in the changed UI components.
- `npm run check:docs` and `git diff --check`: Passed.
- Final `npm run build`: Passed, including TypeScript and production assets. Existing large-chunk warnings remain. An intermediate run encountered `TS2339` in a concurrent `src/App.tsx` task-session edit; the final rerun passed after that source was corrected, without additional changes from this task.

The required build refreshed local `dist/` assets. No deployment, launcher execution, or server lifecycle operation was performed. Physical mobile devices remain unverified.
