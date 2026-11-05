---
title: "Agent composer action row"
created: "2026-11-02"
updated: "2026-11-05"
description: "Records moving the agent composer actions into the input surface, the rounder right-pointing Send button, aligned hover tooltips, the correction from a reserved footer row to floating controls, responsive and keyboard regression checks, and local build verification. Also records replacement of the schedule picker with inline relative-time fields, component checks, the schedule entrance animation and reduced-motion behavior, and blocked browser verification. Includes the input Clear button. Distinguishes local checks from physical-device and server lifecycle verification."
---

The agent composer now groups Drawing, Save prompt, Attach, Schedule, and Send inside the input surface, in that order. This removes the separate right action column and gives the settings and editor the full available width. Button sizes and colors remain; Send uses 12px corners and Iconoir's right-pointing Send icon. The [agent input contract](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md#composer-input) owns the current behavior.

The first implementation kept the editor above a fixed action row within the same surface; the floating-controls follow-up below replaces that layout. The minimum composer height follows the measured settings and action rows, their spacing, the editor's CSS minimum, and outer padding and borders. Queue editing and CLI mode retain their existing actions and restrictions.

Local verification:

- `node --test server/agent-command-ui.test.ts`: Passed in isolated Chromium at 1100px and 390px, including a 280px panel check. Covers action order and containment, matching Tab order, 117px minimum and automatic growth to 133px with a taller Send button, long and wrapped input scrolling, keyboard viewport changes, attachments, queue saves, CLI execution, focus, and refresh. Screenshots of desktop, mobile, and narrow composers were inspected. The fixture also now checks the current `.mew/temp/assets` upload destination, scopes queue preview selection to the edited input, and includes the shared spinner stylesheet.
- `node --test server/agent-model-controls-ui.test.ts server/fullscreen-keyboard-ui.test.ts src/utils/agentInputLayout.test.ts src/utils/agent-saved-prompts.test.ts`: All 13 tests passed as part of the initial combined run. Covers both agent runtimes, light and dark themes, saved prompt menus and actual image submissions, fullscreen keyboard geometry, input limits, and saved prompt storage. The combined run's composer test initially failed on stale fixture assumptions; its corrected standalone run passed as recorded above.
- `npm run build`: Passed, including TypeScript checks and the production bundle. An earlier attempt stopped on type errors in the concurrently edited, untracked `server/drawing-tools-ui.test.ts`; the next build passed after that file changed. The existing large-chunk warning remains.
- Targeted Oxlint: No errors; existing React warnings remain in `AgentPanel.tsx`.
- The Impeccable detector reported no findings in the changed component.
- `npm run check:docs`: Passed with 637 descriptions, no metadata errors, and no link errors. The initial link check found two references to another task's not-yet-created work record; the check passed after that record appeared.
- `git diff --check`: Passed.

Browser tests used mocked provider and API responses. Physical mobile devices were not tested. No deployment, launcher, or server lifecycle command was run. The required build refreshed `dist/`; no server-side application or restart was performed.

## Follow-up: consistent action tooltips

Drawing and Save prompt used shared tooltips anchored to different button heights. Attach, Schedule, and Send still used delayed native titles. All five now use the shared tooltip with equally stretched anchors while preserving their visible button sizes. Each action retains its translated label, including empty saved-prompt lists, CLI execution, and queue saving; native titles were removed.

Before the fix, the new browser regression assertion failed on the different tooltip heights. The updated test checks tooltip visibility, a single popup, equal vertical position, viewport containment, absence of native titles, and mode-specific labels, including disabled actions.

Follow-up verification:

- `node --test server/agent-command-ui.test.ts server/agent-model-controls-ui.test.ts`: All three browser tests passed at 1100px and 390px. The existing action geometry, resize, keyboard, attachment, prompt storage, and queue checks also passed. The 390px Drawing and Save prompt tooltip screenshots were inspected.
- `npm run build`: Passed, including TypeScript checks; the existing large-chunk warning remains.
- Targeted Oxlint: No errors; 40 existing warnings remain in `AgentPanel.tsx`. The prompt draft component and browser test have no warnings.
- The Impeccable detector, `npm run check:docs`, and `git diff --check` passed.

Providers and APIs were mocked in the browser checks. Physical devices and server lifecycle operations were not tested; only the required build refreshed `dist/`.

## Follow-up: floating controls

The requested layout was floating buttons inside the input. The earlier implementation incorrectly reserved a full-width footer row. The controls now form a transparent, absolutely positioned group at the bottom right, and the editor viewport fills the entire input surface. The area left of the buttons remains editable. Existing button order, appearance, aligned tooltips, keyboard behavior, and mode restrictions remain.

The group measurement supplies trailing content padding and CodeMirror scroll margins through `--agent-composer-bottom-inset`, so long or wrapped input can scroll the active line clear of the controls. This padding belongs to the scrollable document; it does not reserve an editor layout row. The measured minimum still leaves enough room for one input line and the floating controls.

Before the fix, the new regression test failed because the controls used normal flow instead of absolute positioning. The test now checks a transparent floating group, full editor height, bottom/right insets, editing at the bottom left, and caret clearance during long-input scrolling and keyboard viewport changes.

Floating-controls verification:

- `node --test server/agent-command-ui.test.ts server/agent-model-controls-ui.test.ts server/fullscreen-keyboard-ui.test.ts`: All four tests passed. Covers desktop/mobile layout, the 280px panel, minimum and expanded heights, long and wrapped input, mobile keyboard and fullscreen geometry, saved prompts, CLI and queue actions, and aligned tooltips. The mobile composer and keyboard-overflow screenshots were inspected.
- `npm run build`: Passed, including TypeScript checks; the existing large-chunk warning remains.
- Targeted Oxlint: No errors; existing React warnings remain. The Impeccable detector reported no findings.
- `npm run check:docs`: All 646 description checks passed. The full link check failed on an unrelated absolute `/api/asset` link in `.mew/tasks/사진 첨부 편집 기능.md`; that task was left unchanged. Running the existing link checker's `documentLinkErrors` for the two changed documents found no errors.
- `git diff --check`: Passed.

