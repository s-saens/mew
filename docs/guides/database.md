---
title: "Table Databases (/db)"
description: "Explains inserting Postgres document databases, matching plus-only row/column addition bars, table conversion and undo, calendar and Gantt ranges, keyboard cell navigation, header type menus, search, grouping, and sorting. Also covers primary columns, immediate linked-page title previews, filename changes after saving, row-page sharing, read-only references, and backups."
updated: "2026-10-30"
상위파일:
  - "../../.mew/docs/MOC.md"
  - "MOC.md"
---
Use this to embed editable data tables in documents or display existing Postgres tables read-only. If you only need a simple table in the document body, choose [Markdown tables](editor.md#editing-and-copying-tables), which work without Postgres.

## Creating and Editing Tables

An operator must first configure `DATABASE_URL` on the server. The logged-in account needs the database feature and access to all project files; making changes also requires permission to modify files. If connection settings are missing or the connection fails, only DB features become unavailable; other editing features continue to work.

1. Open a Markdown document in the project in **Hotview**.
2. Type `/db` at the insertion point and select **Database**.
3. Edit the table title and cells. Use the `+` bar to the right of the table to add text, number, checkbox, date, single-select, or multi-select columns. The `+` bar below the table adds a row. Click a column name to rename it. To use the page type, change the primary column's type.
4. To find tables in other documents, open the full list for this project from the header menu → **Databases**.

A new table has a **Title** primary column and a **Text** column, with 2 example rows: `항목 1` / `첫 번째 내용` and `항목 2` / `두 번째 내용`. Replace the cells and column names with your own content.

Table, card, board, calendar, and Gantt views are available. The title and view settings have no borders; only the table's field area has a rounded border and cell dividers. Row, cell, column, and title changes appear in real time in logged-in sessions viewing the same DB.

In **Plain**, Ctrl+click the `<div data-mew-db="…"></div>` portion, or Cmd+click on Mac, to open that DB in a popup. Read-only references remain read-only in the popup. A regular click edits the source text; DB notation inside code examples or comments does not open as a link.

## Converting Between Databases and Regular Tables

In an editable Hotview document, right-click a DB and select **Convert to Table** to transfer all columns and rows to a regular table. This includes rows hidden by search. The original DB and row pages remain, and edits to the regular table do not affect the original DB.

Right-click a regular table and select **Convert to Database** to import all columns as text fields. If the first column has empty or duplicate values, the original cells are preserved and a separate primary column is added at the beginning. No example rows are added to a table that has only headers.

Conversions in either direction can be undone in one step with **Ctrl/Cmd+Z** and redone with **Ctrl/Cmd+Shift+Z** or **Ctrl+Y**. Undo restores the original table formatting or DB reference settings. Undoing a table-to-DB conversion leaves the created DB in the list and reuses it on redo. Converting the table to a DB anew later creates a new DB and does not restore the previous field types.

## Switching Views

Click **Table, Cards, Board, Calendar, or Gantt** below the DB title to view the same data in different ways. On narrow screens, these appear as icons; when a button has focus, you can also switch with the arrow keys.

| View | How to use |
| --- | --- |
| Table | Edit values by column and sort with the button to the right of a column title. |
| Cards | View item titles and key properties as cards. Choose which columns to show under **Visible Properties**. |
| Board | Choose a single-select or checkbox column under **Group By**. On a computer, drag cards to another group; on a phone, change the corresponding property in the card details. |
| Gantt | Choose **Start Date and End Date** columns to view each row's date range as a bar. Click a name or bar to open the item details. |
| Calendar | Choose a date column to use as the **End Date**. If you also choose a **Start Date** column, events appear across the entire date range. Click a date to display all items for that day below. You can navigate to the previous or next month and to **Today**. |

Click a card or event to open the item details. Property changes also appear in the table and other views; use **Open Page** to open a linked subpage. Delete rows from the bottom of the details window.

The `+` in a board group creates a new item in that group; the `+` on a calendar date or **Add Row** in the selected date's list creates one on that date. If the required select or date columns are missing, create them with the add button in the view. Items without dates appear under **No Date** below the calendar.

In the calendar's **Start Date** list, choose an existing date column or use **Add Column** to create a new start date column. Open an event to enter its start and end dates in the shared date picker or click two dates to set a range. The trash button clears both linked dates. Ranges include both the start and end dates; if only one date is set, the event appears on that date. Items added for a specific date initially have both endpoints set to that day. Set the start date to **No Date** to edit single-day events as before.

Gantt starts with the current month. It provides previous and next month navigation, **Today**, zoom controls, and an **All** date-range view. Rows without dates remain visible, and dates can be entered in the item details. In month view, drag bars to move them; if a start date column exists, drag either end to change the range. Drag horizontally across the empty timeline of a row without dates to assign dates. With a bar focused, press the left or right arrow key to move it by one day; Shift changes the end date, and Alt changes the start date. In the **All** date-range view, edit through the details window or keyboard.

Use the search icon to search all properties in the current DB. In editable documents, the selected view, reference columns, and visible properties are saved in the document. View settings in the full DB popup are saved in this browser. Read-only DBs also support switching views, searching, and viewing items.

## Sorting Rows

Click the sort button to the right of a column title to cycle through **Ascending → Descending → Clear Sort**. Clicking another column's button sorts by that column. Numbers and dates are sorted by value, and empty values always appear last.

Sorting is also available in read-only tables. It applies only to the table currently being viewed and does not change the saved row order or sorting in other tables. Clearing the sort restores the original order.

## Moving Between Cells with the Keyboard

Use the arrow keys to move between cells. The DB title acts as a cell above the column headers: **Down** moves from the title to a header, then into the data rows; **Up** returns along the same path. **Left/Right** move between columns. Moving back down from the title returns to the previous column. Movement follows the currently sorted and filtered rows and stops at the table edges. This also works in read-only tables and between the title and headers of an empty table.

Press **Enter** or **F2** on a focused cell to edit it, open its selection list, or toggle its checkbox. On a column header, this edits the column name. **Enter** finishes text editing and returns focus to the cell; **Esc** returns to navigation. Esc during a column rename cancels the change. Existing cell edits save when focus leaves the input.

While editing text, Left/Right move the text cursor; at the beginning or end they move to the neighboring cell. Up/Down move to the adjacent row. Open selection menus keep their own arrow-key controls. To use cell navigation again after choosing an option, press Esc to return focus from the selection control to its cell.

## Changing Column Types

Right-click the header of the column you want to change and choose a type. The type icon to the left of the column name opens the same menu. With a header control focused, press **Shift+F10** or the **Context Menu** key to open it, and **Esc** to close it. This works even when the table has no rows. The new type applies to all rows in that column; data cells do not offer type changes. Use single-select to choose one value and multi-select to choose multiple values. You can add new options while editing a select cell.

If any value cannot be converted, the type change is not applied. For example, if a multi-select row has multiple selected values, reduce it to one before changing the column to single-select.

The leftmost data column represents each row. This primary column cannot be deleted, and every row's value must be nonempty and unique within the DB. The primary column's type is text or page. Internal row IDs are maintained separately from these titles.

New rows start with a unique `제목 없음` value. When an existing table is first opened, empty primary-column values are filled with default titles, and duplicate values receive numbers.

## Opening Rows as Subpages

Changing the primary column's type to **Page** creates a subpage for each row, using its value as the title. Open the document from a page cell to edit its body and properties. Pages are saved by name directly beneath the document containing the DB. For example, the `송상훈` row in the `Books` document becomes `Books/송상훈.md`. If a document with the same name exists, a number is appended. Opening the DB also moves existing UUID files into this structure while preserving their bodies.

Editing a page-type primary value immediately updates its displayed name in the explorer and open tabs, like editing a Task title. After saving, the linked file is renamed to match, and the page button uses its confirmed new path. Existing bodies, supported links, and open drafts are retained. If the page has children, its folder and representative file are renamed together. A page moved elsewhere stays in that location; later title edits rename it there. Failed saves restore the confirmed title without overwriting newer input.

Saving a linked subpage also requires the database feature and permission to modify all project files, as required for DB editing.

For example, if the **Title** primary column contains `송상훈` and the **Age** number column contains `27`, the created page is titled `송상훈` and its frontmatter stores `나이: 27` as a number. Changing the age in the table updates the page property, and changing it on the page updates the table. Multi-select values are shared as YAML arrays.

The `created` and `updated` fields are not automatically added to these subpages. If dates are needed, define them explicitly as DB columns. Editing only the body also does not automatically change an existing `updated` value.

Changing the primary column back to text or deleting a row or DB stops field sharing with the page. Existing subpage bodies remain. Converting the same row back to a page preserves its existing body.

In single-select and multi-select lists, click an item's color circle to open the same palette used for task tags, or the pencil to rename it. Clicking X deletes the option and its selected value from every row. Other multi-select values remain. Changes to option names and colors, as well as deletions, also appear in linked row pages.

## Referencing Existing Tables Read-Only

In Hotview, select `/` → **Database Reference** (you can also search with `/db-ref`). Choose an existing DB in the current project, or specify an external table in the server-connected Postgres using `schema` and `table`, then click **Reference Read-Only**. This dialog does not accept a new connection address, so an operator must configure the Postgres connection first. Reference views cannot modify the source data.

## Storage Locations and Sharing Scope

The document body containing the DB stores its reference ID and document-specific display settings (the default table uses `<div data-mew-db="uuid">`), while the actual table data is stored in Postgres. Linked field values are synchronized to row subpages as frontmatter, but this does not replace backups of the DB definition, row IDs, or complete data. **Copying Markdown files or committing them to Git alone does not copy or back up table data.** In production, preserve project files, including subpages, and Postgres data separately.

Physical tables are stored in the per-project schema `mew_{프로젝트}`, and metadata (titles and columns) in the catalog schema `mew`. DB IDs from other projects cannot be queried. External tables are also linked to the current project for use; opening a Markdown document through guest sharing does not transmit DB row data.

## Running Only Postgres with Docker Compose (Optional)

The current Docker Compose setup supports only Postgres for the `/db` feature. There is no Dockerfile for the app container, so do not run `--profile app`. An operator with Docker Compose installed runs it from the **Mew installation folder**.

```bash
npm run db:up     # Postgres만 127.0.0.1:55432에 기동
npm run db:down   # Postgres 중지
```

Keep `DATABASE_URL` and `MEW_PG_PASSWORD` in a configuration file that is not committed to the repository. A basic connection example is available in [.env.example](../../.env.example).

## Security

- All values use parameters (`$1`), and all identifiers are quoted after being generated by the app or validated against an allowlist (`[a-z0-9_]+`) (`server/db/identifiers.ts`) — preventing SQL injection.
- external (reference) tables are **read-only**. No INSERT/UPDATE/DELETE/DDL operations are performed on the source tables.
- All REST and WS endpoints under `/db` are mounted with `requireAuthenticated`, so **guests cannot receive row data**.
- Backend layers: `pool → identifiers → schema → catalog → databaseService → hub`; REST: `server/db/routes.ts`; real-time relay: `server/db/socket.ts`.

Security boundaries are implemented in `server/guestAccess.ts` (per-file guest authorization), `server/paths.ts` (deny list), and `server/reqAuth.ts` (role gating). **[security.md](../operations/security.md) is the canonical source for the policy itself**, and this code implements it — update the docs in the same session when changing the policy.
