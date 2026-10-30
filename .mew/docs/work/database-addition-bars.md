---
title: "Matching icon-only database addition bars"
description: "Records the 2026-10-30 replacement of database row/column addition controls with matching thin borderless plus bars, browser geometry and interaction checks, and the boundary before user build and application."
created: "2026-10-30"
updated: "2026-10-30"
---

Moved column addition out of the bordered table cells and placed it in a vertical bar beside the grid. The row bar below the grid now displays only a plus icon. Both bars share their cross-axis size, icon styling, hover/focus feedback, and disabled behavior. The [database feature contract](../features/document-databases/document-databases-and-catalog.md) owns dimensions and behavior; the [database guide](../../../docs/guides/database.md#creating-and-editing-tables) explains their use.

The grid contains only data headers and cells, including in the empty-table state. Accessible names and tooltips retain action labels. The column menu, row creation, read-only restrictions, and table keyboard navigation retain their existing actions.

The updated styling regression failed against the previous implementation because the row control still displayed text. Browser checks exercise both editor and standalone tables at 390px and 1100px in light and dark themes, measuring equal bar thickness, placement and dimensions outside the grid border, zero borders, absence of visible labels and empty table columns, row activation, horizontal scrolling, read-only hiding, and busy disabling. Captures at desktop and touch sizes were reviewed; touch is emulated, not a physical-device check.

`node --test server/database-table-ui.test.ts server/database-layout-ui.test.ts server/editor-table-database-ui.test.ts` passed all 7 tests with no skips. Existing selection editing, header type menus, cell navigation, view switching, and regular/collaborative conversion checks also passed. The navigation test now waits for the selection control's existing deferred focus restoration before sending Esc. `npx tsc -b`, targeted `npx oxlint`, `npm run check:docs`, and scoped `git diff --check` passed. Browser fixture bundling retained existing dependency `use client` warnings.

No app build, deployment, server launch, or restart was performed. The user builds and applies the changes to the running instance.
