---
title: "Compact workspace menu implementation"
description: "Records the November 5 grouped hamburger menu, notification previews, separate account settings, database actions, tool shortcuts, and Android gateway removal. Separates local verification and existing check failures from deployment and physical-device acceptance."
created: "2026-11-05"
updated: "2026-11-05"
---

## Purpose and result

Implemented the [menu reorganization task](../../tasks/Done/Reorganize%20the%20hamburger%20menu.md) under [ADR 0147](../decisions/0147-compact-workspace-menu.md). The menu groups account identity, four compact notification previews with full history, tools, and Mew settings. General rows are 32px on desktop and 36px with a coarse pointer; profile and preview rows retain readable, bounded heights. Account settings are independent of general Settings. Database actions are available in the Dock and beside explorer/editor work. Chat remains directly accessible in the Dock. Tool shortcuts are permission gated and Android emulator functionality is removed end to end.

Current contracts remain in the [menu](../development/ui-overlays.md#header-hamburger-menu), [notification](../development/ui-recovery-feedback.md#header-notifications), [account](../features/appearance-accounts-operations/accounts-roles-feature-permissions-and-guest-sharing.md), [database](../features/document-databases/document-databases-and-catalog.md), and [keyboard](../development/ui-editor-input.md#focus-based-tab-shortcuts) owners.

## Verification

- `npm run build` passed (TypeScript project checks and production Vite build); Vite retains its existing large-chunk advisory.
- `npm run lint` passed with existing repository warnings.
- Final combined shortcut, Dock, notification, and shared translation unit checks passed: 43 tests. Android capability, deleted routes, demo host, panel dismissal, mobile restoration, and legacy layout checks passed: 31 tests.
- The six account/profile/settings/header/notification/workspace-menu UI suites passed together with `--test-concurrency=1`. An earlier parallel run exposed the existing profile fixture response-release race; the serial rerun passed all six.
- Additional database and chat Dock UI checks, explorer selection, Dock settings/mobile gestures, action-menu primitives, header switching, and overlay appearance passed. Four actual App regression cases passed for keyboard aliases, task panels, permission invalidation, and mobile swipes.
- The actual shared-demo host flow passed at 1440px and 390px, including Remote Desktop → Database Dock → visible, clickable database dialog and mobile video-stream cleanup. Test-owned temporary fixtures and browsers were cleaned up.
- Inspected menu captures at 320/390/1100px in light/dark themes, plus account and database controls. Automated checks cover 32/36px action density, 38px previews, four-item bounds, avatar fallback, unread descriptions, retained keyboard focus after acknowledgment, complete history, four locales, and viewport/Dock boundaries. Captures use example/mock data.
- `npm run check:docs` validated 736 descriptions with no metadata errors, then failed on 41 existing missing local targets, including removed MOC/decision entry points. Newly added task/ADR/work-record links were inspected directly.

## Remaining limits

The broader `src/ui-localization.test.ts` literal scan remains failing on 551 legacy literals across demo/example data, debugger helpers, and other existing sources; the new workspace controls use all four app locales. Two changed example-data strings remove Android references rather than adding untranslated control labels. The complete demo browser suite also fails in unrelated task-list fixtures before the host flow, and the separate Dock maximize test retains its preexisting 0px-versus-6px context-menu radius expectation. These checks are not reported as passing.

Application servers, the Mew launcher, and deployment were not operated. Browser checks use isolated test-owned Chromium; they do not establish physical-device behavior or a server-side operational rollout. The required build updates local `dist/` assets served by an existing instance, while removed server routes take effect when the user later restarts the server.
