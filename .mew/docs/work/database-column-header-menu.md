---
title: "Database column type menus on headers"
description: "Records the 2026-10-30 move of database column type menus from data cells to column headers, regression coverage, local verification, and the boundary before user build and application."
created: "2026-10-30"
updated: "2026-10-30"
---

Moved column type changes to column headers so users can change the primary column between text and page from the title header, including when the table has no rows. Current behavior is owned by the [database feature contract](../features/document-databases/document-databases-and-catalog.md); user instructions are in the [database guide](../../../docs/guides/database.md#changing-column-types).

Headers open the shared type menu on right-click, ContextMenu, or Shift+F10. Type-icon clicks, primary-column restrictions, regular-column choices, and document-level conversion to a Markdown table are preserved. Data cells no longer open type menus. Read-only and busy headers block type changes.

The updated regression test failed against the previous implementation because Shift+F10 in a data cell still opened the type menu. After the change, `node --test server/database-table-ui.test.ts server/editor-table-database-ui.test.ts` passed all 5 tests with no skips. Isolated Chromium covered 390px and 1100px layouts, header and SVG right-clicks, keyboard activation and focus restoration, text↔page conversion, empty tables, read-only/busy restrictions, page opening, failed cell saves, and editor conversion with regular and collaborative undo/redo. Existing compact table layout and selection-option checks also passed. The fixture bundler emitted existing dependency `use client` warnings.

Reviewed header menu captures at both screen widths. These use in-memory fixtures and touch emulation, not a physical mobile device. `npx tsc -b`, targeted `npx oxlint` for the three changed code/test files, and `git diff --check` passed. The initial `npm run check:docs` passed. A final rerun passed all descriptions but found one unrelated link from `agent-input-mentions-skills-and-attachments.md` to the missing `work/agent-settings-keyboard.md` in concurrent changes. No link errors were reported for this task's documents.

No app build, deployment, server launch, or restart was performed. Postgres integration was not run; browser fixtures use in-memory data. The user builds and applies the changes to the running instance.
