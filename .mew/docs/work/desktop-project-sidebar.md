---
title: "Desktop project sidebar work record"
description: "Implementation and verification record for replacing the desktop project dropdown with an independent panel to the left of the file explorer and adding per-project command buttons on 2026-10-28. Distinguishes retention of the mobile dropdown, fixed command targets, root session isolation, previously running sessions, and the scope not applied to production from the shared panel background fix and verification on 2026-10-29."
created: "2026-10-28"
updated: "2026-10-29"
---

## Purpose and results

Changed the header project selector to open a **project sidebar** to the left of the file explorer on desktop. Users can switch projects while keeping the list open and run commands with ▶ on each project row. Viewing, editing, or running commands for another project fixes only the request target and does not change the current project, document, or layout.

Retains the existing handles, icons, right-side numbers, full highlighting of the current row, reordering, and right-click editing and deletion. It closes and resizes independently of the file explorer and restores the per-account open state and width stored in the browser. Selection, outside clicks, Esc, and Back do not close the panel. Closing it with the close button or header selector restores the existing icon, name, and command button display. Mobile uses the existing dropdown.

Alt+P opens the panel and focuses the first item, and exits maximization if the work panel is maximized. Alt+R and Ctrl+E open the command menu on the current project row when the panel is open, or in the header when it is closed or on mobile. Commands with the same name in different root projects are isolated using session identifiers that include the actual folder path.

Current usage follows the [project guide](../../../docs/guides/projects.md#프로젝트-탭) and [command guide](../../../docs/guides/commands.md); feature contracts follow [Opening, selecting, and switching projects](../features/projects-files-search/opening-projects-tabs-and-groups.md) and [Project command buttons](../features/terminals-agents-automation/project-command-buttons.md); shared implementation follows [UI contracts](../development/ui-contracts.md#header-project-switcher); changes to existing decisions follow [ADR 0082](../decisions/0082-desktop-project-sidebar.md).

## Verification and application

- `node --test server/workspace-switch-ui.test.ts server/project-sidebar-ui.test.ts server/project-switcher-ui.test.ts`: 9 passed. Verified the order and toggle positions of the two navigation panels in the actual App, panel persistence after switching projects, return from maximization and focus with Alt+P, and restoration of open/closed state and width after refresh. In an isolated panel, checked handles, keyboard reordering, resizing, per-project commands and working roots, mobile dropdown switching, and existing input boundaries. Also reviewed dark and light desktop and mobile captures.
- `node --test server/cmd-button-workspace.test.ts server/cmd-button-workspace-ui.test.ts server/cmdButtons.test.ts server/cmd-button-ports.test.ts server/subprojects.test.ts server/command-button-menu-ui.test.ts server/header-menu-switch-ui.test.ts server/action-menu-ui.test.ts`: 18 passed. Checked command requests fixed to a project, root session isolation, and existing command menu behavior.
- `npx tsc -b`: passed.
- oxlint on 11 changed TS and TSX files: passed without errors. Existing warnings and warnings related to state effects remain.
- Impeccable checks of 4 changed UIs and a separate design review: no blocking defects.
- `npm run check:docs`: no description check errors. The full link check failed on 18 references to deleted targets in existing feature MOCs and tasks. No link errors in the documents changed here.

The app was not built or deployed, and the server was not started or restarted. The user must build and apply the changes to running instances. Root command sessions already running under previous identifiers are not automatically terminated, and the new menu does not carry over the display of their running status. They can be checked and terminated in existing terminals; folder-specific identifiers are used starting with new runs.


## Shared panel background fix (2026-10-29)

Fixed an issue where only the project sidebar retained a solid background while popup backgrounds and blur were layered over its internal list. Applied the shared surface class used by other panels to its base, and classified the persistent list as an inline menu to exclude popup effects. Also aligned the header's left padding with the file explorer at 8px. The current standard follows the [header project selector](../development/ui-contracts.md#header-project-switcher).

- Project sidebar regression checks: verified background matching with the file explorer across 7 actual themes, a transparent inline list background with no blur and inherited theme colors, and retention of the existing blur in command popups and the mobile dropdown. Before the fix, the same regression check failed because a 75% background remained on the list in light themes.
- Browser checks for shared menus and theme settings also passed. Reviewed midnight, dark, and light desktop captures and a midnight mobile capture.
- `npx tsc -b`: passed. `npx oxlint` on the changed TSX and tests passed without errors, with 4 existing warnings. The Impeccable check found no issues in the changed UI.
- `npm run check:docs`: no description check errors. The full link check failed on 19 temporary asset URLs in README and references to deleted documents that predated this work. No link errors in the documents changed here.

No build, deployment, or server restart was performed. The user applies the changes to actual instances after building.
