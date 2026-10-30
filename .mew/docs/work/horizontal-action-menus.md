---
title: "Reusable horizontal icon action menus"
description: "Records the shared ActionMenu orientation option, horizontal editor icons and hover labels, table icon distinctions, responsive overflow, local browser verification, and pending runtime application."
created: "2026-10-30"
updated: "2026-10-30"
---

## Purpose and result

Changed the editor body context menu to one horizontal row of icons while retaining its existing surface, permissions, action handlers, and selection/scroll lifetime. The shared `ActionMenu` now accepts `orientation="horizontal"`; vertical remains the default. A context value supplies presentation and closing behavior to the same `ActionMenuItem` and separator children, including inline table actions. There is no second action list or execution path.

Icon items keep hidden text and hint content, accessible names, and mouse-hover labels through the existing `HoverTipLayer`. Explicit tooltip descriptions and complex labels with `aria-label` remain supported. The row uses 32px mouse targets and 36px coarse-pointer targets and scrolls horizontally when it exceeds its host. Keyboard navigation reveals focused items. Row/column deletion, database conversion, and Markdown copy now have distinguishable table icons. Tooltip placement uses the menu's portal host, the shared tooltip layer token, and direction flipping and clamping at screen or modal bounds.

Current behavior is owned by the [shared action-menu contract](../development/ui-contracts.md#shared-action-menus), [editor body menu contract](../development/ui-contracts.md#editor-body-context-menu), and [package responsibilities](../development/packages.md). [0096](../decisions/0096-shared-horizontal-action-menus.md) records the reuse decision, and the [editing guide](../../../docs/guides/editor.md#body-context-menu) describes the control for users.

## Verification

- The updated `server/editor-context-menu-ui.test.ts` passed all 6 tests. It checks a single horizontal icon row with hidden labels and accessible names while retaining native selection, read-only actions, clipboard behavior, changed ranges, touch and wheel scrolling, click dismissal, and keyboard policy.
- `server/action-menu-horizontal-ui.test.ts` passed, exercising the same action children vertically and horizontally at 1280/390/320px. It covers disabled and checked states, custom tooltips, complex accessible labels, close-on-select behavior, touch tooltip suppression, keyboard navigation, long-row overflow, top-edge tooltip placement, and modal portal containment.
- `server/action-menu-ui.test.ts` and `server/editor-table-menu-ui.test.ts` passed, preserving vertical menu styling, header behavior, focus and dismissal, and clicked-cell table additions/deletions and read-only copying.
- Inspected actual editor captures in mobile light and desktop dark themes, the table action row, and narrow-screen tooltip placement. CDP function breakpoints confirmed that a tooltip fixture was being hidden by a scroll queued when an artificially short dialog clipped its menu; the fixture now provides normal modal space. Temporary debugger instrumentation and connections were removed.

- `npx tsc -b` and targeted oxlint checks passed. The existing 2 React ref warnings in `ActionMenu` and 1 effect warning in `HoverTipLayer` remain. Impeccable's detector reported no findings in the changed shared menu and tooltip sources.
- `npm run check:docs` passed with 577 descriptions and no metadata or local-link errors. `git diff --check` passed.

## Application and limitations

Browser checks use isolated Chromium and synthetic native-selection ranges. Physical Android/iOS selection handles and production application remain unverified. No app build, deployment, launcher, or server start, stop, or restart was performed; the user applies the change to the running instance.