Browser responses were mocked, and physical mobile devices remain unverified. No deployment or server lifecycle command was run; the required build refreshed `dist/`.

## Follow-up: inline relative scheduling

The clock previously opened a separate date/time picker above the composer. It now becomes a floating hours/minutes form in the same action group, with Check and X buttons on the right. Existing scheduled messages use the same form when their time is edited. Controls wrap inside narrow inputs, and the existing measurement updates editor clearance. The [scheduled-message contract](../features/terminals-agents-automation/agent-scheduled-messages.md#detailed-behavior) owns duration bounds, confirmation timing, cancellation, errors, and draft preservation.

Verification on 2026-11-04:

- `node --test server/agent-schedule-input.test.ts src/utils/scheduleTime.test.ts src/utils/agent-scheduled-cache.test.ts src/utils/agentInputLayout.test.ts`: All 8 tests passed. The new React/happy-dom component test covers defaults, duration validation, confirmation-time calculation, existing-time rounding, cancellation, pending locks, duplicate prevention, and retry after failure.
- `node --test server/agent-scheduled-cache-ui.test.ts server/agent-command-ui.test.ts`: Both fixtures bundled, but neither browser test could connect to the user-managed Obscura endpoint. Browser interaction, screenshots, and desktop/mobile/narrow geometry remain unverified. Updated assertions cover inline containment, cancellation preserving the draft, relative scheduling, and narrow-panel bounds.
- `npm run build`: Passed, including TypeScript and the production bundle; the existing large-chunk warning remains. Initial attempts were blocked by a type error in another task's `server/editor-tabs-sync-ui.test.ts`; verification passed after that file was corrected by its owner.
- Targeted Oxlint passed with existing `AgentPanel.tsx` warnings. The Impeccable detector returned no findings.
- The broader `src/ui-localization.test.ts` run failed its source scan on pre-existing untranslated literals in other files, including `src/api/client.ts`, `src/api/task-list.ts`, and `src/components/debugger-helpers.ts`; it reported none in the new component. Its locale-formatting test passed.

- `npm run check:docs`: All 694 description checks passed. The repository-wide link check found 42 unrelated missing-target errors, including `.mew/docs/MOC.md` and `.mew/docs/decisions/README.md`. Filtering the existing checker to the three changed documents found no errors; their changed anchors were inspected.
- `git diff --check` passed for the task files.

No deployment, launcher, or server lifecycle operation was performed. The required build refreshed local `dist/` assets. Physical-device and browser layout verification remain pending.


## Follow-up: schedule entrance motion

The inline schedule form now reveals from the clock side with a short slide and fade. A one-shot Web Animations API effect keeps the controls immediately usable and cancels on unmount; reopening starts a fresh entrance. Reduced motion uses only a short fade. The [scheduled-message contract](../features/terminals-agents-automation/agent-scheduled-messages.md#detailed-behavior) owns timing and fallback behavior.

Verification on 2026-11-04:

- `node --test server/agent-schedule-input.test.ts`: Passed. Checks normal and reduced-motion keyframes, immediate focus and submission, cancellation on unmount, replay on reopening, no replay while typing, and usability without animation support, alongside the scheduling regressions. The animation API is mocked; this does not verify rendered smoothness.
- `npm run build`: Passed, including TypeScript and the production bundle, with the existing large-chunk warning.
- Targeted Oxlint and `git diff --check`: Passed.
- The Obscura connection probe failed; rendered desktop/mobile motion remains unverified. No browser service was started.
- `npm run check:docs`: Metadata passed; the link check reported 42 existing missing-target errors outside the changed documents, including `.mew/docs/MOC.md` and `.mew/docs/decisions/README.md`. The two changed documents have no link errors in the existing checker.

The required build refreshed local `dist/` assets. No deployment, launcher, or server lifecycle operation was performed.

## Follow-up: clear the active input

On 2026-11-05, added an × button immediately to the left of Drawing so users can discard the active input with one action. It clears text and reference tags, returns focus to the editor, and preserves a separate new-message draft when editing the queue. The [agent input contract](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md#composer-input) owns the behavior and disabled states.

Local verification:

- `node --test server/agent-command-ui.test.ts`: Passed in isolated Chromium at 1100px and 390px, including 280px containment. Checks Clear placement and Tab order, shared tooltips, text/document/attachment clearing, editor focus, CLI mode retention, queue-edit isolation, empty-input state, and upload locking, alongside the existing composer regressions. Desktop, mobile, and narrow screenshots were inspected. Earlier runs hit stale document-tag expectations and multiline draft setup; the fixture now reads serialized document tags and explicitly clears the previous draft before its history scenario.
- `server/agent-model-controls-ui.test.ts` and `src/utils/agentInputLayout.test.ts`: All seven tests passed in the combined run. That run's composer test failed on the multiline setup before the standalone correction above.
- `npm run build`: Passed, including TypeScript and the production bundle; the large-chunk warning remains.
- `npm run lint`: Passed with existing warnings.
- `npm run check:docs`: All 729 descriptions passed. The full link check reported 42 missing-target errors outside the changed documents; the existing link checker found zero errors in the two changed documents. Their unchanged target anchors were inspected.
- `git diff --check` passed for the task files.

Browser checks use mocked runtime and API responses; physical devices remain unverified. The required build refreshed local `dist/` assets. No deployment, launcher, or server lifecycle operation was performed.
