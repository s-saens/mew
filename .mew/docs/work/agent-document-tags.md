---
title: "Document reference tags in agent messages and input"
description: "Records document icon tags in sent agent questions and the November 4 extension to the composer and scheduled message previews and editors. Covers filename actions, atomic editing, exact reference preservation, local checks, and browser and runtime limits."
created: "2026-11-01"
updated: "2026-11-04"
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

## November 4: composer and scheduled messages

Extended document tags to the main composer, pending queue editing, scheduled previews, and scheduled editing because these surfaces still exposed raw reference strings. The composer uses a separate CodeMirror replacement/atomic-range extension and reuses `AgentDocumentTag` for filename actions and removal. Scheduled previews use passive tags within the existing edit button. The resizable scheduled editor now uses the same rich mention input. CLI command text stays literal, and upload identity and serialization remain unchanged. Current behavior belongs to the [input contract](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md) and [scheduled message contract](../features/terminals-agents-automation/agent-scheduled-messages.md).

Local checks and limits:

- `node --test server/agent-document-tags.test.ts src/utils/agent-attachments.test.ts src/utils/agent-composer-document.test.ts src/utils/agentInputMentions.test.ts`: 19 tests passed. The new DOM regression exercises actual `@` selection, hidden tokens, repeated/scoped references, passive scheduled tags, arrow movement, atomic deletion, remove actions, undo/redo, filename opening, reference serialization, CLI switching, external edits, and malformed/upload exclusions. It uses Happy DOM and does not establish browser layout or physical-device behavior.
- Targeted lint passed with existing component warnings. The Impeccable detector reported no findings.
- `server/agent-composer-attachments-ui.test.ts` and `server/mention-textarea-ui.test.ts` could not connect to the user-managed Obscura service. Browser layout and touch verification remain incomplete; no alternative browser or service was started.
- Final `npm run build` passed, including TypeScript and production assets, with the existing chunk-size warning. Earlier checks encountered concurrent editor-tab type errors in `useTabs.ts`, `user-ui-routes.test.ts`, and `editor-tabs-sync-ui.test.ts`; the final rerun passed after those sources changed, without this task editing them.
- `npm run check:docs`: the initial run passed all 690 descriptions and found two existing links to the missing `.mew/docs/decisions/README.md`. The final run passed 694 descriptions and found 42 broken links during concurrent documentation navigation renames. These paths are outside this task. Filtering the repository link checker to the three documents changed here found zero errors. `git diff --check` passed.

The required build refreshed local `dist/` assets. No deployment, launcher execution, or server lifecycle operation was performed. Physical-device and real-browser checks remain incomplete.
