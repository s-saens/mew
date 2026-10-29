---
title: "Unify project and command dropdown design"
description: "Records the implementation on 2026-10-28 of shared handles, right-aligned numbers, full-row highlighting without checkmarks, and saved command order for project and command lists. Distinguishes isolated verification, existing document link errors, and the scope not applied to production."
created: "2026-10-28"
updated: "2026-10-28"
---

## Purpose and results

Consolidated project and command list handles and row highlighting into shared components and CSS. Matched command fonts, row heights, and spacing to the project menu, and moved numbers from before the names to the right edge of each item. Removed the current project's checkmark and running commands' dots, using the entire item background to indicate status. Port buttons sit on the line below within the same item.

Command handles support mouse and touch dragging and keyboard reordering. Changed orders are saved serially to the existing command file, preventing status polling and late responses from overwriting the order during saving. On failure, the order reverts to the last saved order. Handles are excluded from initial focus and normal arrow-key navigation to preserve existing numeric execution and row navigation behavior.

The current contracts follow [Shared dropdowns](../development/ui-contracts.md#dropdowns-and-selection-components) and [Project command buttons](../features/terminals-agents-automation/project-command-buttons.md), and usage follows the [Command button guide](../../../docs/guides/commands.md). Earlier shortcut additions and menu switching fixes remain in the [existing record](command-menu-shortcuts.md).

## Verification and application

- `node --test src/utils/command-menu-keyboard.test.ts server/command-button-menu-ui.test.ts server/project-switcher-ui.test.ts server/action-menu-ui.test.ts server/header-menu-switch-ui.test.ts`: 8 tests passed. In isolated Chromium at desktop and mobile widths in light and dark themes, checked shared row layout, surfaces, and focus; active project highlighting without a checkmark; mouse, touch, and keyboard command reordering; consecutive saves; option preservation; restoration after save failure; order after reopening; and numeric execution. Also verified port buttons opening new tabs, horizontal scrolling, the 240px width limit, and top menu switching.
- Reviewed captures of the desktop light-theme and 320px dark-theme command menus and the mobile project menu.
- `npx tsc -b`: passed.
- `npx oxlint` on 9 changed TypeScript files: passed without errors. 2 existing React warnings in `ProjectSwitcher` remain.
- `npm run check:docs`: no description errors; the full link check failed due to 18 existing references to deleted documents. The changed documents have no link errors.

App builds, deployment, and server runs and restarts were not performed. Actual server file saving, operation on physical mobile devices, and application to production require separate verification.
