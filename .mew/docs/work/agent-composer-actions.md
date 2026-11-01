---
title: "Agent composer action row"
created: "2026-11-02"
updated: "2026-11-02"
description: "Records moving the agent composer actions into the input surface, the rounder right-pointing Send button, responsive and keyboard regression checks, and local build verification. Distinguishes isolated browser checks from physical-device and server lifecycle verification."
---

The agent composer now groups Drawing, Save prompt, Attach, Schedule, and Send inside the input surface, in that order. This removes the separate right action column and gives the settings and editor the full available width. Button sizes and colors remain; Send uses 12px corners and Iconoir's right-pointing Send icon. The [agent input contract](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md#composer-input) owns the current behavior.

The editor scrolls above a fixed action row within the same surface. The minimum composer height follows the measured settings and action rows, their spacing, the editor's CSS minimum, and outer padding and borders. Queue editing and CLI mode retain their existing actions and restrictions.

Local verification:

- `node --test server/agent-command-ui.test.ts`: Passed in isolated Chromium at 1100px and 390px, including a 280px panel check. Covers action order and containment, matching Tab order, 117px minimum and automatic growth to 133px with a taller Send button, long and wrapped input scrolling, keyboard viewport changes, attachments, queue saves, CLI execution, focus, and refresh. Screenshots of desktop, mobile, and narrow composers were inspected. The fixture also now checks the current `.mew/temp/assets` upload destination, scopes queue preview selection to the edited input, and includes the shared spinner stylesheet.
- `node --test server/agent-model-controls-ui.test.ts server/fullscreen-keyboard-ui.test.ts src/utils/agentInputLayout.test.ts src/utils/agent-saved-prompts.test.ts`: All 13 tests passed as part of the initial combined run. Covers both agent runtimes, light and dark themes, saved prompt menus and actual image submissions, fullscreen keyboard geometry, input limits, and saved prompt storage. The combined run's composer test initially failed on stale fixture assumptions; its corrected standalone run passed as recorded above.
- `npm run build`: Passed, including TypeScript checks and the production bundle. An earlier attempt stopped on type errors in the concurrently edited, untracked `server/drawing-tools-ui.test.ts`; the next build passed after that file changed. The existing large-chunk warning remains.
- Targeted Oxlint: No errors; existing React warnings remain in `AgentPanel.tsx`.
- The Impeccable detector reported no findings in the changed component.
- `npm run check:docs`: Passed with 637 descriptions, no metadata errors, and no link errors. The initial link check found two references to another task's not-yet-created work record; the check passed after that record appeared.
- `git diff --check`: Passed.

Browser tests used mocked provider and API responses. Physical mobile devices were not tested. No deployment, launcher, or server lifecycle command was run. The required build refreshed `dist/`; no server-side application or restart was performed.
