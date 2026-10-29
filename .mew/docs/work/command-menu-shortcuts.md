---
title: "Command menu shortcut work record"
description: "Records implementation and regression check results for adding Alt+R to open the top bar command menu and 1–9 to execute commands on 2026-10-28. Distinguishes the fix and verification for switching project, command, and hamburger dropdowns with one press, existing document link errors, and the scope of production application."
created: "2026-10-28"
updated: "2026-10-28"
---

## Purpose and results

Added Alt+R to open the top bar command menu and numeric execution for the first 9 commands in the menu. Preserves existing Ctrl+E, arrow-key navigation, and Esc return behavior. Numeric selection executes the same action as clicking a command name; port, stop, terminal, and add buttons are excluded from numbering. Numbers are placed within the existing name area to preserve row width even in narrow menus.

Current usage follows the [Command button guide](../../../docs/guides/commands.md), and implementation requirements follow the [Dropdown and selection component contract](../development/ui-contracts.md#dropdowns-and-selection-components).

## Verification and application

- `node --test src/utils/command-menu-keyboard.test.ts server/command-button-menu-ui.test.ts`: 5 tests passed. Checked opening with Alt+R from the editor, physical keys and the numeric keypad, modifier keys, IME, key repeats, disabled items, numeric execution, and focus return. In isolated Chromium, also verified width, row density, and port behavior at 1100/390/320px in light/dark themes and after resizing to 240px.
- `npx tsc -b`: passed.
- `npx oxlint` on 4 changed TypeScript files: passed.
- `npm run check:docs`: description checks passed without errors. The full link check failed due to 18 existing links pointing to feature MOC and task documents that had been deleted before this work. The documents changed in this work have no link errors.

App builds, deployment, and server runs and restarts were not performed. The user applies the changes to running instances after building. Keyboard input on physical mobile devices requires separate verification.

## Dropdown switching fix (2026-10-28)

Fixed an issue where pressing the command button while the project list was open did not open the command list. The existing menu's outside-press handler swallowed the new button's click, and even when clicks were allowed, closing the existing menu first caused back-navigation guard cleanup to cancel opening the new menu. Clicks on other top menu buttons are now passed through, and the existing menu closes in a subsequent task after the new button's click handler finishes. Focus does not return to the previous button, while closing via the same button or a normal outside press is preserved. The current contract is reflected in the [Shared dropdown contract](../development/ui-contracts.md#dropdowns-and-selection-components) and [Project command buttons](../features/terminals-agents-automation/project-command-buttons.md).

- Used the Chromium debugger to inspect outside-press targets and call stacks and `popstate` during switching. Removed temporary debugging files and connections.
- `node --test server/header-menu-switch-ui.test.ts packages/ui/src/useOverlayDismiss.test.ts src/utils/command-menu-keyboard.test.ts`: 16 tests passed. Switching regression checks covered bidirectional switching by click and touch, a single popup, focus, closing with the same button, Esc and back navigation, and blocking normal outside clicks at 1100/390px with light/dark solid colors and gradients.
- `npx tsc -b`: passed. `npx oxlint` on the changed TypeScript files completed without errors; existing React warnings remain.
- `npm run check:docs`: no description errors; the full link check failed due to 18 existing links pointing to deleted feature MOCs and tasks. The changed documents have no link errors.
- The full style check in `server/action-menu-ui.test.ts` failed due to the difference between project item heights of 33px being modified concurrently and hamburger item heights of 32px. This switching regression was verified in a separate file, and style and test changes from other work were not modified.

App builds, deployment, and server runs and restarts were not performed. Application to running instances and verification on physical mobile devices remain.
