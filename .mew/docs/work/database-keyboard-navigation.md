---
title: "Keyboard navigation through database titles and cells"
description: "Records the 2026-10-30 implementation of arrow-key database cell navigation, editing boundaries, browser regression coverage, local verification, and the boundary before user build and application."
created: "2026-10-30"
updated: "2026-10-30"
---

Added a shared keyboard navigation path through the database title, column headers, and displayed data cells. Current behavior is owned by the [database feature contract](../features/document-databases/document-databases-and-catalog.md#keyboard-navigation-in-table-views); user instructions are in the [database guide](../../../docs/guides/database.md#moving-between-cells-with-the-keyboard).

Focusable cell containers support navigation without modifying values. Enter/F2 opens the existing editor or field action; leaving an input preserves its existing save behavior. Text caret movement, selection menus, composition, and modified shortcuts keep their existing responsibilities. The title remembers the active column, and movement stops at edges, follows sorting/filtering, reveals offscreen columns, and remains within one table. Header editing started with a keyboard focuses its input on touch layouts, and canceling a rename returns focus to the header.

Browser fixtures cover desktop and touch layouts at 1100px and 390px in light and dark themes. They exercise title/header/data movement, edge stops, header rename and cancel, input saves, text caret/selection boundaries, page titles and links, number/date values, single/multi-select popups, checkboxes, IME and modified-key exclusions, sorting, filtering, empty/read-only tables, column deletion, scrolling, and two independent tables. The editor conversion regression also exercises navigation in regular and collaborative editor nodes. Captures of focus outlines and horizontal scrolling were reviewed; touch behavior was emulated, not tested on a physical device.

`node --test server/database-table-ui.test.ts server/editor-table-database-ui.test.ts server/database-layout-ui.test.ts` passed all 7 tests with no skips. Existing column type menus, selection editing, compact layout, view switching, and regular/collaborative conversion undo/redo also passed. The fixture bundler emitted existing dependency `use client` warnings. `npx tsc -b`, targeted `npx oxlint` for the four changed code/test files, `npm run check:docs`, and scoped `git diff --check` passed.

No app build, deployment, server launch, or restart was performed. Browser fixtures use in-memory data; no Postgres integration was run. The user builds and applies the changes to the running instance.
