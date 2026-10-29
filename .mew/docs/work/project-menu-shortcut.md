---
title: "Project list Alt+P shortcut work record"
description: "Records the 2026-10-28 implementation for opening the project selection list with Alt+P, keyboard, permission, and remote input regression check results, existing documentation link errors, and the status of not applied to production."
created: "2026-10-28"
updated: "2026-10-28"
---

## Purpose and results

Added support for opening the project list with Alt+P even from an input field and focusing the first item. If the list is already open, it only moves focus to the first item. Existing arrow-key and Enter/Space selection, Esc return, and Alt+number switching are preserved. The list does not open when a modal is active, during IME input or key repeat, with additional modifier keys, or without permission. Remote keyboard capture takes precedence over Alt+P.

Current usage follows the [Project guide](../../../docs/guides/projects.md#프로젝트-탭), the feature contract follows [Opening, selecting, and switching projects](../features/projects-files-search/opening-projects-tabs-and-groups.md), and the shared implementation follows the [Header project selector](../development/ui-contracts.md#header-project-switcher).

## Verification and application

- `node --test server/project-switcher-ui.test.ts`: 1 passed. In isolated Chromium at 1100/390px, verified opening with Alt+P from an input field, focusing the first item, arrow-key/Enter selection, reopening, Esc return, and the physical Option key. Also checked modal, remote keyboard, IME, key repeat, modifier key, and access permission boundaries, along with existing selection, sorting, icon, and touch behavior. Before implementation, the same regression check failed because Alt+P did not open the menu.
- `node --test server/header-menu-switch-ui.test.ts`: 1 passed. Verified existing top bar menu switching, closing, and focus return.
- `npx tsc -b`: passed.
- `npx oxlint src/components/ProjectSwitcher.tsx server/project-switcher-ui.test.ts`: Passed without errors. 2 existing warnings about ref access during rendering and state updates inside effects remain.
- Impeccable review of the changed component: no findings.
- `npm run check:docs`: The description check passed. The full link check failed on 18 existing links pointing to feature MOC and task documents that had already been deleted before this work. There are no link errors in the documents changed here.

The app was not built or deployed, and the server was not started or restarted. The user must build and apply the changes to running instances. Keyboard input on physical mobile devices and input on physical macOS hardware were outside the scope of this verification.
