---
id: "mew-database-document-tables"
parent: "mew-database"
title: "Document Databases·Full List"
status: "implemented"
created: "2026-09-18"
updated: "2026-11-06"
status_hash: "ea759314baf1dca2105e78500c7277302e925451b58b01f45479cf00db9e02ad"
files: ["src/components/DatabaseListModal.tsx", "packages/editor/src/database/DatabaseTable.tsx", "packages/editor/src/database/databaseNavigation.ts", "packages/editor/src/database/DatabaseCollection.tsx", "packages/editor/src/database/DatabaseBoard.tsx", "packages/editor/src/database/DatabaseCalendar.tsx", "packages/editor/src/database/DatabaseGantt.tsx", "packages/editor/src/database/DatabaseRowDialog.tsx", "packages/editor/src/database/databaseLayout.ts", "packages/editor/src/database/databaseSchema.ts", "server/db/databaseService.ts", "server/db/documentReferences.ts", "server/db/documentReferenceIntegration.ts", "server/db/rowPages.ts", "server/db/routes.ts"]
commits: []
description: "Defines floating explorer/editor entry points, persisted project/file/line references, last-reference deletion, Postgres document DB editing, Markdown table conversion, larger table cells and titles, compact calendar days, rounded field grids with icon-only addition bars, and calendar and Gantt date ranges. Also covers keyboard navigation with immediate input focus, header type menus, queries, search, grouping, linked-page title previews and filename renames, synchronization, access boundaries, and separation from tasks."
상위파일:
  - "MOC.md"
  - "_document-databases.md"
---

## Requirements

- Insert a table database into a document and edit project data.

### Scope

- Provides document DB insertion; table, card, board, calendar, and Gantt views; title, text/number/checkbox/date/single-select/multi-select/page columns; row and cell editing; and real-time updates.
- Provided alongside the independent [Task Panel](../projects-files-search/task-panel-list-calendar-and-gantt.md). Task Markdown and DB rows are not automatically migrated or synchronized.
- Switching views of the same DB does not duplicate row or column data. Open item details from cards or events to use the existing property editor and navigate to the linked row page.
- Boards group items by single-select or checkbox columns. Calendars use an end-date column and an optional start-date column to display single-date events and date-range events by month. If required columns are missing, editable DBs offer an option to add them.
- View and edit DBs in the current project from the floating button at the upper right inside the explorer file area or the editor button immediately left of the AI action. These buttons open the same database-list popup and require database feature access. The catalog has no Dock entry or Dock visibility/order setting; stale saved Dock entries are ignored.
- Ctrl/Cmd+click a DB reference in Plain to open a popup with that DB selected.
- Use the sort button to the right of each column title to cycle through ascending → descending → off. Read-only tables can also be sorted.
- Right-click a column header to change its type. The type change applies to every row in that column; data cells do not offer type changes.
- Use arrow keys to move focus between the DB title, column headers, and data cells. Navigation follows the displayed rows and also works in read-only tables.
- The first data column is the primary column for each row and contains nonempty, unique titles. Its default type is text, and it can be converted to a page type.
- A new DB starts with a primary column named `제목`, a regular column named `텍스트`, and 2 rows populated with example values.
- Converting the primary column to a page type creates a subpage for each row directly under the document containing the DB, using the row's title as the filename, and shares the remaining column values bidirectionally with the page's frontmatter fields.

### Boundaries and limitations

- The Markdown body containing the DB stores its reference ID and per-document display settings; Postgres owns the actual row and column data. Fields of rows linked to pages are also synchronized to the subpages' frontmatter.
- The DB API cannot be used without a Postgres connection.
- Check DB feature permissions and project-wide access permissions.
- Saving linked subpage files requires the same feature permissions and project-wide modification permissions as editing the DB.

### Detailed contracts

- [Database Usage·Storage Contract](../../../../docs/guides/database.md)
- [Decision on Row Subpages and Shared Fields](../../decisions/0012-database-row-pages.md)

