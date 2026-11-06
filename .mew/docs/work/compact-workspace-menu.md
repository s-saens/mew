---
title: "Compact workspace menu implementation"
description: "Records the November 5 grouped hamburger menu, notification previews, separate account settings, database actions, tool shortcuts, and Android gateway removal. Includes the November 6 immediate-popup loading correction and separates local verification and existing check failures from deployment and physical-device acceptance."
created: "2026-11-05"
updated: "2026-11-06"
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

## November 6: Show menu dialogs before their code and data

The first-open delay came before API rendering: App wrapped settings/account/admin and other optional dialogs in `deferredComponent(..., null)`, leaving no visible frame while their import graph loaded. The modal components already fetch API data in effects and display their own frames independently; Settings and Account can immediately show existing theme/profile props. React Suspense retries could add another deferred commit after download.

Replaced those dialog boundaries with `deferredDialog`: immediately show a translated, closable loading frame at the destination size/layer; import the optional module in an effect; render the prepared component through ordinary state; reuse public code on warm opens; keep failure/retry inside the dialog; and ignore late UI completions after dismissal. API data remains lazy inside the original components. See the [startup contract](../development/browser-startup.md#optional-tools-and-public-module-scheduling), [overlay contract](../development/ui-overlays.md#opening-deferred-dialogs), and [ADR 0149](../decisions/0149-immediate-deferred-dialogs.md).

Verification for this follow-up:

- `npm run build` passed, including TypeScript checks; the existing large-chunk advisory remains.
- `npm run lint` passed with existing repository warnings.
- A serial run of the two new dialog regressions plus account settings, settings navigation, header notifications, workspace menu, prepared-component, and actual workspace-startup suites passed: 10 tests, 0 failures. The immediate-dialog test was rerun after adding its indicator stylesheet to the capture fixture and passed.
- Controlled production-component imports at 390/1100px verify translated titles/close/loading, dimensions/layering, current props, local error/retry, cached first-commit reopen, close/Esc/Back, retained drafts, and ignored late imports. Inspected the mobile loading-frame capture with its visible shared indicator.
- Actual account/admin/settings APIs were held at 390/1100px: frames and independent fields remained interactive; body data filled the original dialogs; account failure stayed local; typed profile drafts survived; and closed dialogs did not reopen after late responses.
- The actual App startup regression holds Settings and editor chunks together: the Settings shell appears before its module, closes while pending, reopens, and replaces its body without dismissing the workspace or its history guard. Closed tools remain deferred.
- The API and workspace-shell dependency checks passed. The third check in `src/api/client-bundle.test.ts` still fails because it expects the old `packages/editor/src/utils/fuzzy.ts` entry in the explorer graph. The explorer/search sources are unchanged from HEAD, and this unrelated assertion was preserved.
- `npm run check:docs` validated 739 descriptions without metadata errors, then failed on 41 missing local links outside this follow-up's new references. Existing missing MOC/decision entry points and concurrent database documentation are separate from this fix; new ADR/work/startup/overlay links were checked.

No application server, launcher, or deployment operation was performed. These controlled local checks do not establish a measured latency for the user's connection or physical-device behavior.
