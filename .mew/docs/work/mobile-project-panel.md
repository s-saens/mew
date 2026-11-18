---
title: "Mobile project panel work record"
description: "Records the full-screen mobile project panel and the November 18 fixes for duplicate safe-area padding and competing fullscreen Back entries. Covers Chromium regressions, build results, and the Android device verification limit."
created: "2026-10-31"
updated: "2026-11-18"
---

## Purpose and result

Changed mobile project selection below 768px from an anchored dropdown to a panel covering the header, workspace, and Dock. The panel reuses the shared dialog for focus containment and Esc/Back dismissal, with a compact title, close icon, safe-area padding, touch-sized rows, and an internally scrolling list.

Project selection and Add Project close the panel. Existing icons, active highlighting, saved order, handles, and keyboard shortcuts remain available. Nested Edit/Delete menus stay inside the dialog's focus boundary and close before the parent panel. The desktop project sidebar and its saved width and open state remain unchanged.

The current contract belongs to the [project feature](../features/projects-files-search/opening-projects-tabs-and-groups.md), [shared UI contract](../development/ui-project-navigation.md#header-project-switcher), and [public project guide](../../../docs/guides/projects.md#프로젝트-탭). [ADR 0102](../decisions/0102-mobile-project-panel.md) records the replacement of the previous mobile dropdown.

## Verification and application

- Isolated Chromium checks verify full-screen bounds at 320×568, 390×700, and 767×400; long-list scrolling; retained close controls; initial focus and Tab containment; nested-menu Esc/Back handling; header menu transitions; project selection; and desktop/mobile resize transitions. Reviewed the mobile Midnight and desktop light captures.
- `node --test server/project-sidebar-ui.test.ts server/project-switcher-ui.test.ts server/header-menu-switch-ui.test.ts server/action-menu-ui.test.ts server/workspace-switch-ui.test.ts server/header-controls-ui.test.ts`: 13 passed, none skipped.
- `npx tsc -b`: passed.
- Targeted oxlint on the changed TSX component and four browser test files: no errors; four existing React warnings remain.
- `npm run check:docs`: passed with no description or local-link errors. `git diff --check`: passed.
- The checks use in-memory UI fixtures and leave the running instance and `dist/` untouched.

No app build, deployment, launcher, server start, or restart was performed. The user must build and apply the changes to running instances. Physical-device verification remains outstanding.


## Safe-area and fullscreen Back follow-up

On 2026-11-18, the mobile project panel began relying on the shared dialog overlay for device insets. The workspace also stopped adding a fullscreen-only History entry so the [shared dismissal stack](../development/ui-overlays.md#overlay-dismissal-rules-useoverlaydismiss) owns Back events delivered to the page. The [project switcher contract](../development/ui-project-navigation.md#header-project-switcher) defines the panel geometry.

- The App regression in isolated Chromium checked panel bounds with substituted device insets, including zero top inset. Repeated browser Back closed the panel and preserved fullscreen and header coordinates. The shared overlay, panel dismissal, and workspace safe-area suites passed all 21 checks.
- `npm run build` passed in a clean source snapshot with this change. In the working checkout, unrelated agent runtime type errors blocked the build. Targeted lint reported no errors and existing App warnings.
- The documentation check passed description validation and reported existing missing links. The older sidebar fixture still failed on its desktop project-menu lookup.
- No deployment or server lifecycle operation was performed. Physical Android Brave Back and system bar transitions remain unverified.
