---
title: "Explorer selection and double-click opening"
description: "Records the 2026-11-01 change to explorer selection, double-click opening, modifier multiselection, selection-bound menus, and bulk operations. Covers passing feature regressions, build, lint and isolated visual checks, a reproduced failure in an unchanged tree-persistence test fixture, and the boundary excluding deployment and physical-device verification. Includes the 2026-11-02 change to explicit Files folder expansion by double-click or icon click."
created: "2026-11-01"
updated: "2026-11-02"
---

## Purpose and resulting behavior

File clicks previously opened documents immediately. The project explorer now separates selection from opening: single clicks select, double-click or Enter opens, Ctrl/Cmd+Enter opens a separate tab, and Space selects. Ctrl/Cmd toggles items, Shift selects a range across the displayed hierarchy, and Ctrl/Cmd+Shift adds ranges. Offscreen virtualized rows participate in range selection and Select All; collapsing or filtering removes hidden items from selection. Documents folders without a representative select on click and expand on double-click or Enter without changing the editor.

Item menus require explicit selection. Right-clicking a selected row retains the group; right-clicking an unselected row clears selection and uses the root menu and destination. Touch long press selects its target before showing the menu. Copy, Cut, Delete, and dragging apply to the selected group, with descendants deduplicated beneath selected ancestors and single-item actions hidden for multiple selections. Invalid and read-only drag destinations reject the drop without redirecting it to an ancestor or root.

The current contracts are [explorer selection and operations](../features/projects-files-search/file-folder-exploration-and-operations.md#selection-opening-and-context-menus), [Documents navigation](../development/document-pages.md#navigation-and-editing), and [ADR 0107](../decisions/0107-explorer-selection-and-opening.md). The [project guide](../../../docs/guides/projects.md#file-and-folder-management) describes user controls.

## Verification

- `npm run build` passed, including `tsc -b` and Vite. Vite reported the existing large-chunk warnings.
- The combined targeted test run reported 32 passes and 1 failure across 33 tests. All 27 feature-related tests passed, including 12 selection unit cases, explorer-search utility checks, and browser regressions across 12 test files.
- A later run of the new selection unit and browser tests passed 13/13. Coverage includes selection across 600 virtualized rows, bulk copy and deletion, cut retry after partial failure, grouped dragging, read-only and self-drop rejection, duplication after focus moves away from the selected item, hover states, and touch interaction.
- The expanded selection browser fixture passed 1/1 with targeted lint clean. It also verifies that repeated Ctrl/Cmd+V does not repeat an in-progress paste, copying a newer selection during a pending cut preserves the new clipboard, and dropping external files into Documents retains root upload behavior.
- The failure came from the unchanged `treePersistence` fixture: happy-dom rejects a Node `CustomEvent` passed to `dispatchEvent`. Rerunning that file reproduced 5 passes and 1 failure. `git diff HEAD` confirmed that `treePersistence.ts` and its test were unchanged. This fixture failure remains a verification limitation.
- `npm run lint` exited successfully with existing warnings outside the changed source. Targeted oxlint checks were clean. The manual Impeccable detector returned no findings (`[]`) for `FileTree.tsx`.
- The final `npm run check:docs` passed description and local-link validation.
- Desktop screenshots in dark and light themes and Chromium touch screenshots were inspected in two bounded rounds. These checks cover isolated browser behavior and appearance; they do not establish physical-device behavior.

## Explicit Files folder expansion (2026-11-02)

Folder names and row space now select without changing expansion. Double-clicking the row, clicking its folder or custom project icon, or pressing Enter toggles children. Icon double-clicks toggle once, and selection modifiers suppress toggling. This applies to ordinary Files folders, subprojects, and the linked Documents folder. Documents page navigation, independent root/scope arrows, and shared server browsing retain their existing behavior. See [ADR 0113](../decisions/0113-explicit-folder-expansion.md) and the [current feature contract](../features/projects-files-search/file-folder-exploration-and-operations.md#selection-opening-and-context-menus).

- Selection, subproject, and touch browser regressions passed (3/3), including single-click selection, icon activation, double-click expansion/collapse, modified clicks, double-tap expansion, custom project icons, linked Documents folders, and independent navigation arrows.
- Documents page, virtualized explorer, sticky ancestor, tab-reveal browser regressions and selection unit tests passed (16/16). Existing expansion actions in fixtures now use double-clicks.
- `npm run lint` passed with existing warnings outside the changed files. The manual Impeccable detector returned no findings (`[]`).
- Desktop light and mobile dark fixture screenshots were inspected; existing row spacing and icons remain intact. These are isolated Chromium checks, not physical-device verification.
- `npm run build` passed, including TypeScript and Vite, with the existing chunk-size warning. `npm run check:docs` passed (633 descriptions, no metadata or local-link errors); `git diff --check` passed.

## Application boundary

No deployment, launcher execution, or server start, stop, or restart was performed. Physical-device verification remains outside this task.
