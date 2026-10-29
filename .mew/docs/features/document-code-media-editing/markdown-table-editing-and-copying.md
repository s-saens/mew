---
id: "mew-editor-tables"
parent: "mew-editor"
title: "Markdown Table Editing and Copying"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-28"
status_hash: "a4d3adb2072291555b6bd681a8a5b7e3b9de108e056a15951673f169dd30caf7"
files: ["packages/editor/src/editor/TableTooltip.tsx", "packages/editor/src/editor/TableCopyMenu.tsx", "server/tableLayout.ts"]
commits: []
description: "Feature contract covering right-click row/column addition and deletion and conversion to a DB with text fields, integrated with the common body menu for Markdown tables; single-step undo/redo; column resizing; and copying as text, Markdown, CSV, and images. Also explains deletion of the last row or column, DB value preservation, and table width storage boundaries."
상위파일:
  - "MOC.md"
  - "_document-code-media-editing.md"
---

## Requirements

- Edit tables in documents and copy them in other formats.

### Scope

- Provide row and column operations, column resizing, copying as Markdown, CSV, and images, and conversion to a document DB.

### Boundaries and limitations

- Store Markdown tables in the document body and document DB rows and columns in Postgres. Conversion replaces the document block and does not delete the DB.
- The supplementary column width storage format follows the editing guide.

### Detailed contracts

- Right-clicking a table shows the existing table-specific items below Annotation, Comment, Copy, Cut, Paste, Delete, and Select All in the standard body menu. All items use an icon on the left and a name on the right. Selection, permissions, and clipboard behavior for standard items follow the [Editor Right-Click Contract](../../development/ui-contracts.md#editor-body-context-menu).
- Right-clicking a cell in an editable table shows `행 추가` and `열 추가` above the table format copy items. Add a row directly below or a column directly to the right of the right-clicked cell, regardless of the existing cursor position. These actions are also available for header cells and the last row or column.
- `행 삭제` and `열 삭제` in the same menu delete the row or column containing the right-clicked cell. This also applies to headers; deleting the only remaining row or column removes the entire table. These actions are provided separately from `삭제` for selected text in the common body menu.
- In editable documents, use `데이터베이스로 전환` in the right-click menu to convert the entire table to a DB. All columns are text, and strings that look like numbers, dates, or booleans are stored unchanged. If the first row is a header, use it for column names; otherwise, generate column names and store data starting from the first row. Normalize empty, duplicate, and reserved column names into distinct names. If values in the first column are empty or duplicated, preserve the original values and add a text primary column at the front.
- Store cell paragraphs and hard line breaks as text line breaks, and exclude formatting such as bold and links from DB values. Place merged-cell text only in the starting cell and leave the remaining cells empty. A table containing only headers creates a DB with no rows and does not insert sample rows. Imports are limited to 200 columns and 10,000 rows. Preserve the original table on invalid input or save failure.
- Conversion provides single-step undo and redo in both regular history and Yjs collaboration history. Undo restores the original table formatting, and redo reuses the same DB already created. Cancel replacement if the source is edited or deleted or the document becomes read-only while conversion is pending. Detailed storage boundaries follow the [DB Feature Contract](../document-databases/document-databases-and-catalog.md#markdown-tables-and-conversion) and [Conversion Decision](../../decisions/0035-table-database-conversion.md).
- In read-only mode, hide row/column addition and deletion and DB conversion, and provide only Markdown, CSV, and image copying as table-specific items. In table areas outside cells, also provide DB conversion and copying when the user has edit permission.
- When text is selected and copied within a single header or body cell, copy only the selected characters as plain text. Do not include table HTML tags or Markdown formatting, and preserve paragraphs and hard line breaks within the cell as line breaks.
- Multiple-cell selections, whole-table selections, and the table copy menu retain the existing copy formats.
- [Editing guide](../../../../docs/guides/editor.md)

<!-- mew:implementation:start -->
## Implementation details

- `packages/editor/src/utils/clipboardTable.ts` detects text selections within the same cell, and the clipboard text serializer in `Editor.tsx` returns the selected text before Markdown serialization.
- Provide row and column operations, column resizing, and copying as Markdown, CSV, and images.
- `Editor.tsx` passes the right-clicked cell to the menu. When an add or delete item is activated, `TableCopyMenu.tsx` moves the selection to that cell's current document position and executes the row or column command. Edit permission and the cell's attachment status are also checked at execution time.
- `TableCopyMenu.tsx` uses the API injected into the DB extension to run the conversion in `database/tableConversion.ts`. It maps the document position while the request is pending and replaces the source node only if it remains intact. It separates the preceding and following ProseMirror and Yjs history groups so the conversion is not grouped with other input.
- Align the table container with the body start line to the right of the line numbers, with no internal padding before the table. Keep line numbers in the gutter even during horizontal scrolling of wide tables ([Package Contract](../../development/packages.md)).

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- Use `server/editor-table-menu-ui.test.ts` to verify row and column insertion and deletion relative to the right-clicked cell at desktop and mobile screen widths, headers, the last row and column, entire table removal, cursor positions in other tables, keyboard activation, Esc cancellation, and read-only menus.
- `server/editor-table-database-ui.test.ts` checks menus for both conversion directions in actual Hotview, regular/Yjs undo and redo, table preservation on failure, and read-only controls. `packages/editor/src/database/tableConversion.test.ts` checks pure conversion, input normalization, and change boundaries while requests are pending.
- Use `packages/editor/src/editor/markdownBehavior.test.ts` to verify copying partial and full text in header and body cells, multiple paragraphs and hard line breaks, and existing copy boundaries for cross-cell selections, cell selections, whole-table selections, and regular body text.
- Use `server/editor-line-numbers-ui.test.ts` to verify container, table, and line number alignment and horizontal scrolling on PC and mobile.
- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Check that row and column edits and widths persist after reopening and that copied output matches the table contents.

<!-- mew:validation:end -->
