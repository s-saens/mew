---
title: "Task panel and Markdown storage contract"
created: 2026-10-03
updated: "2026-11-03"
description: "Task panel contracts for input, tags, assignees, dates, list/calendar/Gantt views, and sorting. Defines Markdown source and installation metadata, Done-folder and legacy migration, API permissions, concurrent saves, client recovery, and recorded verification."
상위파일: "MOC.md"
---

[Features](../features/projects-files-search/task-panel-list-calendar-and-gantt.md) · [Usage](../../../docs/guides/projects.md#tasks)

The standalone task panel reads Markdown through list, calendar, and Gantt views. Toggle it from the dock or with the default `Alt+T` shortcut. The [editor DB Gantt view](../../../docs/guides/database.md#switching-views) remains a separate dataset, without automatic migration or synchronization. See the restoration decision [0052](../decisions/0052-restore-task-panel.md).

## Input and panel

The `tasks` docking panel manages the current root project's flat list independently of memos. Items are `{id, text, done, tags?, assignees?, startDate?, date?, path?}`; tags, assignees, and dates are optional. There is no priority property.

| Input or action | Behavior |
| --- | --- |
| List/calendar text | Collapses to one line with `…` when space is insufficient; focus expands the full text. Blur collapses it without changing text or Shift+Enter line breaks |
| Final draft input | Empty and unfocused: only a horizontally centered +, without text or checkbox. Click the row or Tab into the existing input to type |
| Enter or focus leaving the draft | Creates an object; after Enter, the same input accepts the next item |
| Enter in an existing item | Splits at the cursor/selection, retaining the original ID on the left and assigning a new ID on the right |
| Shift+Enter | Inserts a line break within the item |
| Multiline paste | Creates one object per line; the first line in an existing item keeps its ID |
| Backspace in an empty item | Deletes it. The delete button can also remove the first item |
| Up/Down at the beginning/end | Moves to adjacent items |
| Enter during IME composition | Neither creates nor splits tasks |
| Checkbox click/tap | Changes completion only, preserving saved order. The default filter hides completed items immediately; shown completed items have strikethrough and remain editable |

After button or empty-item Backspace deletion, focus stays off other inputs so the mobile keyboard does not reopen.

**New-item shortcuts.** With this panel selected, Ctrl/Cmd+N, Ctrl/Cmd+T, Alt+N, or a customized `newTab` invoke its action:

- List/calendar focus the end of the final draft without losing input. Calendar commits receive the selected date and active tag filter.
- Gantt creates the default title, as New Task does, with the active tag filter.
- Read-only mode, loading, and the 2,000-item limit block creation without falling through to new-file creation. Registration covers header, body, empty areas, popup/docked modes, and project switches. Modals, IME, and repeats follow shared creation-key blocking.

`server/task-shortcuts-ui.test.ts` checks actual TaskPanel/capture handling on PC/mobile across all three views, draft preservation, project switches, permissions, loading, and the limit.

**Swipe deletion.** List/calendar delete icons are hidden even on hover. Swipe left to reveal one icon; only pressing it deletes. Swipe right, outside click, Esc, or a view change closes it; only one item may be open. Vertical motion and pointer cancellation do not reveal it. Checkbox reordering and horizontal tag scrolling are unchanged. Alt+Delete within an item reveals and focuses the icon; Enter/Space deletes. Read-only mode disables swipe deletion.

**Reordering.** Drag the checkbox area at least 6px; shorter clicks/taps still toggle completion. An item copy follows the pointer with an insertion line and edge autoscroll. Crossing another row's midpoint immediately updates the preview and animates surrounding rows like tabs/dock. The preview stays local until drop applies its final position to the latest objects and autosaves. Completion, body, and IDs survive; synthetic post-drag clicks are blocked.

Cancellation restores order. External structural changes, Esc, pointercancel, capture release, resize, blur, or screen hiding cancel; Esc does not close the panel. Inputs/body retain scrolling and text selection. Alt+Up/Down moves a checkbox-focused item. Dragging, cancellation, and keyboard moves use `useReorderAnimation` at 180ms, omitted under `prefers-reduced-motion`.

**Panel chrome.** The PC title-bar popup/panel toggle changes display mode without replacing the panel; this choice was removed from display settings. Mobile has no toggle and does not autofocus input. Popup/position restoration and topmost settings follow the [shared UI contract](ui-overlays.md#settings-window-layer).

The panel shares the 36px header, DockGrip, maximize/restore, split boundaries, dock, mobile foreground stack, and Esc/Back. Account restoration uses `chrome.tasksOpen` and the `tasks` dock position. Save status sits immediately right of the title, remains visible when narrow layouts collapse the title to an icon, and truncates before the view tabs.

## Assignees

- Clicking the person icon next to the tags or an existing assignee profile opens a searchable multi-select popup. The panel loads public profiles of signed-in users (`/api/member-profiles`) and searches by name or email. Candidates show a profile, name, email, and selection checkmark; items show only profile icons. If no photo is available, the first two characters of the name and an account-specific color are used.
- Each row shows up to three profiles and the number of remaining assignees. Accessible names and tooltips provide assignees' names and emails. On mobile, opening the popup alone does not automatically show the keyboard, and the popup stays within screen boundaries. Arrow keys and Enter select or deselect search results; Esc or an outside click closes the popup. If loading the user list fails, a retry button is provided.
- Assignees can be selected in the list and calendar, and the Gantt edit card uses the same picker. Read-only mode shows only assigned profiles and does not open the picker. Assignees in a new input draft are included in browser recovery, and Enter or multiline paste passes the original item or draft's assignees to new items. After a new task is committed, the draft's assignees are cleared.
- `assignees` is an array of unique lowercase account emails (up to 100 people, 254 characters per email). Display names and photos are not stored, so associations survive profile changes. Existing assignees absent from the user list are retained as email-based icons and can be deselected. An empty array is equivalent to unassigned, and the property is removed when saving Markdown. It is merged independently of title, completion, tags, and dates; conflicts in the same assignee field and stale deletions are rejected.

## Item context menu

- Right-clicking a list or calendar item, a Gantt name or bar, or pressing Shift+F10/the Menu key within an item opens the shared icon menu. It provides Open document, Edit schedule, Toggle completion, and Delete task; the menu's completion check state follows the current object.
- Open document is shown only when a document is linked and a file-open callback is available. Read-only mode provides only Open document and hides date, completion, and deletion controls. Editing dates opens the existing date-range popover in the list or calendar, or the Gantt edit card. Deletion uses the existing deletion path for the same object and its linked document.
- Every menu item shows an icon from the existing icon set and a translated name. The menu opens in a portal and uses its measured size to position itself within the visual viewport and above the mobile dock. Arrow keys and Home/End navigate; Enter/Space executes. Esc, Tab, Back, or an outside press closes it; closing with the keyboard restores focus to the invoking element. An outside press only closes the menu and does not trigger the underlying item. Deletion does not focus another input.

## Internal document links

- Each task is linked to a `.mew/tasks/<태스크 제목>.md` file in the root project, and completed items are placed in `.mew/tasks/Done/<태스크 제목>.md`. Clicking the document icon to the right of the date button in the list or calendar opens the actual Markdown document through App's file-open function. The same file can be opened from the Gantt edit card, and Open document is also available to read-only accounts.
- If the linked file is inside the configured Documents folder, it opens with the Documents scope and a folder-relative path. It reuses the same tab as opening it directly from Docs; files outside the Documents folder open in the root project scope.
- Document icons in the list and calendar align with the vertical center of the first body line and date button. For touch input, they retain a 32px button area while using 2px negative margins above and below to align with the 28px row baseline.
- `path` is the root-relative path calculated by the server from the actual filename. Paths in API input are not trusted as save or deletion targets. Editing the title changes both frontmatter `title` and the filename. If `title` is edited externally, a query with write permission also aligns the filename while preserving the ID, body, and user properties. If only the filename is changed externally, read queries return that path, and queries with write permission or saves realign the name with `title`.
- At the user's request on 2026-10-06, `@파일명` reference autocomplete and the link button were removed from titles. This change allows titles to be used verbatim as document titles; do not reintroduce these features without a separate request. Markdown link strings in existing titles are preserved.

## Tags and filters

- Completed items are hidden by default in the list, calendar, and Gantt views. Enabling the **Show completed items** checkbox in the filter row below the header also shows completed items. This filter is available even without tags and can be used in read-only mode. The selection persists across view changes and resets to hidden when the panel is remounted. It combines with tag filters using AND and also affects per-date calendar counts and the Gantt range. Hidden completed items are not deleted by editing, adding, or reordering, and changing filters alone does not trigger a save.

- For new tasks, existing tasks, calendar events, and Gantt edit cards, a gray `태그` chip appears to the left of the title when there are no tags; clicking it opens a searchable multi-select popup. If tags exist, clicking an existing tag name opens the same popup, with no separate + button. The clicked chip anchors popup positioning and focus restoration after closing; when the last tag is removed, the gray chip takes over. Search existing tags to select or deselect them, and create new names through the + candidate. The popup stays open after selection, and the title is not changed.
- The search field at the top of the popup shows a magnifying glass icon and a translated `태그 검색` placeholder. It is distinguished from the list by the theme's raised background and strong border, is 32px high on desktop and 36px for touch, and uses an accent border when focused. It stays pinned at the top while the list scrolls and indicates search availability on mobile without automatic focus.
- Search matches partial names, and selection uses arrow keys and Enter, clicks, or touch. Esc, Back, an outside click, or focus leaving closes only one popup layer. The popup respects screen boundaries and the visual viewport, and does not automatically focus the search field on mobile. Read-only mode hides add and delete controls.
- Names are normalized to Unicode NFC and lowercase, and allow letters, numbers, underscores, and hyphens. Each name is limited to 64 characters, with up to 100 tags per item; duplicates are not stored. `#` tokens entered or pasted into a title are preserved verbatim in the title rather than extracted as tags. Inline hashtag input was removed following the 2026-10-06 request to separate titles and properties; do not reintroduce it without a separate request.
- Both body and filter chips use 2px of space to the right of the tag name. The body chip's delete button left-aligns a 12px icon and uses a width of 18px on both desktop and touch, giving the name's left edge and the icon's right edge matching outer spacing of 6px each. Vertical touch padding is retained.
- The × to the right of an existing entry in the tag picker is **Delete tag everywhere**. Clicking it removes only that tag from all tasks in the root project, including completed and filtered-out items, and also removes it from the saved tag list, assigned colors, and tags on new items being drafted. The active tag filter is cleared to avoid trapping the user in an empty filter. Other tags, content, date ranges, completion, order, Markdown bodies, and user properties are preserved. New-name candidates shown during search do not have this button, and read-only mode does not offer global deletion. The × on individual chips and unchecking entries in the picker continue to change only the corresponding task.
- The color circle in the tag picker is a button separate from tag selection. Clicking it opens a 16-color (4×4) palette that applies the color to tags with the same name throughout the root project. Changing a color does not change tag selection, and updates chips in the list, calendar, and Gantt views as well as filter chips and circles. The palette adjusts to screen boundaries, marks the selected color with a check, and supports arrow keys, Home/End, Enter/Space, and touch. Esc/Back closes only the palette layer and restores focus to the color button. Read-only mode does not offer color changes.
- Committed tags appear without `#` on the same line between the checkbox and body text. User-assigned colors take priority; names without an assigned color automatically receive an existing fixed color, with contrast adjusted for light and dark themes and chip corners rounded to 9px. On desktop, mobile, and in read-only mode, the chip background is 20px high with 4px margins above and below, centered on the first body line. Chips remain beside the first line even when the text wraps. For touch, the background is not enlarged; the button's vertical padding is included in a 28px click target. The tag area uses up to 45% of the content row width, and the body uses the remaining space. Multiple tags scroll horizontally on the same line on narrow screens. The × removes only that tag. Read-only mode does not offer deletion.
- Select multiple tags using the small filter icon below the header. Items with any selected tag are shown (OR), and the same selection is retained across the list, per-date calendar display and counts, Gantt, and view changes. Colored chips beside the icon show the selection; click a chip to deselect it individually or the × on the right to clear all. The chip area scrolls horizontally on narrow screens, and the filter row is 33px on desktop and 39px for touch.
- The shared `SelectField` multi-select list stays open after selection. Arrow keys, Home/End, and typing to search navigate candidates; Enter/Space toggles selection. Tab, an outside press, Esc, or Back closes only the list. Focus stays on the trigger during selection, and returns to the trigger if the focused chip or Clear all button is removed. A task chip's name adds its tag to the existing filter.
- The tag filter dropdown is 200px wide with 4px padding and 10px corner radii. Items are 28px high on desktop and 32px for touch; selection is indicated by a pale theme-colored background and a checkmark on the right. Active and hovered items are distinguished by a rounded inset background, and the dropdown scrolls internally when it exceeds screen boundaries.
- New items created within a filter receive the selected tags by default, deduplicated against existing tags. The limit of 100 tags per item remains. Editing or moving items does not delete items with other tags.
- `tags` in the server file is the list of names used. Names are retained for autocomplete even after the last item using them is deleted. Names from other root projects are not exposed.

## Transition to a flat list

- At the user's request on 2026-10-05, parent-child structure, adding children, collapse/expand, and automatic parent schedule calculation were removed and replaced with tag categorization. Do not reintroduce hierarchical UI without a separate request.
- Version 1 files are read as flat lists after validating their existing hierarchy and dates, preserving every item's ID, content, completion, and order. Descendant date ranges previously displayed on parents are preserved as those objects' independent dates. The next change saves as version 2 and removes `parentId`. All dates can be edited and moved independently. Previous browser drafts are converted in the same way.

## Date storage and calendar

- Click the date display in the shared `DateCalendar` to enter year, month, and day segments directly. Single mode provides one date field; range mode provides start and end date fields. It shares the existing `DateField` mask, automatic segment navigation, and date validation. Valid values are saved and the displayed month is set to that date; the calendar stays open after direct entry. If the start date is later than the end date or the end date is earlier than the start date, the opposite endpoint is set to the same date. Read-only mode does not allow direct changes. In the Hotview calendar, Esc reverts input to the saved value; Esc outside the input closes the calendar. Task popovers and Gantt cards retain their existing Esc-to-close behavior.

- Swiping the shared `DateCalendar` date grid left by at least 40px with a finger or pen shows the next month; swiping right shows the previous month. Predominantly vertical movement, multiple fingers, and canceled gestures do not change the month. Swiping does not save a date or range and blocks the subsequent date click. Vertical scrolling, pinch zoom, and existing tap and keyboard selection remain available, and month navigation is allowed in read-only mode.

- Each item's `startDate` is its start date, and the existing `date` is its end date. Both use timezone-free `YYYY-MM-DD`; omission or null means no date. Both endpoints are inclusive, and specifying only one displays a single-day event on that date. If the start date becomes later than the end date, the other endpoint is also set to the selected date; the server rejects reversed ranges. Each object owns its dates independently and retains its original dates when moved or when its content is split. New list items start without dates; items created, split, or pasted in the calendar start as single-day events on the selected date.
- The shared `DateField` (used in document properties and elsewhere) always maintains a `0000-00-00` mask in a single text input, with separate year, month, and day segment selection. Only digits in the selected segment are replaced; filling 4 year digits or 2 month/day digits advances to the next segment. Mobile supports a numeric keyboard (`inputMode=numeric`) and native beforeinput.
- Clicking a segment or using Right/Down, Tab, or Enter navigates year → month → day. Left/Up or Shift+Tab selects the previous segment; Home/End selects the year/day. From the day segment, Tab commits and moves to the next element, while Enter/Right/Down commits and moves to the calendar button. Single-digit months and days are padded with a leading 0. Navigation alone does not change the value.
- The actual date is validated and automatically saved when the final two day digits are entered, the day segment is committed, or the input blurs. Incomplete or nonexistent dates retain the input and error while preserving the previously saved date. Backspace/Delete clears the current segment; Backspace in an empty segment clears the previous segment. Selecting all and deleting clears every segment and removes the date on commit. Esc restores the input to the currently saved value. Segment navigation and commits are ignored during IME composition.
- Full-date paste accepts `YYYY-MM-DD`, dot/slash-separated dates, and `YYYYMMDD` with a four-digit year, displaying them with the fixed mask. Digit-only segment paste fills from the current segment. Separators cannot be edited directly, and letter input is not accepted.
- The calendar button or Alt+Down in the input opens the shared custom calendar. It shows the selected date's month or the current month and supports previous/next month, adjacent-month dates, Today/Tomorrow, and Clear date. The selected date is marked with an accent circle and today with a small dot. Accessible names for weekdays, months, and full dates use `Intl` formatting for the selected language.
- The calendar provides `dialog`, `grid`, and `gridcell` semantics, along with accessible names, selected state, and today state for each date. On opening, it focuses the selected date or today button. Arrow keys move by day/week, Home/End to the start/end of the week, PageUp/Down by month, and Shift+PageUp/Down by year. Navigation alone does not save; Enter/Space/click commits.
- After selection, closing, Esc, or Back, focus returns to the calendar button. An outside click or tabbing out closes only the calendar and preserves focus on the next element. `useOverlayDismiss` closes the calendar before the panel. The calendar handles small screens and keyboard changes using a body portal, visual viewport positioning, and internal scrolling. On mobile, text inputs are not automatically focused.
- The calendar uses surface/ink/accent tokens from the existing light and dark themes. The short movement on month changes is omitted when reduced motion is enabled. Task list and Gantt editing use the integrated date-range calendar described below.
- The server validates actual calendar dates and four-digit years (0001–9999). `startDate` and `date` are each merged, conflict-checked, and retried as fields separate from content, completion, and parent. If merging separate date changes produces a reversed range, the entire batch is treated as a conflict. Date save failures also follow the existing draft/save-again path. Invalid text input remains only in that input's editing state.

## List, calendar, and Gantt views

- The List, Calendar, and Gantt tabs in the 36px title bar switch views and edit the same session's objects, completion states, and date ranges. Switching views commits any new task being entered. Tabs are connected through `tablist`, `tab`, and `tabpanel`, with Left/Right and Home/End moving selection and focus. Swiping left on the bottom dock selects the next view; swiping right selects the previous view, wrapping at both ends. They participate in App's current task tab-switch signal, and the panel stays open. Existing lists with only a date are displayed as single-day events without conversion.
- The calendar shows a 6-week monthly grid starting on Sunday at the top and events for the selected date below. Events appear every day from start through end date, including completed events. Items without dates are excluded, and only items matching the selected tags are included in calendar events. It provides per-date status dots and event counts, previous/next month and Today controls, and selected-date and today indicators.
- Arrow keys, Home/End, and PageUp/Down move the selected date and month in the calendar. The lower area allows editing content, completion, start date, and end date, deleting items, and entering new tasks. New tasks, content splits, and multiline pastes start with a single-day range on the selected date, and keyboard focus moves within that date's list.
- The Gantt view's UTC day calculations, tick spacing, SVG grid, 44px rows, 22px bars, gradients, and pointer interactions were taken from the workspace's `gantt-maker/src/lib/date.ts`, `model.ts`, `rollup.ts`, `components/GanttSvg.tsx`, and `App.tsx` and adapted to Mew objects and theme tokens. No separate repository or new package dependency is created.
- The default Gantt date range runs from 5 days before today to 5 days after the last event's end date (at least today). A scrollbar is shown, with no separate range handles. Continuing past an edge using the wheel/Shift+wheel, touch, ruler dragging, or arrow keys in the scroll area adds 14 days at that edge after brief elastic resistance. Reversing direction or stopping input releases the resistance; adding dates on the left preserves the current on-screen date positions. The date range is limited to 0001–9999 and can be navigated in read-only mode. The expanded range remains only in memory for the view's lifetime and is not recorded on the server, in local storage, or in task dates; reopening the view restores the default range. With reduced motion enabled, the resistance movement transition is omitted.
- The Gantt's fixed left list and fixed top ruler scroll with the body. Completed events are green, planned events are blue, and incomplete events past their end date are red.
- In selection mode, dragging a bar moves its date range, and handles at both ends resize it in one-day increments. Dragging empty space with touch scrolls; only bars, handles, the ruler, and drawing areas prevent default touch scrolling. Drawing mode sets a range on an existing row or creates a new task on the final dashed row. Each object retains one range. Holding Ctrl/Cmd temporarily enables drawing mode regardless of the mode selected by the button. Releasing the key restores the button-selected mode; if both keys are held, the temporary mode ends when both are released. Window focus loss or page hiding also clears the temporary mode, and it is not enabled in read-only mode. Existing Ctrl/Cmd+wheel zoom is retained.
- Drag previews exist only on screen; on release, only the latest object's dates are saved. Esc, pointer cancellation, capture loss, blur, resizing, page hiding, loss of write permission, or external changes to the target dates cancel the preview. Other fields, including content and completion, are preserved.
- Clicking or tapping a bar, pressing Enter/Space on it, or selecting the name on the left opens an edit card within screen boundaries, where content, completion, and the date range can be changed and only the schedule dates can be cleared. Right-clicking opens the icon menu; selecting Edit schedule opens the same card. Opening it with the keyboard moves focus to the card's close button without automatically opening the touch keyboard; closing or pressing Esc returns focus to the original bar/name button. The date-range calendar is integrated into the card, and Esc closes the card. Left/Right moves the range by one day, Shift+Left/Right changes the end date, and Alt+Left/Right changes the start date.
- Supports Zoom in, Zoom out, Full range, and Today buttons, Ctrl/Command+wheel, and trackpad pinch. Dragging the ruler horizontally pans, upward zooms out, and downward zooms in. Read-only mode allows only viewing, date navigation, and zooming in all three views.
- Uses labels, months, weekdays, and accessible names in four languages and the existing light and dark themes. The original app's multiple ranges, canceled status, schedule splitting, and standalone JSON/image exports are not added to the Mew task model.

## Saving and concurrent edits

**Source and exclusions.** Canonical tasks are `.md` files in the root project's `.mew/tasks/` and its immediate `Done/` subfolder; other subfolders are excluded. Incomplete tasks stay at the root; completion moves them to `Done/`, and uncompleting returns them. Writable queries/saves also move existing completed documents.

| Document | Treatment |
| --- | --- |
| Ordinary body-only Markdown, unregistered by path or filesystem identifier | Excluded from task queries/saves without changing content; one such file does not block valid tasks |
| Registered task missing frontmatter, unclosed/invalid YAML, or invalid properties | Error; blocks saving |
| `_tasks.md`, `MOC.md`, `_MOC.md`, `README.md`, regardless of case | Excluded from queries, migration, modification, and deletion. Matching task titles receive numbering from `(2)` |
| Other Markdown, including Windows-adjusted `_CON.md` | Normal task property/corruption validation |

YAML `title` and `done` are required; `tags` (array), `assignees` (email array), `startDate`, and `date` (ISO dates) are optional. `title` supplies both task text and document title. Panel edits preserve body, other properties, and comments without generating an H1.

**Editor property preservation.** Hotview body/other-property edits retain YAML block/inline arrays for `tags` and `assignees`. Multiline values are not empty values. Unchanged field values, names, and types keep their YAML/comments; only explicit tag edits or field deletion remove tags. `task-markdown.test.ts` checks repeated body saves and later panel edits preserve tags, assignees, and IDs.

Open task documents send the last saved source as `expectedContent` with autosaves, explicit saves, saves before tab replacement, and saves before moves. `PUT /api/file` performs a 3-way property comparison only for individual task documents in that root's `.mew/tasks`, `.mew/tasks/Done`, and legacy `tasks`; guides and ordinary files are excluded.

- Compared fields: title, description, completion, start/due dates, tags, and assignees. Unchanged editor fields retain current disk additions, modifications, and deletions; directly changed fields save.
- Different changes to the same property return 409 before writing. Tag/assignee YAML arrays, array strings, and empty values compare semantically, as do completion booleans and `"true"`/`"false"`.
- Returned merged source updates the editor buffer, save baseline, and cache while preserving body input received during the request. This prevents later autosaves reviving stale titles/tags. `task-document-save.test.ts` covers server merges; `task-document-save-ui.test.ts` covers tabs, autosave, and response-during-input.

Document-property strings remain compatible: `done: "true"`/`"false"` are completion values. String `tags` means no tags when empty, one tag for a single name, or multiple tags for a YAML/JSON inline array string, with normal name/duplicate/count validation. Unchanged queries/saves do not rewrite this representation. Other completion strings and malformed tag arrays are rejected.

**Identity and metadata.** Creation makes `<태스크 제목>.md`; deletion removes the entire linked file. Queries reflect external property edits, creation, renaming, and deletion. `id` is not written to frontmatter.

Version 5 of `DATA_DIR/task-list-<루트 절대경로 SHA-256>.json` stores:

| Key | Content |
| --- | --- |
| `order` | Saved order |
| `tags` | Used tag names |
| `tagColors` | Name → palette hue |
| `documents` | Internal id/path/device/inode associations |

Content/properties are not duplicated in JSON. Metadata is shared per root, including subproject tabs. Associations preserve IDs through panel title changes and same-filesystem external renames. Documents without metadata use filesystem identifiers; external replacement at the same path keeps the ID. Moves changing both metadata and filesystem identifiers may appear as new items. Corrupt YAML, duplicate IDs, invalid properties, and symlinks are errors, never replacements with an empty list.

**Legacy migration.** Accounts with write permission trigger migration by querying or changing the panel; read-only queries do not.

- Version 1/2 JSON and version 3 `tasks/<ID>.md` become `.mew/tasks/<제목>.md` or `.mew/tasks/Done/<제목>.md` according to completion. Preserve IDs, titles, completion, tags, displayed ranges, order, bodies, and user properties; remove migrated originals.
- Legacy document `id` moves into metadata and is removed on writable queries/saves, preserving body/user properties. Version 4 title-based documents likewise register associations and remove `id`.
- Coexisting version 1/2 JSON and Markdown, or duplicate IDs across locations, cause errors rather than arbitrary overwrite/deletion.
- Legacy `project-tasks-*.json`, personal home todos, and shared memo files are neither read nor changed. Preserve the [record before removal](../history/project-tasks.md).

**Filenames.** Use ordinary titles directly as filenames, retaining spaces/Korean characters. Duplicate, case-equivalent, or Unicode-normalization-equivalent names receive `(2)`, `(3)` suffixes; existing numbers survive deletion/reordering. Invalid filename/control characters become `-`; leading/trailing whitespace and trailing periods are removed. Empty names use `제목 없음`, Windows reserved names get `_`, and names are capped at 200 bytes without splitting Unicode characters. These adjustments never change `title`.

**API and access.**

| Contract | Rule |
| --- | --- |
| `GET /api/task-list?workspace=<현재 루트>` | Returns `{tasks, canEdit, tags, tagColors}` |
| `PATCH /api/task-list` | Accepts `{workspace, changes, tagColorChanges?, deletedTags?}`; returns the same board format |
| `X-Mew-Task-Owner` | URL-encoded login email matching the session |
| Read | Login and permission to view every file in the root; read-only accounts cannot write |
| Write | Permission to edit every file |
| Errors | Account/current-root mismatch: 409; insufficient permission: 403; invalid input: 400; read/save failure: 500 |
| HTTP boundary | Blocks guests and temporary-password accounts |
| Limits | 2,000 items; 8,000 content characters each; IDs: 1–100 letters, digits, underscores, or hyphens |

Empty standalone content is allowed during line splitting but never generated automatically. Duplicate IDs and format errors are rejected. The panel manages title/done/tags/assignees/startDate/date and preserves other properties; the change API rejects new parentId values.

**Change batches.** A change is `{id, before, after, afterId, move?}`:

| Shape | Effect |
| --- | --- |
| `before=null` | Create after `afterId`, or first if the anchor is null |
| `after=null` | Delete |
| Both objects | Change fields |
| Existing object with `move=true` | Move after `afterId` independently of field changes; never recreate it |

Creation, deletion, movement, and content edits share one PATCH. Anchored moves preserve current server content and merge with other-window content/completion edits without removing new objects. For concurrent order changes, the later saved anchor wins. Missing objects/anchors conflict; lost-response retries do not duplicate moves.

The server compares current values with `before`. Different IDs/fields merge; values already equal to `after` succeed. Same-field conflicts, deleting modified objects, and missing insertion positions return 409. Validate the entire batch before writing each Markdown file by temporary-file rename, then save order metadata last. Write failure restores changed files. External processes may see intermediate multi-file states; forced-termination-safe multi-file transactions are not provided. Save failure/corruption never causes an empty-list overwrite.

**Global tag deletion.** `deletedTags` is an array of up to 2,000 unique valid names. Apply deletions to the latest full list, including other-window additions; exclude deleted tags from ordinary field-change checks. Retries of the same deletion succeed. Markdown, metadata, task edits, and color edits save in the same PATCH. Browser drafts retain deletion requests queued after an active save, with existing automatic/explicit retries and full-file edit permissions.

**Tag colors.** Changes use `{tag, before, after}`: `before=null` means no custom color; `after` is a 16-color palette hue. Metadata holds up to 2,000 tags and validates names, palette values, and duplicate changes. Same-tag conflicts return 409; different-tag edits and same-value retries merge. Colors share task PATCH/metadata writes and survive ordinary saves/migration without duplicating Markdown attributes. Existing retries, browser drafts, explicit resaving, and root/account/file permissions apply; other windows receive colors on their next periodic fetch.

**Completion moves.** Preserve IDs, order, body, and user properties; adjust relative body links to the new location. Both folders use collision numbering, reserved-guide protection, and symlink blocking. Create `Done` on first completion save; restore documents if file/metadata saving fails. `server/task-done-folder.test.ts` checks completion, restoration, same-name items, existing-document migration, failure recovery, links, and symlink rejection.

## Client Lifecycle and Errors

**Document types.** `tags` and `assignees` without type annotations use the [editor's default multiselect rules](packages.md) for display/selection. Existing/new documents need no type migration or field registration. Types/display derive from current fields, including after panel saves or field removal.

**Read/save coordination.**

- List reads and saves are serialized and wait for document saves in progress to finish. Reads do not force unsaved body content to be saved, preventing files from being recreated before external deletion is detected. Before panel changes, unsaved documents are saved first as before. Deleted items are also compared by ID and passed to open tabs, while renaming an item with the same ID preserves its tab.
- Before task reads or saves, editor saves in progress are awaited and open drafts are saved. Reads can also move files to match titles, so they receive the same protection as saves. They run serially with document structure changes, deferring autosaves, direct saves, and closing tabs being edited until file moves and body rereads finish, then resuming at the new path. Additional input during requests is preserved, and unchanged titles, descriptions, completion states, dates, tags, and assignees are merged with the latest file. Conflicting server changes to the same property are treated as save conflicts.

**Deletion and renaming.**

- Deleted documents with saved content close their tabs; clear caches, navigation history, title previews, and pending/scheduled autosaves. New input during detection or remaining unsaved content keeps the body/baseline in a read-only error tab.
- If an existing task's save path disappeared through deletion/movement, a request with `expectedContent` returns 409 before writing, preventing recreation. Explicit new-file creation without a baseline remains supported.
- Editor/task title input immediately updates explorer, task, editor, and tab titles. Folder/account switches clear previews; older acknowledgments cannot erase newer input. Until confirmation, opening/saving uses the old path under existing autosave/task-sync sequencing. Documents rename also updates `title`.
- Renaming the same file preserves its editor document identifier, title input instance during collaboration reconnection, body selection, and scroll. Another document gets a new identifier. Task title previews do not add an editor autosave.

**Document save baseline.** Every successful response supplies the new `savedContent`, even without a server merge or when more input has arrived. Preserve that input. The next autosave for this document waits for the preceding response and React state updates, then uses the latest source/baseline. Other documents may save in parallel; failed requests do not trigger consecutive pending autosaves. This avoids mistaking the client's previous title save for an external edit while retaining real same-property 409 conflicts.

**Task-to-tab synchronization.** `task-document-sync` compares confirmed read/save items by ID and passes path/property changes to `useTabs`. Update all split panes, inactive tabs, per-tab history, and the same file opened through Documents and Files. Convert paths using the configured Documents root/current working folder; ignore late responses from other folders.

A successful task save followed by a failed open-document read must not resend task changes. Retain the previous comparison baseline and retry the body update on the next task read. `server/document-title-sync-ui.test.ts` covers all three change paths, split/inactive tabs, body input, direct saves, closing tabs during delayed reads/saves, title swaps, pre-response titles, and title input focus/cursor across collaboration changes.

**Session and browser drafts.** `useTaskList` keeps a per-root, per-account `TaskListSession` in App. Input updates immediately and saves 350 ms after the last input or on an existing item's blur. Panel close/docking remount preserves session and pending saves. Project changes leave prior drafts in their session and block prior requests through the server workspace check. Input received during writes/reads merges back as local changes.

Unsaved changes and latest draft content/tags persist at `mew:task-draft:<이메일>:<루트>:<창 ID>`. sessionStorage retains the window ID so another window for the same account cannot clear the draft. Server saves clear changes; refresh merges remaining drafts into read results. Current-page drafts survive even when storage is full.

**Live updates.** Authenticated `GET /api/task-list/events` SSE batches creation/deletion and file changes in root/docs/task/Done folders every 75 ms and triggers an immediate reread. Panel/account/root lifecycle releases subscriptions; root/permission changes terminate them. If unavailable/disconnected, poll every 3 seconds and read on browser return. Local changes, active saves, or save errors prevent polling from replacing input. Read errors do not block later reads; recovery responses preserve local changes/drafts. This object API is separate from notes' Yjs editing.

**Errors and retries.**

| Result | Behavior |
| --- | --- |
| Network failure, timeout, HTTP 5xx | Retry reads/saves up to twice, after 1 and 3 seconds, without an initial warning; initial reads follow the same path |
| Read error after exhausted retries | Display it; clear it on the next successful response |
| HTTP 4xx: concurrent edits, account/project change, permissions, invalid input | Display immediately; never automatically overwrite real same-field conflicts |
| Invalid JSON/board format | Display immediately, never accept as a list or treat as a transient network failure |

Save retries resend the exact change batch. If exhausted, read the latest list and verify every task change, color, and complete tag deletion before showing failure. Already-applied batches succeed; later input saves separately. If verification fails or changes remain unapplied, retain input, error, and Save Again. Explicit resaving applies only locally changed fields to the latest list; same-field conflicts use the user's confirmed local content. Account changes stop every old-session read/save retry timer.

`src/api/task-list.ts` limits reads/saves to 30 seconds including response-body receipt and preserves HTTP status. Validate even successful responses for item types, duplicate IDs, tags, assignees, ranges, colors, and board structure.

The range picker uses `DateCalendar` from `@mew/ui`; Hotview date properties use its single-date mode.

## Verification

- 2026-10-26 continuous input: In `server/task-document-save-ui.test.ts`, continuous edits to the title, automatic description, and body were reproduced with the first response delayed both before and after the 500 ms debounce. Before the fix, saves failed because the save baseline retained the previous title or two requests started simultaneously. After the fix, 3 UI tests passed, including the existing tag-preservation check. Subsequent requests use the source text from the preceding successful response as their baseline and save the latest input. 6 property-merging/server-conflict-protection tests and targeted oxlint also passed. The full type check failed due to an unrelated nullable argument error in `App.tsx`, and the full document check failed due to missing frontmatter in an unrelated task. The failure to preserve body content during GET in the title synchronization UI was also reproduced with the pre-fix hook. No app build or server deployment was performed.

- 2026-10-26: 37 API, session, document synchronization, and server save regression tests passed. Checks covered read retries without warnings, compliance with retry delays during continuous updates, recovery after repeated failures, result verification after repeated loss of save responses, preservation of additional input, format/HTTP errors, and the 30-second limit. Document title synchronization UI, TypeScript, and targeted oxlint also passed. The existing task panel UI failed a check that did not expect the `Done/` path for completed documents; the same failure was reproduced with the API/session code from before the change. Document description checks passed, and the full link check failed due to 1 deleted-document link in an unrelated task list. No app build or changes to the running instance were performed.

- `packages/ui/src/date-value.test.ts`: direct input format, leap years/nonexistent dates, year boundaries, and timezone-free date arithmetic.
- `server/date-field-ui.test.ts`: year/month/day masks, segment navigation by click or automatically, Tab/Enter/arrow keys, native numeric input, deletion, custom calendar keyboard/touch selection, errors, desktop/mobile themes, 320 px boundaries, Esc/Back, date clearing, translations, and read-only mode.

- `server/task-list.test.ts`: per-root object storage, reloading, merging different fields, conflict atomicity, retries after lost responses, input validation, preservation of corrupted data, and HTTP account/root/permission boundaries.
- `src/utils/task-list-session.test.ts`: preservation of additional input during requests, retries after save failures, merging read responses with local input, retries after tag save failures, warning-free retries for transient read errors and automatic recovery after repeated failures, save verification after repeated response loss, protection of unsaved colors, retry limits, format error/4xx/conflict protection, and cancellation of read/save retries when sessions end.
- `src/api/task-list.test.ts`: preservation of HTTP status for reads/saves, existing authentication-expiration notifications, JSON/board format validation, request headers and change batches, and timeouts while receiving response bodies.
- `src/utils/task-tags.test.ts`: Unicode, prefixes, token boundaries, tag duplication/validation, independent field merging/conflicts, and retries.
- `src/utils/task-list-order.test.ts`: independent date field merging/conflicts/deletion, compatibility with legacy hierarchy utilities, bidirectional reordering, retries, preservation of remote field edits, and moves combined with creation/deletion/content changes.
- `server/task-panel-ui.test.ts`: continuous input on desktop/mobile, object IDs, line splitting, empty-item deletion, multiline pasting, shared completion/body content, input retention after save failures, panel remounting, reopening, maximizing/restoring, and reloading after saves.
- The same UI tests also check immediate hiding on completion, the Show Completed toggle, combined tag filters, read-only filters, and reset on remount.
- The same UI tests check separate tag input, partial search, multiselect, keyboard/touch selection, center alignment of chips with the first body line (desktop/mobile/multiline/read-only), multiple filters (OR) across all three views, individual/complete deselection, adding items with selected tags attached by default, preservation of hidden items, tag reloading, mouse/touch dragging on checkboxes, preservation of completion, updates from other windows, reloading of moved order, and Esc cancellation.
- `server/task-markdown.test.ts`: frontmatter-based saves, title-based filenames/renaming, duplicate titles/special characters, legacy path migration/restoration after failure, external edits/creation/renaming/deletion, preservation of body content/user properties, deletion conflicts, restoration after save failures, and rejection of corrupted files and symlinks.
- The user builds and restarts the app that is actually running.

- `src/utils/task-rollup.test.ts`: overlaps, ranges with empty dates, nesting, undated descendants, ignoring existing parent dates, editing/deletion/promotion, date boundaries, and consistency across calendar/D-day/Gantt.
- `server/task-parent-schedule.test.ts`: preservation of IDs/completion/displayed schedules from the legacy hierarchy, transition to version 2, date editing, preservation of items after parent deletion, and preservation of the list of used tags.
- `src/utils/task-schedule.test.ts`: inclusive range boundaries, single-date compatibility, leap years/0001–9999, date merging/conflicts, moving/resizing, and unions for nested parents.
- `server/task-schedule-ui.test.ts`: actual API saves, date-range reloading, calendar date/keyboard selection, new items by date, Gantt moving/resizing/drawing/cancellation, Esc in edit cards/calendars, mobile touch, 320 px boundaries, translations, and read-only mode.

### Task Row Date Display

List/calendar rows show date status left of Delete. A `startDate` after the browser's local date takes priority over `date`, in gray:

| Time until start | Korean | English |
| --- | --- | --- |
| 1–6 days | `n일 후 시작` | `In nd` |
| 7–29 days | `w주 후 시작` | `In nw` |
| 30 days or more | `m달 후 시작` | `In nmo` |

Weeks use 7 days and months 30 days, rounding down. Labels follow the Korean, English, Chinese, or Japanese UI language. If start is today, past, or absent, use `date`: future `D-n`, today `D-Day`, overdue red `D+n`, or gray `날짜 설정` when absent. Completion does not affect calculation. Day arithmetic is timezone-free; open screens update today every 30 seconds and on focus/visibility changes.

Click, Enter, or Space on status opens schedule editing. List/Gantt embed the 6-week `TaskRangeCalendar` directly, without a separate calendar button/nested popup.

| Range selection | Result |
| --- | --- |
| First click | Sets `startDate`, clears `date` |
| Next click on/after start | Saves end; selecting the same date twice creates a one-day range |
| Click before start | Replaces start and waits for end |
| Click after an end was selected | Starts a new range |
| Clear Dates | Clears both fields |

Each selection updates both fields together, preserving content, completion, and tags. Month/year headings follow locale formatting and accept direct entry. Two date-summary columns underline the next target in theme color. Endpoints are circles connected by a pale theme band across weeks. Today has a theme circular border, contrasting against selection when they overlap. Popovers use `surface-deep`, 12 px corners, and 10 px padding.

Year/month numeric inputs select all on click and commit on Enter/blur. Values outside years 0001–9999 or months 1–12 revert to the previous display; Esc restores input. Changing only the month does not save a date. Arrow keys, Home/End, PageUp/Down, and Shift+PageUp/Down navigate dates/months/years; Enter/Space selects a period. Read-only mode allows calendar navigation only. The body portal repositions on scroll, resize, and visual viewport changes without autofocus. Outside click, Esc, or Back closes it, restoring focus from inside to the status button.

- `src/utils/task-date-label.test.ts`: future-start priority, day/week/month unit transitions and rounding down, translations, and D-day calculations for today, overdue dates, unspecified dates, completion status, leap years, and year boundaries.

### Default List Sort

First opening the list or changing projects restores **1: Tags · Alphabetical; 2: Schedule Priority · Default Order**. Within a tag: `D-Day → 마감 임박(D-n) → 기한 초과(D+n) → 시작 전 → 날짜 미정`.

- Approaching: fewest days remaining; overdue: fewest days overdue; not started: nearest start.
- Future start takes priority over due date. Started items without a due date are unspecified. Completion does not change priority.
- Date, tag, or local-day changes resort items; exact ties keep saved order. Calendar/Gantt order is unchanged.

With all criteria removed, use the previous status order `D-Day → D-n → D+n → 시작 대기 → 날짜 설정` and allow manual reordering within each group, without numeric date comparisons. **Restore Defaults** restores Tags → Schedule Priority.

### Multi-Criteria List Sorting

**Sort List** and its criterion count open the filter-row popover with both defaults. **Add Sort Criterion** adds an unused field; no duplicates, at most 6. Numbered rows show priority; × removes one without reprioritizing others. Compare earlier criteria first, then ties using the next; final ties retain saved order.

| Criterion | Comparison and directions |
| --- | --- |
| Title/tags | UI-language `Intl.Collator`, including natural numbers (`작업 2 → 작업 10`); **Alphabetical/Reverse**. Tags compare complete arrays of sorted names lexicographically, independent of attachment order |
| **Schedule Priority** | Default status/date proximity above; **Default Order/Reverse**. Unspecified dates always last. Tooltip states the status order |
| **Start Status** | Future start: not started; start today/past, or due date without start: in progress; neither date: last. **In Progress First/Not Started First**; no within-group date comparison |
| **Due Date** / **Start Date** | Compare only the named field; **Earliest First/Latest First**, without substituting the other date |

Unspecified tags/dates sort last for their criterion in either direction; equal unspecified values use the next criterion. For example, Start Status · In Progress First → Due Date · Earliest First keeps future-start items below and past deadlines first.

Criteria stay in panel memory across view changes; project changes/remounts restore defaults. Read-only mode and tag/completion filters still allow sorting. Display sort never saves order to session objects, Markdown, or the server, deletes items, or changes calendar/Gantt order.

With any criterion active, disable dragging and Alt+Up/Down manual moves. Checkboxes still handle completion and touch scrolling. Completion, body/tag/date edits, additions, and deletion retain ID-based paths; input Up/Down follows display order.

| Popover layout | Value |
| --- | --- |
| Width / padding | At most 304 px / 6 px |
| Criterion row | 28 px desktop, 32 px touch; 2 px gap |
| Labels | More width for field names; arrow and criterion-specific short direction label |
| Header | Restore Defaults and Close icons |
| Outer list spacing | 8 px horizontal, 4 px vertical; preserve readability/touch targets |

Fields/directions use shared `SelectField` within desktop/touch screen bounds. Esc/Back closes nested lists first. Closing restores trigger focus; add/remove restores a remaining field or Add button. Support four languages and light/dark themes.

Validation: `src/utils/task-sort.test.ts` covers defaults, priorities, directions, tag arrays, independent dates, proximity, start-status combinations, today changes, unspecified values, ties, and original-data preservation. `server/task-sort-ui.test.ts` covers defaults/restoration, criterion changes, duplicate prevention, keyboard/touch, read-only mode, filters, view changes, 320 px bounds, and saved-order preservation.

## Document Navigation Summary

New task documents automatically write `태스크: 제목` to YAML `description`. When a title changes, an existing value matching the automatic default description is updated with it, while user-written descriptions, body content, and other properties are preserved. Existing external documents are not rewritten during reads or synchronization solely because they lack descriptions. When writing detailed body content, make the description more specific according to the [document rules](../README.md); MOC registration is not required.

## Storage Path Migration — 2026-10-29

New task source files are stored in `.mew/tasks/`, and completed items in `.mew/tasks/Done/`. Existing `docs/tasks/`, `docs/tasks/Done/`, and `tasks/` continue to be read and are migrated to the new location during writable synchronization. Filename collision handling, document body content, properties, and incoming links are preserved, and existing identity metadata remains in installation data. The Documents connection path and task source location are independent. Saving, watching, and concurrent-edit protection recognize both new and old paths.
