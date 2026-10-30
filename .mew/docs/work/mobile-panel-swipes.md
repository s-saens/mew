---
title: "Separate swipes for the mobile dock, panel body, and Plain auxiliary key bar"
description: "Records mobile dock, panel body, and Plain auxiliary key bar swipe separation, internal horizontal scrolling priority, and the 2026-10-30 attachment tag gesture exclusion and agent navigation through the + picker. Distinguishes local regression, type, lint, and documentation checks from physical-device verification and production application."
created: "2026-10-27"
updated: "2026-10-30"
---

Changed dock swipes from switching tabs first to switching panels. Tab switching is handled in the mobile panel body; for regular files and Markdown Plain, it is handled only in the auxiliary key bar to preserve horizontal scrolling. The current contract is owned by [Panel layout and mobile](../features/appearance-accounts-operations/panel-layout-mobile-and-state-restoration.md) and [Shared UI contracts](../development/ui-contracts.md#mobile-dock-and-panel-switching), and the rationale is owned by [ADR 0079](../decisions/0079-mobile-panel-swipes.md).

Removed the tab-first branch from the dock wiring in `App` and used `useMobilePanelSwipe` to establish the starting panel and element. `EditorPane` distinguishes the Hotview body from the Plain auxiliary key bar, while tab rows, popups, task deletion, and Gantt interactions retain their existing handling. Cancellation, multitouch, and foreground panel changes do not switch tabs, and key clicks after swipes are suppressed.

Plain previously had no auxiliary key bar, so an optional shared key bar was added to `CodePane`. It is enabled in the file editor and disabled by default in embedded editors. It uses CodeMirror's existing keymaps and collaborative undo, and reuses the existing keyboard height calculation to keep the key bar below the status bar. The shared bar was also updated to show Undo/Redo even without code block and table buttons. The dock's accessibility guidance was updated to describe panel switching in all four languages.

Verification results:

- `server/mobile-panel-swipe-ui.test.ts`: In isolated Chromium using the actual EditorPane, CodeMirror, Hotview, shared dock, and key bar, verified horizontal scrolling in the body, Hotview tab switching regardless of screen height, Plain key bar switching and cycling, per-panel tab switching and retention of panels without tabs, cancellation, multitouch, click suppression, document preservation, modifiers, arrow keys, Tab, Undo/Redo, and exclusion of read-only and desktop modes. Also checked light and dark screens at 390px.
- `node --test --test-name-pattern='App mobile dock swipes' server/workspace-switch-ui.test.ts`: Verified that dock swipes in the actual App open adjacent panels even when the panel has tabs, stop at the first boundary, and preserve document tabs. The check that body swipes switch only sidebar views also passed. The existing `Files opens Documents` check passed separately as well.
- `server/task-schedule-ui.test.ts`: Passed bidirectional cycling through list, calendar, and Gantt views in the body, dock selection and task tab preservation, and existing Gantt touch editing and horizontal range expansion. The fixture's data path was separated from the workspace.
- `server/editor-keyboard-ui.test.ts`·`server/fullscreen-keyboard-ui.test.ts`: Passed checks for keyboard boundaries, cursor and status bar retention, and height restoration with the actual Plain key bar. The fullscreen fixture was updated to use the actual key bar on mobile.
- `server/code-pinch-zoom-ui.test.ts`·`src/utils/mobile-dock.test.ts`: Passed checks for pinch gestures, body content, selection, and edit history preservation, as well as dock order, visibility, permissions, and end boundaries.
- Ran the editor, keyboard, pinch, task, and dock checks above together with `node --test --test-concurrency=2`; all 10 passed. The dock UI fixture's vertical layout check was updated to wait for React state updates.
- `npx tsc -b` and `npx oxlint` on the target files: Completed without errors. Lint warnings about React refs, effects, and dependencies remain.
- The Impeccable review of the changed UI found no issues.
- `npm run check:docs`: All 502 descriptions passed without errors. The full link check failed on 18 references to feature MOCs and tasks that had been deleted before this work. There are no link errors in the 6 documents changed in this work.

The app was not built or deployed, and the server was not started or restarted. Safari, Chrome, and OS keyboard interactions on actual phones are unverified.

## 2026-10-28 Prioritize internal horizontal scrolling

Fixed an issue where touches intended to scroll horizontally in tables, code, and similar content in non-editor panels were handled as tab switches. `useMobilePanelSwipe` checks for an actual horizontal scroll area between the initial touch element and the starting panel, and leaves the entire touch gesture to native browser scrolling. It does not hand off to tab switching at either end. Existing tab switching is retained for containers without overflow, vertical-only scrolling, and the Plain auxiliary key bar. The current detection conditions are owned by [Shared UI contracts](../development/ui-contracts.md#mobile-dock-and-panel-switching).

Verification results:

- `node --test --test-concurrency=2 server/mobile-panel-swipe-ui.test.ts server/task-schedule-ui.test.ts src/utils/mobile-dock.test.ts`: All 6 passed. Using actual touch input in isolated Chromium, verified bidirectional horizontal scrolling and tab retention at both ends in tables within the sidebar, agent, terminal, Git, and task panels; RTL and `overflow-x: scroll`; and tab switching in areas without overflow, vertical-only areas, and areas with hidden overflow. Existing regression checks for the Plain auxiliary key bar, Hotview body, tasks, Gantt, and dock also passed. Panel switching in the fixture was updated to wait for React state updates.
- `npx tsc -b`, `npx oxlint` on the two target code files, and `git diff --check`: Passed. The Impeccable review of the changed hook also found no issues.
- `npm run check:docs`: All 506 descriptions passed without errors. The full link check failed on 18 references to feature MOCs and tasks that had been deleted before this work; there are no link errors in the 3 documents changed in this work.

Only local isolated checks were performed. The app was not built or deployed, and the server was not started or restarted. Safari and Chrome on actual phones and behavior after application to production are unverified.

## 2026-10-30 Preserve attachment tag gestures

Excluded touches starting on inline attachment tags or their descendants from `useMobilePanelSwipe`, preventing tag movement from switching agent conversations. The exclusion applies to the tag's entire gesture; other composer and conversation-body touches keep their existing tab swipes. The current behavior is owned by [Agent input, mentions, skills, and attachments](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md).

Verification results:

- Reproduced unintended agent tab switching with the new attachment-start regression in `server/mobile-panel-swipe-ui.test.ts` before the fix.
- `node --test --test-concurrency=2 server/mobile-panel-swipe-ui.test.ts server/agent-composer-attachments-ui.test.ts`: All 51 tests passed. Isolated Chromium checks cover bidirectional tag-start gestures, preserved composer/body tab swipes, and actual touch long-press attachment movement beyond 60px without tab switching. Existing attachment editing, preview, cancellation, undo, scrolling, dock, and editor key-bar checks also passed.
- `npx tsc -b`, targeted `npx oxlint`, the Impeccable detector for the changed hook, and `git diff --check` passed.
- `npm run check:docs`: All 553 descriptions and document links passed.

Only local isolated checks were performed. No app build, deployment, or server startup/restart was performed. Actual phones remain unverified.

## 2026-10-30 Include the agent picker in swipe navigation

Agent body swipes previously wrapped directly between conversation tabs and did nothing with a single conversation. `AgentPanel` now treats the `+` picker as the final navigation position in the focused agent group. Swiping out of the picker selects the first or last conversation according to direction. Visiting the picker creates no session; regular terminal groups retain their existing shell-only cycle. The current behavior is owned by [Agent Sets and Tab Creation](../features/terminals-agents-automation/agent-sets-and-tab-creation.md#scope).

Extended `server/agent-new-tab-ui.test.ts` with forward and backward cycles through `+`, single-conversation navigation, unchanged tab counts, and regular terminal navigation. Mobile checks use actual touch events through `useMobilePanelSwipe`; desktop checks send the corresponding panel navigation signals to a restored docking group. The existing reduced-motion check waits for the preceding touch-reorder animation to finish before changing the motion preference.

Verification results:

- `node --test server/agent-new-tab-ui.test.ts`: Passed in isolated Chromium at 390px and 1100px in both themes. Verified bidirectional picker cycling with two conversations and one conversation, unchanged tab counts, terminal navigation, and existing creation, restoration, focus, and runtime-order checks. Runtime connections used test doubles.
- `npx tsc -b`, targeted `npx oxlint`, the Impeccable detector for `AgentPanel.tsx`, and `git diff --check`: Passed. Existing lint warnings remain.
- `npm run check:docs`: All 553 descriptions and document links passed.

No build, deployment, or server restart was performed; physical phones and production application remain unverified.