<!-- mew:implementation:start -->
## Implementation details

### Markdown Tables and Conversion

- In editable Hotview documents, right-click a DB or open an editable column header's type menu for `표로 전환`. It converts the entire DB, including from its title, card, board, or calendar view. Standalone DB popups omit this option. Read-only references and external tables can become snapshot tables when the containing document is editable. A read-only document offers neither conversion direction.
- DB→table calls `getView(id, {allRows: true})` for all rows and columns, ignoring search, sorting, view settings, and the default 1,000-row query limit. It creates a regular table in the document body: column names become headers; numbers, checkboxes, dates, and page titles become text; multi-select values become comma-separated text; empty values become empty cells. Line breaks remain. DB types, selection colors, and row-page bodies are not copied.
- `데이터베이스로 전환` in `TableCopyMenu` saves cell text to a new DB. `POST /api/db` validates optional `table: {columns: string[], rows: string[][]}`, creates text columns, and saves definitions and rows in one transaction. Default `/db` insertion retains 2 example rows; imports with `table` create none. Imports allow up to 200 columns and 10,000 rows. The browser demo uses the same normalization.
- Nonempty, unique first-column values make that column primary. Otherwise, a separate text primary column starting with `항목 1` is prepended without changing the original cells. Empty, duplicate, or reserved column names receive distinct replacements. Headerless tables and merged cells follow the [Markdown Table Contract](../document-code-media-editing/markdown-table-editing-and-copying.md#detailed-contracts).
- Either conversion is one step in regular ProseMirror and collaborative Yjs history. Undo/redo restores the original node's DB UUID, read-only status, and view settings, or its table formatting. The conversion transaction itself does not delete DB data; saving the resulting document follows the reference lifecycle below. Saving removal of the last reference deletes the DB, so document undo cannot restore its Postgres data afterward. Other remaining references preserve the DB. Linked row-page bodies remain. A later table→DB conversion creates another DB without restoring the original types.
- Pending conversions track the source node through subsequent transactions and preserve edits elsewhere. Source modification/deletion or a switch to read-only prevents overwrite. Duplicate requests for the same node are blocked; deletion is requested for a new DB that cannot be inserted. API failure preserves the document block and shows an error. See the [Conversion Decision](../../decisions/0035-table-database-conversion.md).

### Persisted document references and database lifetime

- The catalog shows every recorded reference of the selected DB as project, project-relative file path, and 1-based source line. Repeated blocks in one file, including blocks on the same line, are separate references. Editable blocks and read-only references both count.
- Successful document writes register inserted DB blocks and update existing references, including line shifts caused by edits elsewhere in the document. File copies register their destination; file/folder moves remap recorded paths before reconciling changed content. The external-file watcher processes changed paths and registered deletions. Opening the catalog never searches document bodies or backfills the workspace.
- `mew.database_references` stores the DB UUID, project, path, line, and occurrence within the file. A document update replaces only that document's references. A batch registers all surviving destinations before checking for orphaned DBs. Transactions serialize reference changes per project and lock affected DB records.
- Removing a block or deleting its document removes its reference. Missing reference metadata from an older version is tolerated. API writes/deletes retain the previous content to identify legacy removals; external deletions can remove only already recorded references. Existing documents gain metadata when saved or changed, without a workspace migration scan.
- If a removal leaves zero recorded references, delete the DB catalog entry and, for managed DBs, its physical table. For external DBs, remove only Mew's catalog attachment; never modify or drop the external source table. Row-page bodies remain, with field sharing stopped. New DBs awaiting insertion and untouched legacy DBs are not deleted merely because a catalog read shows zero references.
- An optional Postgres outage does not roll back an otherwise successful file edit. Synchronization errors are logged; reference metadata may remain stale until that path is changed again. Offline or unrecorded legacy references cannot protect a DB from zero-recorded-reference cleanup.
- Reference lifetime supersedes the conversion retention rule in [ADR 0035](../../decisions/0035-table-database-conversion.md), as recorded in [ADR 0148](../../decisions/0148-database-document-references.md).

### Multiple views and item details

- All five views use the UI font, independent of the surrounding document's font, weight, and line height. The shared surface uses 12px text and 16px line height; table headers and values use 14px text and 18px line height. DB titles use 17px in editable and read-only views. Document heading styles exclude DB controls: board/calendar headings retain 12px type and compact margins in embedded and standalone views. These sizes assume the default browser root font size.

Table dimensions preserve compact rows and touch targets:

| Element | Size |
| --- | --- |
| Text, number, date, and page-title cells | 14px text; cell padding adds 2px on every side of the existing controls (text inputs retain 8px horizontal and 4px vertical padding, or 6px vertically for coarse pointers) |
| Headers | 10px horizontal and 4px vertical padding around existing 24px desktop or 32px touch controls |
| Standard text rows, including dividers | About 31px desktop or 35px touch; selection tags can increase height |
| View tabs | At least 28px desktop; 40px touch targets |
| Date-column selectors | Minimum 32px desktop or 40px touch |
| Addition bars | Existing dimensions retained |

Other view dimensions:

| View | Spacing and size |
| --- | --- |
| Cards | 8px padding and section gaps; 4px between property rows. Grid: 8px outer padding/gaps and 240px preferred minimum card width |
| Boards | Same outer spacing; 240px lanes with 6px inner padding |
| Calendar | Day cells grow with events; minimum 48px below the small-screen breakpoint, 64px above it, with 2px inner padding and 2px below date controls |
| Gantt | 28px desktop or 32px touch rows; 20px or 24px bars. The 24px-per-day default zoom, sticky title rail, date calculations, and drag distances remain unchanged |

- `DatabaseCollection` shares the title, view switching, and search across the existing `DatabaseTable`, cards, boards, and calendars. Editor nodes, the full DB popup, and the browser demo use this UI; table remains the default. Narrow screens replace view names with icons, accessible names, and shared tooltips. Even single-column tables retain room for all view buttons. Tabs support arrow keys, Home, End, Enter, Space, and touch.
- Cards show the primary-column title, the first text property's preview, and properties chosen in `표시 속성`. Option colors, dates, numbers, and checkboxes follow existing field types. A separate button opens a linked row page when present. Mobile uses one column; wider screens fit columns to the available width.
- Boards group rows by a selected single-select or checkbox column, retaining empty configured groups and an ungrouped group. Each row appears exactly once. Desktop dragging between groups changes the grouping value; drags from other DBs are ignored. Touch/keyboard users edit that property in card details. Each group's add button prefills its value in a new row. Horizontal scrolling stays within the board.

The calendar uses an end-date column, an optional start-date column, and a Sunday-first 6-week grid. `열 추가` in the start-date selector creates and immediately connects a date column. The endpoints cannot share a column; omitting the start date retains single-date events.

| Dates | Display |
| --- | --- |
| Both valid | Every date between and including the endpoints; the selected date's list also shows the range |
| Only one valid | That date |
| Reversed | Between the two dates, without changing stored values |
| Both missing or invalid | Separate `날짜 없음` list |

Only the visible 42 days are calculated, even for long ranges.

- Calendar controls navigate months, return to today, select dates, and add rows by date. Dates retain their original calendar values without time zone conversion. Date-specific rows fill both connected endpoints with the selected date. The default list shows all today's events. Month navigation selects that month's first day, or today for the current month. Each date shows up to 3 items followed by a Show more button; the selected-date list lets users read full titles and open any item.
- Calendar/Gantt details use shared `DateCalendar`. With a start-date column, they offer start/end inputs, both-date selection, range highlighting, and Clear event; otherwise, single-date editing. The existing cell API saves each connected column. Read-only mode permits date-column selection and range viewing, but no date changes or column creation.
- Search matches cell values in the current DB and displays rows matching all search terms. Results apply across all views without changing the server's row order or other display positions. Per-column table sorting remains in the existing table state.
- Cards/events open shared `DialogFrame` details. Existing cell components edit primary, text, number, date, checkbox, and select properties. Save failures appear in both details and the DB block, followed by reloading server values. Deletion requires confirmation in details. New board/date-specific rows save initial properties before opening details; if that save fails, the created row remains and an error appears.
- Read-only references and external DBs also support view switching, search, and viewing details, but do not allow property changes, group moves, or adding or deleting rows or columns. Data access and modification retain the existing DB API's project, feature, and file permissions.

### Gantt

- Gantt shares the same DB rows and the calendar's `dateColumn` and `startDateColumn`. Without a start date, it displays a one-day bar. Reversed dates, single-sided dates, and invalid dates follow the calendar's range normalization. Rows without dates retain their titles and the ability to open details.
- Gantt provides a date axis for the current month, previous month, next month, today, zoom in, zoom out, and a full-range view. Horizontal scrolling is confined to the DB, and titles on the left remain fixed. Only search results are displayed, and queries and row, column, and cell saves use the existing controller.

Gantt editing depends on view and access:

| Context | Behavior |
| --- | --- |
| Month view, pointer | Move bars, resize either end when a start-date column exists, or draw on empty rows' timelines to update existing date cells. Pointer cancellation does not save |
| Bar keyboard focus | Left/Right moves one day; Shift changes the end date, Alt the start date |
| Full-range view | Edit through details or keyboard, not pointers |
| Read-only | No moving, range changes, or drawing |

- Open shared item details from a title or bar to edit dates and other properties. Completion colors, tags, assignees, and automatic creation features specific to the task panel are not included. Existing task Markdown is not automatically migrated to the DB or deleted. Follow the [integration decision](../../decisions/0051-database-gantt.md).

### Saving view settings

- The document node's `layout` is `{mode, groupColumn?, dateColumn?, startDateColumn?, visibleFields?}`, with modes `table`, `cards`, `board`, and `calendar`. `dateColumn` is the end-date or single-date column, and `startDateColumn` is the optional start-date column. Normalized JSON is URL-encoded and stored in `data-mew-db-layout`. Default table settings omit the attribute to preserve the existing Markdown representation. The server collaboration schema and client use the same parser and serializer.
- If the document is editable, the reference's view, grouping/date columns, and visible properties are saved in Markdown. Display settings remain independent even when other documents reference the same DB. If the document is read-only, changes apply only to the current screen. DB row and column definitions remain in Postgres; saving display settings does not replicate DB data into Markdown.

The standalone popup restores display settings from scoped localStorage `mew:db-layout:<DB UUID>` when reopening the same DB. Unavailable storage retains selections for the current screen. Search terms, selected rows, and calendar month are not persisted.

| Invalid saved selection | Fallback |
| --- | --- |
| Grouping/end-date column deleted or its type changed | First available column of the same type; otherwise add-column or empty state |
| Start-date column deleted or no longer a date type | Display without a start date |

See the [display settings decision](../../decisions/0028-database-multiple-views.md).

### Keyboard navigation in table views

- The title is one merged cell above the headers. Down moves title → header → data rows in the same column; Up reverses. Left/Right changes columns. Returning through the title remembers the previous column, clamped to remaining columns after deletion. Edges stop without wrapping or leaving the DB. Empty tables still support title/header navigation.
- Arrow navigation directly focuses the editable input in the destination title, text, page-title, number, or date cell, allowing immediate typing without another click or Enter/F2. Read-only cells, headers, selections, and checkboxes retain container focus with theme-colored outlines. Moving focus does not change values, open pages or menus, or toggle checkboxes. Enter/F2 on a container enters the existing editor, opens a selection list, or activates a checkbox; a read-only page cell opens its linked page. Activating a header edits its name, including physical-keyboard use in touch layouts.
- Up/Down in single-line text, number, or date inputs moves between rows without incrementing numeric/date values. Left/Right moves the text caret, then enters the adjacent cell at the boundary. Text selections, Shift/Alt/Ctrl/Meta combinations, and IME composition keep their behavior. Enter saves and returns cell focus. Esc returns to navigation; during column renaming, it cancels the rename.
- Selection controls retain their existing arrow behavior while directly focused or open. Their popups, the header type menu, view tabs, search fields, and other view controls handle their own keys. Navigation in the table does not intercept their events or change card, board, calendar, or Gantt interactions.
- `databaseNavigation.ts` reads the current table row and cell positions, so sorting and filtering determine movement order without a separate row model or a scan of every data cell per key. Focus reveals the destination inside the table's scroll container. Editor nodes and standalone DB popups share this implementation; other tables and surrounding document content are excluded.

### Existing tables and data synchronization

#### Plain references and popups

- In Plain Markdown HTML blocks, a `div` with a valid `data-mew-db` UUID is displayed as a link. Ctrl+click or Cmd+click opens the full list popup with that DB selected. A normal click retains source editing; code blocks, inline code, HTML comments, and invalid UUIDs are not treated as links. Opening a link does not change the Markdown body.

- Popup requests and row-page navigation use the project scope of the document where the reference was opened. References with `data-mew-db-readonly="true"` open the DB as read-only. DB links are not enabled for guests, external files, or during file revalidation, and the server's existing DB permission checks remain in place. Switching documents or projects closes the editor pane's DB popup.

- The full list and DB popups opened from Plain use the shared `DialogFrame`. They follow the shared theme's background, blur, and border, ensuring the inner panel background does not obscure the outer blur. The close button, clicking outside, or Esc closes the popup and restores the previous focus; Tab focus remains inside the popup.

#### Table geometry and creation

- Tables in the editor and full DB popup start with the first data column, without a dedicated row-delete button column on the left. The empty-table message spans only the data columns.

Editable tables put a vertical add-column bar right of the field grid and a horizontal add-row bar below it.

| Property | Contract |
| --- | --- |
| Appearance | Borderless, centered plus icon only; accessible names and shared tooltips, no visible text |
| Cross-axis thickness | Both 20px desktop or 32px for coarse pointers |
| Placement | Outside the rounded data border; adding a column creates no empty header/body column |
| Extent | Right bar spans grid height; bottom bar spans visible grid width |
| Other views | Same icon-only row bar |
| Access/busy state | Hidden in read-only views; disabled during schema changes |

- The overall DB block, title, view switcher, display settings, and Add row have no borders and use the document background directly. Only the table's field grid is enclosed by a border with 6px corners; cell dividers use `edge-strong`, as in regular Markdown tables. The table body uses `surface-deep` and column headers use `surface-raised` backgrounds at 20% opacity. Cards, empty boards, calendar date cells, and events also have no borders, using backgrounds and spacing for separation. The full DB popup reuses the same styles. Regular Markdown table cell padding does not apply to DB tables, preserving their existing density.

- The DB creation transaction saves the `제목` and `텍스트` columns together with 2 rows containing `항목 1` / `첫 번째 내용` and `항목 2` / `두 번째 내용`, and returns them in the creation response. The browser demo uses the same initial values. Example rows and columns are not added to existing DBs or external read-only references.

#### Sorting and width

- An always-visible sort icon button appears to the right of each column title. Clicking, Enter, Space, or touch cycles through ascending → descending → off; selecting another column switches to ascending order for that column. The active column displays a directional arrow, an accent color, and `aria-sort`, while the button name and tooltip describe the next action.
- Sorting affects only the displayed table in the editor, popups, or read-only references. Stored DB order and other tables' sorting remain unchanged; off restores server row order. Numbers sort numerically, dates by time, checkboxes unchecked → checked, and text/pages/options naturally for the UI language. Multi-select compares joined option names. Empty values stay last in both directions; equal values retain original order. Cell/row updates reapply sorting; removed columns' sorting is ignored.

- The DB block and columns hug content. Title-area content cannot widen the block; long titles fit the available width. Editing inputs, options, and page titles affect column width, without forcing narrow blocks to fill the screen. Wider tables stay within the parent's width and scroll internally without widening the document. Read-only tables and the full popup follow the same rules.

#### Selection options

- Single-select values are stored as one string, and multi-select values as an array of strings. Options are managed per column, and new options can be added while editing a cell.

- Each item in a selection list uses the same 16-color palette and default color calculation as task tags. Use the color circle to choose a color, the pencil to rename an option, and X to delete it. The chosen color is saved in per-column option metadata so it appears consistently across other cells, sessions, and row pages.

- Renaming updates single-select and multi-select values and subpage properties for every row using that option. Deletion removes the option, its color, and corresponding selected values together. Single-select values become empty, while multi-select values retain other selections. Duplicate names, empty names, and unsupported colors are not saved.

#### Column types and primary values

The column-header menu changes an entire column's type, even with no rows.

| Action or condition | Behavior |
| --- | --- |
| Open | Right-click anywhere in the header, click its type icon, or press ContextMenu/Shift+F10 with a header control focused |
| Esc | Close and restore invoking-control focus, including invocation through its SVG icon |
| Read-only or busy header | No type menu |
| Data-cell context menu, mouse or keyboard | No type changes; document-level conversion remains available |
| Primary column | Only text↔page; internal value remains a title string, with row UUID as primary key |
| Regular column | Page type prohibited |

- A new row's primary value starts with a unique `제목 없음`. When primary-column constraints are first applied to an existing DB, empty values are filled with a default title and duplicate values are distinguished by appended numbers. Subsequent saves of empty or duplicate values and deletion of the primary column are rejected.

- Type changes validate all values in the column before applying the change. If any value cannot be converted, no change is made. Rows with more than one multi-select value cannot be converted to a single-value type. Deleting an option in use with X also cleans up row values in the same transaction; simply replacing the option list does not discard values in use.

#### Linked row pages

Changing the primary column to page creates `<대표열 값>.md` for each row directly under the source document.

- A single-file source becomes a primary file under normal child-document rules; no separate DB document or UUID folder is created. Existing UUID files migrate with bodies and row links intact.
- Primary-title edits immediately preview names in the explorer/open tabs; confirmed saves rename files in their current directory. Parent folder and representative rename together, retaining children and attachments. Supported links, tabs, drafts, and nested DB bindings follow the [database row-page contract](../../development/database-row-pages.md#database-row-subpages) and [0093](../../decisions/0093-database-row-title-renames.md). Collisions use safe numbered names; unrelated synchronization preserves manually selected paths.
- The primary value shares frontmatter `title`; other columns use display names as field names. Numbers, checkboxes, and multi-select retain YAML number, boolean, and array types. Regular column names exclude `title`, `_mew_database`, `_mew_row`, and `상위파일`.

- Subpage edits and table-cell changes update linked fields bidirectionally, preserving the body and unlinked frontmatter. `created` and `updated` are shared only when explicitly defined as DB columns, never generated automatically. Editing a bound page's body does not set `updated` to today.

- Changing page to text or deleting a row or DB stops sharing. Existing page bodies are not automatically deleted, and converting the same row back to page preserves the existing body. Page paths, linking metadata, and document lifetime follow the [database row-page contract](../../development/database-row-pages.md).

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- Reference lifecycle, event integration, Dock removal, and catalog display checks are recorded in the [reference implementation work record](../../work/database-document-references.md).

- `packages/editor/src/database/tableConversion.test.ts`: Checks single-step and consecutive undo/redo in regular and Yjs history, reuse of the same DB, preservation of strings, line breaks, and empty values, primary-column addition, invalid input, position changes while pending, source changes, and duplicate requests.
- `server/editor-table-database-ui.test.ts`: Checks bidirectional context menus and the existing column-type menu in the actual editor in light and dark themes at 390px and 1100px, regular/collaborative history with Ctrl+Z and Ctrl+Shift+Z, formatting restoration, same-DB reuse, creation failures, read-only references, and conversion of all rows.
- `server/db/databaseService.test.ts` and `server/db/routes.test.ts`: Check text imports, empty tables, existing creation defaults, preservation of invalid input, default/full queries of 1,001 rows, and project isolation in isolated Postgres. `src/demo/transport.test.ts` checks the same import rules in the demo.

- `server/database-layout-ui.test.ts`: Checks borderless titles and view settings, switching among 5 views, card editing, opening pages, search, board dragging, start-date column creation, failure recovery, view switching while creation is pending, range selection, clearing, adding by each endpoint date, deletion, month navigation, popup display-setting restoration, save errors, and read-only controls in dark and light themes at 390px and 1100px. Measures compact typography, view tabs, card padding and gaps, calendar day minima, and Gantt rows and bars in both standalone and editor hosts with oversized surrounding typography. Also verifies that switching buttons are not clipped in a single-column read-only table at 320px. See the [density work record](../../work/database-view-density.md) for execution results and application boundaries.
- `packages/editor/src/database/databaseLayout.test.ts`: Checks settings validation and encoding, search, preservation of empty and ungrouped groups, leap years, year-end boundaries, invalid dates, ranges including both endpoints, single-sided dates, reversed dates, and limiting long ranges to the visible screen range. `packages/editor/src/serverExtensions.test.ts` verifies settings preservation and Markdown round trips in the server collaboration schema, including the start-date column setting.

- `server/database-links-ui.test.ts`: Verifies Ctrl/Cmd+click, normal clicks, exclusion of code examples, invalid UUIDs, read-only behavior, and missing-DB errors in the actual Plain editor pane. Also checks document project scope, body preservation, cell editing, and the shared popup's theme-specific backgrounds, blur, mobile boundaries, closing, and focus restoration.
- `server/database-table-ui.test.ts`: Verifies editor/standalone table input fonts, compact row/header heights, cell padding, the field grid's 6px corners, content-based block and column widths, and internal horizontal scrolling at 390px and 1100px in dark and light themes. Also checks that long DB titles do not widen the overall block, border colors match regular Markdown tables, titles have no background or border, and column header backgrounds have 20% opacity. Verifies per-column sort button cycling, `aria-sort`, keyboard and touch operation, independent per-table state, and read-only sorting.
- The same test verifies matching borderless addition bars, icon-only labels, placement outside the data grid, exact row/column dimensions, absence of blank table cells, row activation, and read-only/busy behavior. See the [addition bar work record](../../work/database-addition-bars.md).
- `packages/editor/src/database/databaseSort.test.ts`: Verifies numbers, dates, checkboxes, text, pages, options, empty and equal values, preservation of original order, clearing sorting, and deleted columns.
- `server/database-table-ui.test.ts` also covers header right-clicks, header keyboard menus, SVG focus restoration, absence of type menus on data cells, primary text↔page conversion, regular-column choices, empty DBs, and read-only/busy restrictions at 390px and 1100px. See the [header menu work record](../../work/database-column-header-menu.md) for execution results and application boundaries.
- The browser tests also cover keyboard navigation through the DB title, headers, and all field types; immediate typing in text and page-title inputs after navigation; edit/cancel behavior; caret boundaries; selection popups; sorted/filtered rows; empty/read-only tables; column deletion; scrolling; and isolation between tables. `server/editor-table-database-ui.test.ts` checks the same title/header/cell path and immediate typing inside regular and collaborative editors. See the [keyboard navigation work record](../../work/database-keyboard-navigation.md).
- `server/db/databaseService.test.ts` and `server/db/routes.test.ts`: Verify creation responses and storage for the primary column, text column, and 2 example rows in isolated Postgres. `src/demo/transport.test.ts` verifies demo creation, requerying, and adding a third row.
- `server/db/selection-options.test.ts`: Verifies option color preservation, propagation of renames and deletions to all rows and subpages, and no changes from invalid edits in isolated Postgres.
- `server/db/row-page-layout.test.ts` covers title-driven file/folder renames, collisions, deferred autosave paths, children and attachments, composed path mappings, nested bindings, and rollback. `server/database-page-title-ui.test.ts` covers immediate explorer/tab previews, delayed saves, newer drafts, page links, and failed-save recovery through the actual host bridge. See the [row-title rename work record](../../work/database-row-title-renames.md) for execution results and limitations.

- 2026-10-21 table/DB conversion: Passed 43 regression checks covering regular and Yjs undo/redo, actual context menus at 390px and 1100px in light and dark themes, existing DB views, table menus, Markdown, and the demo. Passed 48 service, route, row-page, and option checks in a separate temporary Postgres instance with `--test-concurrency=1`, then stopped and deleted the test DB. Verified full retrieval of 1,001 rows, text value preservation, empty tables, creation failures, cancellation on source changes, and same-DB reuse. Type, targeted lint, documentation, and static UI checks passed; full lint retained only existing warnings. No app build, deployment, or server restart was performed.

- 2026-10-21 view cleanup: Passed 25 related tests for DB state, sorting, Markdown, the collaboration schema, tables, views, links, and the shared date calendar. Verified borders enclosing only fields, 6px corners, and range editing in dark/light captures at 390px and 1100px and single-column table captures at 320px. Updated the DB link check's light-background and blur expectations to match the current shared popup contract. Type checks, targeted lint, documentation checks, and static UI checks passed; full lint retained only existing warnings. Postgres integration checks, app builds, deployment, and server restarts were not performed.

- 2026-10-20: Passed 20 related UI, state, Markdown, and demo checks and 45 service, route, row-page, and option checks in temporary Postgres. Compared borders and header backgrounds with regular tables in dark/light captures at 390px and 1100px. Type, lint, documentation checks, and the targeted UI checker also passed, and the temporary DB was stopped and deleted. No app build, deployment, or server restart was performed.

- 2026-10-02: Rendered the actual DatabaseTable in isolated Chromium and verified it at 1000/390px in light/dark themes. The 2-row table height changed from 190→162px and corners from 8→2px, and it uses the body background token. Targeted lint and the UI checker passed. No deployment build or server restart was performed.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that cell and column changes propagate between two sessions and that access using a DB ID from another project is denied.
  - Verify that changing a type through the column header context menu applies to the entire column, and that empty values, duplicate values, prohibited types, and deletion are rejected for the primary column.
  - Verify that converting a row with `제목: 송상훈` and `나이: 27` to a page preserves the page title and YAML number.
  - Change table and page properties separately and verify that changes propagate in both directions while preserving the body and user properties.
  - Verify that existing subpage bodies remain when page mode is disabled or a row or DB is deleted.

- 2026-10-23 Gantt integration: Passed 48 DB, docking, dock, and layout unit checks, 10 focus, tab, and collaboration schema checks, and 1 actual DB view browser check. At 390/1100px in dark/light themes, checked that opening undated Gantt items makes no changes, range display, keyboard editing, resizing, drawing on empty rows, saved-state restoration, and read-only behavior, plus switching among five views at 320px. Type checks, documentation checks, and static UI checks passed; full lint retained only existing warnings. Postgres integration, app builds, deployment, and server restarts were not performed.

- 2026-10-23: Separate panel scenarios in the actual App at the time of task panel removal also verified removal of the task dock, stopping automatic queries, opening Features with Alt+F, and not launching the terminal with Alt+T on desktop and mobile. The existing full workspace scenario fails at the old feature panel's `region: 기능` selector; the same failure was reproduced in a separate main checkout from before the changes. No claim is made that this entire scenario passed. The task panel is subsequently restored according to [0052](../../decisions/0052-restore-task-panel.md), and this item is retained as a verification record from the time of removal.

<!-- mew:validation:end -->
