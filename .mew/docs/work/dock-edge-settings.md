---
title: "Independent desktop and mobile Dock positions"
description: "Records the 2026-10-30 implementation of independent desktop/mobile Dock edge settings, scoped browser persistence, responsive layout reservation, isolated regression checks, and pending application to the running instance."
created: "2026-10-30"
updated: "2026-10-30"
---

## Purpose and result

Settings → Dock now offers top, bottom, left, and right positions independently for desktop and mobile. Defaults remain left at widths of at least 768px and bottom below that breakpoint. The existing custom selector stays inside the settings popup layer. Reset restores positions together with visibility and order.

The workspace reserves space at the selected edge without remounting panels. Left/right docks support vertical scrolling when screen height is insufficient and use vertical reordering; top/bottom docks use horizontal reordering. A position change cancels a pending drag. Keyboard-hidden and empty docks release their reserved space. Position values are validated independently and stored in scoped browser preferences. The remote viewer retains its existing toolbar layout.

Current contracts: [Dock settings](../../../docs/configuration/appearance.md#dock-settings), [appearance settings feature](../features/appearance-accounts-operations/appearance-language-fonts-and-shortcuts.md), [panel layout feature](../features/appearance-accounts-operations/panel-layout-mobile-and-state-restoration.md), and [shared Dock contract](../development/ui-contracts.md#dock-and-top-menu).

## Local verification

- Eight Dock unit and isolated Chromium checks passed: input normalization, independent position selection and persistence, reload, reset, same-page and storage-event synchronization, themed custom selectors, existing touch/drag behavior, and keyboard reordering.
- Checked all four edges at 320/390/1024px in dark and light themes, content boundaries, keyboard-hidden and empty-dock space recovery, and drag cancellation when changing position, and touch scrolling to the final side-dock item at 390×260px without selecting, navigating, or reordering. Reviewed representative settings and desktop/mobile edge captures.
- Existing isolated mobile panel swipe and settings navigation checks passed. The actual App check passed for all four edges at 390/1100px, content and dock boundaries, the explorer toggle boundary, and existing mobile dock/explorer swipes.
- Type checking (`npx tsc -b`), full lint (warnings only), documentation checks, and the Impeccable detector passed.
- Three of four additional locale checks passed. The UI literal audit failed on pre-existing untranslated strings in unchanged files such as `src/api/client.ts`, `src/api/task-list.ts`, and `src/components/debugger-helpers.ts`; none of its reported files belong to this change.
- The additional `dock-maximize-ui.test.ts` regression failed at its context-menu padding assertion (`6px` versus `0px`, line 141). An isolated copy using the pre-change `src/index.css` reproduced the same failure. No passing maximization result is claimed.

## Application boundary

No app build, deployment, launcher, server start, or restart was performed. Applying the source changes to the running instance and physical-device checks remain with the user.
