---
title: "Keyboard navigation through database titles and cells"
description: "Records the initial arrow-key database navigation and the November 5 correction to focus destination inputs for immediate typing. Covers editing boundaries, browser regression checks, local verification, and runtime application limits."
created: "2026-10-30"
updated: "2026-11-05"
---

Added a shared keyboard navigation path through the database title, column headers, and displayed data cells. Current behavior is owned by the [database feature contract](../features/document-databases/document-databases-and-catalog.md#keyboard-navigation-in-table-views); user instructions are in the [database guide](../../../docs/guides/database.md#moving-between-cells-with-the-keyboard).

## November 5: Immediate input focus

Arrow navigation previously focused only the destination cell container. Typing required another click or Enter/F2 even when an input was already visible. Navigation now focuses the destination's enabled, writable input, excluding checkboxes, and falls back to the cell container when no such input exists. This covers database titles, text, page titles, numbers, and dates while retaining explicit header, selection, checkbox, and read-only actions. Existing caret boundaries, IME handling, blur saves, and scrolling remain in place.

The updated browser regression failed on the expected input-focus assertion before the fix and passed afterward. Coverage includes typing directly into navigated text and page-title inputs, saving when focus leaves, and immediate typing inside regular and collaborative document editors.

Local verification:

- `node --test server/database-table-ui.test.ts server/editor-table-database-ui.test.ts server/database-layout-ui.test.ts`: all 7 tests passed, with no skips, covering desktop and emulated touch layouts in light and dark themes. The fixture bundler emitted dependency `use client` warnings.
- `npm run build`: passed, including TypeScript project checks and the Vite production build; Vite reported large-chunk warnings.
- `npm run lint`: passed with warnings in unrelated existing code; no diagnostics referenced the changed code or tests.
- `npm run check:docs`: all 719 descriptions passed. Link validation reported 42 existing missing-target errors, including missing `.mew/docs/MOC.md`, `.mew/docs/decisions/MOC.md`, and `.mew/docs/decisions/README.md`. The database guide's unchanged parent metadata also references the missing root MOC; this task adds no new document links.
- Scoped `git diff --check`: passed. Existing section anchors and changed descriptions were inspected.

The build refreshed local `dist/` assets. No deployment or server lifecycle operation was performed. Browser fixtures use in-memory data; physical devices, live-instance interaction, and Postgres integration were not verified.

## October 30: Initial navigation

Focusable cell containers support navigation without modifying values. Enter/F2 opens the existing editor or field action; leaving an input preserves its existing save behavior. Text caret movement, selection menus, composition, and modified shortcuts keep their existing responsibilities. The title remembers the active column, and movement stops at edges, follows sorting/filtering, reveals offscreen columns, and remains within one table. Header editing started with a keyboard focuses its input on touch layouts, and canceling a rename returns focus to the header.

Browser fixtures cover desktop and touch layouts at 1100px and 390px in light and dark themes. They exercise title/header/data movement, edge stops, header rename and cancel, input saves, text caret/selection boundaries, page titles and links, number/date values, single/multi-select popups, checkboxes, IME and modified-key exclusions, sorting, filtering, empty/read-only tables, column deletion, scrolling, and two independent tables. The editor conversion regression also exercises navigation in regular and collaborative editor nodes. Captures of focus outlines and horizontal scrolling were reviewed; touch behavior was emulated, not tested on a physical device.

`node --test server/database-table-ui.test.ts server/editor-table-database-ui.test.ts server/database-layout-ui.test.ts` passed all 7 tests with no skips. Existing column type menus, selection editing, compact layout, view switching, and regular/collaborative conversion undo/redo also passed. The fixture bundler emitted existing dependency `use client` warnings. `npx tsc -b`, targeted `npx oxlint` for the four changed code/test files, `npm run check:docs`, and scoped `git diff --check` passed.

No app build, deployment, server launch, or restart was performed. Browser fixtures use in-memory data; no Postgres integration was run. The user builds and applies the changes to the running instance.
