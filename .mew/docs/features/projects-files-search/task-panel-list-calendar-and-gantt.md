---
id: "mew-projects-tasks"
parent: "mew-projects"
title: "Task Panel, List, Calendar, and Gantt"
status: "changed"
created: "2026-10-03"
updated: "2026-11-04"
files: ["src/components/task-assignees.ts", "src/components/task-assignee-picker.tsx", "src/components/task-assignee-context.tsx", "shared/task-assignees.ts", "src/components/task-panel.tsx", "src/components/task-sort-picker.tsx", "src/utils/task-sort.ts", "src/components/task-swipe-row.tsx", "src/components/task-action-menu.tsx", "src/components/task-date-status.tsx", "src/components/task-panel.css", "src/components/task-text.tsx", "src/components/task-tag-picker.tsx", "server/task-markdown.ts", "src/components/task-tag-filter.tsx", "src/utils/task-tag-color.ts", "shared/task-tags.ts", "src/components/task-range-calendar.tsx", "src/components/task-calendar.tsx", "src/components/task-gantt.tsx", "src/utils/task-schedule.ts", "src/utils/task-timeline.ts", "src/hooks/use-task-list.ts", "src/hooks/use-task-drag.ts", "src/utils/task-list-session.ts", "shared/task-list.ts", "packages/ui/src/select-field.tsx", "packages/ui/src/date-field.tsx", "packages/ui/src/date-field.css", "server/task-list.ts", "server/task-list-routes.ts", "src/App.tsx"]
commits: []
description: "Feature requirements for the Markdown task panel, responsive calendar agenda, list/Gantt views, sorting, tags, assignees, inline document controls, and Run task agent drafts. Links shared storage and lifecycle contracts and dated verification records."
상위파일:
  - "MOC.md"
  - "_projects-files-search.md"
---

Provides both a standalone task panel and [editor DB Gantt](../../../../docs/guides/database.md#switching-views). Tasks read existing Markdown, and the DB uses existing rows and date columns; the two datasets are not automatically migrated or synchronized. Follows the [panel restoration decision](../../decisions/0052-restore-task-panel.md).

## Requirements

### Run task from the editor

- Put the agent panel's brain icon at the editor floating toolbar's right edge as **Run task**, only for editable task documents with agent access. Disable it during loading, permission revalidation, read-only editing, or launch preparation. Exclude guides/ordinary Markdown; completed/legacy tasks follow the same path rules. Resolve the stable task ID before saving, then reread its canonical path afterward to follow title renames/completion moves.
- **Run task** saves pending edits and opens the runtime/agent set picker. Only selection creates a conversation, named from frontmatter title or fallback filename. Preserve that name during automatic labeling and use the task root as cwd.
- After selection, prefill the task reference and UI-language instruction to organize the task document first, then implement it. Support Korean, English, Simplified Chinese, and Japanese. Users edit/send explicitly; panel opening, runtime selection, initialization, and restoration never submit. Store the draft in existing input-draft storage, outside tab metadata. Preparation failure preserves the editor and allows retry; project changes cancel launch. Project/account changes or activating an existing conversation clear pending pickers. See [agent tab creation](../terminals-agents-automation/agent-sets-and-tab-creation.md) and the [implementation record](../../work/task-agent-integration.md).

### Panel and item controls

- Desktop popup mode shares notes' `DockPanel`: drag the title or use title-tab arrows, without another top handle; resize bottom-right across the workspace, including explorer. Focus outside sets overall opacity to 50% without background blur; focus inside restores both. Exclude docked/mobile panels; follow the [shared UI contract](../../development/ui-contracts.md).

- Show a Tasks entry in the dock and shortcut settings, and toggle the task panel with the default `Alt+T`. Open the terminal with `Ctrl+백틱`.
- Display list and calendar item content on one line, truncating with `…` when space is limited. A focused input allows multiline editing of the full content and preserves existing line breaks. English upcoming-start indicators use the `In 2d`, `In 2w`, and `In 2mo` formats.

### Sorting, assignees, and tag controls

- Default list criteria are tags (priority 1), then schedule priority (priority 2). Add up to 6 unique criteria: tags, schedule priority, whether started, due date, start date, title; choose each direction. Number rows by priority and remove with ×. Earlier criteria win, later ones break ties. Clear all for date-status sorting; header reset restores tags → schedule priority. Preserve storage order and ordinary editing; allow read-only/tag/completion filters, but disable manual reordering during custom sorting. Verify priorities, directions, addition/removal, duplicate prevention, unspecified-last values, stable ties, keyboard/touch, 320px, view changes, and project reset.

- Search/multiselect assignees like tags; press again to deselect. List/calendar show profile icons or the first two name characters without a photo; picker/tooltips/accessible names expose names/emails. Gantt uses the same picker. Verify desktop/touch, keyboard, 320px, read-only mode, deselection, failed-lookup retry, draft/refresh recovery, document saves, and concurrent other-field edits.

- Tag-picker × deletes an existing tag across the root, including completed/hidden tasks, and clears its list entry, colors, drafts, and active filters. Chip × still removes only that task's tag. Verify desktop/touch, keyboard, no deletion for new-name candidates, full saves, other-field preservation, other-window additions, active saves, retries, and read-only mode.

- The tag-picker color circle opens a 16-color palette; save root-wide colors by tag name without toggling selection. Retain colors across all views/filters and requery/refresh. Verify desktop/touch, 320px, keyboard, palette-first Esc, focus restoration, read-only mode, failed-save retry, same-tag conflicts, and preservation through task saves.

- Tag search uses a magnifying glass, `태그 검색`, and distinct background/border, pinned above the scrolling list. Preserve search, keyboard/multiselect, popup bounds, and closing focus on desktop/mobile in light/dark themes.

- Open tag search/multiselect from the gray `태그` chip when empty or an existing tag otherwise, without a separate + button. Retain colors, × removal, and read-only indicators. Verify both triggers, empty-chip removal/restoration after first/last selection, desktop/touch, keyboard, read-only mode, placement, and focus restoration.

- Hide completed items by default. Provide a **Show completed items** filter regardless of whether tags exist, and apply the same selection in the list, calendar, Gantt, and read-only mode.

- Task retrieval and saving must continue to work even when completion and tags are stored as strings in document properties. Preserve the body, dates, and custom properties, and reject invalid values.
- The default list sort is tags → schedule priority. Within the same tag, the order is `D-Day → 마감 임박 → 기한 초과 → 시작 전 → 날짜 미정`; approaching-due and overdue items are ordered by fewer days first, and not-yet-started items by nearest start date. Exact ties retain storage order.

### Task files and inline editing

- Write to-dos as ordinary text in a task panel independent of notes.
- Store incomplete tasks at `.mew/tasks/<태스크 제목>.md`, completed at `.mew/tasks/Done/<태스크 제목>.md`; uncompletion moves back. Writable retrieval/saves migrate existing documents too. Frontmatter `title` supplies the document title; completion/tags/dates remain properties. Keep IDs in separate metadata, without frontmatter `id`. Creation/deletion affects linked files; file property changes update the open panel. Use tags/dates without hierarchy.
- Ctrl/Cmd+N·T and Alt+N invoke the new-item action in the selected task panel. In the list and calendar, move to the last input while preserving existing drafts; in Gantt, add a new item like the existing + button. Do not create items in read-only mode, while loading, or when the item limit is reached.
- The final add row displays only a horizontally centered + with no text. Start typing immediately on click or keyboard focus, and press Enter to continue with the next item.
- The document icon between the assignee control and task text opens linked Markdown in list and calendar rows; dates remain rightmost. Keyboard focus follows assignee → document → text → date for interactive controls. Gantt edit cards and read-only mode also allow opening. Title edits change `title` and filename, preserving body/custom properties. Editor/task title input updates explorer/task/tab/split-editor labels before saving. After save/requery, reconcile paths while preserving title focus/cursor, body selection/scroll, and new input. Explorer renames also update open documents. Verify immediate labels and editing-state preservation with delayed saves in collaborative browsers.
- Provide Open Document, Edit Dates, Toggle Completion, and Delete with icons in item context menus across all views. Respect keyboard opening, menu navigation, closing, and read-only boundaries.
- Existing content supports inline editing, splitting lines, pasting multiple lines, and deleting empty lines with Backspace.
### Dates, calendar, and Gantt

- Save each task's start/completion date range. Status left of Delete shows future starts in gray `n일 후 시작`, `w주 후 시작`, or `m달 후 시작`; started schedules use completion-date `D-n`, `D-Day`, or red `D+n`. Clicking opens the integrated range-calendar popover: first click sets start; next on/after start sets end; the same date twice gives one day. An earlier date replaces start and waits for end.
- Cycle through views using the List, Calendar, and Gantt tabs in the title bar or left/right swipes on the bottom dock, editing the same task data.
- The calendar shows monthly date selection and an agenda containing schedules whose date ranges include the selected date, plus an input for new schedules. When the task panel is wider than it is tall and at least 640px wide, place the agenda to the right of the month, with independent vertical scrolling for each column. Otherwise, keep the agenda below the month. Reflow on panel resizing without resetting date selection or task edits; use panel dimensions rather than viewport orientation. See the [layout implementation and verification record](../../work/task-calendar-layout.md).
- Gantt has a scrollbar, without edge handles. Default range: 5 days before today through 5 days after the later of today and the last schedule's end date. Continued horizontal input at an edge extends 14 days in that direction after gentle resistance. Keep extensions unsaved and reset on view reopening.
- Holding Ctrl/Cmd temporarily enables Gantt pencil/drawing mode; release restores the previous selection mode while retaining button-selected pencil mode. Clear temporary mode on blur/hiding; preserve read-only behavior and Ctrl/Cmd+wheel zoom. Verify individual/both modifiers, release, temporary drawing saves, manual-pencil restoration, blur, and read-only mode.
- Gantt reuses the scales, bars, colors, date-range moving/resizing, drawing, and zoom controls from `liiiiv/gantt-maker`.
- Click the year or month in the list and Gantt date-range calendars to edit it with the keyboard.
- The shared date picker calendar switches months with horizontal touch swipes while retaining the selected value. Vertical scrolling and date tapping remain supported.
- Use the same integrated calendar to select date ranges in the list and Gantt, and highlight today's date with a theme-colored circular border around its number. Provide consistent controls and display on desktop/mobile and in light/dark themes.
### Completion, persistence, and shared tags

- Use a calendar icon in the panel header and desktop/mobile docks.
- Checkboxes set completion; allow per-item deletion. List/calendar hide default delete icons: swipe left, then press the revealed right icon. Right swipe, outside click, or Esc closes it; Alt+Delete opens it. Deletion never autofocuses remaining/draft inputs.
- Drag items by their checkboxes to reorder and save them. Short clicks and taps continue to toggle completion, and moving items does not change their content, completion, or IDs.
- Provide access from desktop/mobile docks, docking movement/resizing, expansion, bringing to front, closing, and restoration of per-project layouts.
- Autosave per root; preserve input through failures/conflicts. Retry transient network/server errors up to twice without warnings; persistent failures/conflicts allow review and Save Again.

- Put tag search/multiselect and name creation/deletion left of the title. Keep colored chips without `#`, name-based automatic colors, and 9px corners; title `@` and `#` stay text.
- Share tags across root-project inputs and all three views. Filter by any selected tag using the small icon/colored chips; allow individual/clear-all deselection. Deleting tags preserves content, schedules, and completion.
- Preserve the IDs, content, completion, and displayed date ranges of previous parent and child items as independent objects.

### Detailed contracts

- [Input, lifecycle, storage, API, and permissions](../../development/task-list.md) · [Usage](../../../../docs/guides/projects.md#tasks)

## Implementation details

### Current implementation entry points

- `TaskSortPicker` uses shared `SelectField`; `sortTasks` applies criteria in addition order to tag arrays, titles using numeric comparison, schedule proximity/status, start status, and separate due/start dates. Give fields more room, show criterion-specific direction labels/arrows, and reduce row/outer spacing. Sort display only; ties retain storage order. View switches keep criteria; projects/remounts restore tags → schedule priority. See [List sorting with multiple criteria](../../development/task-list.md#multi-criteria-list-sorting).

- `TaskAssigneeProvider` loads signed-in users' public profiles; `TaskText` uses `TaskAssigneePicker` with the tag-search format. Show up to 3 profiles plus a remainder count. Optional Markdown `assignees` participates in change merging, validation, retries, and drafts; retain references to deleted profiles. See [Assignees](../../development/task-list.md#assignees).

- Align mobile list/calendar document icons with the first body line/date; retain 32px touch area and change top/bottom row spacing by 2px each.

- Retry transient saves after 1 and 3 seconds with the same batch. Preserve later input through lost responses/retries; exhausted retries or 4xx/conflicts show an error and explicit Save Again.

- Keep Show Completed in panel state, combined with tag filters across views. Editing/reordering visible tasks preserves hidden completed tasks; remount restores hidden-by-default ([filter contract](../../development/task-list.md#tags-and-filters)).

### Dated implementation records

These records retain prior implementations, including superseded behavior. Current shared rules belong to the linked contracts; explicit historical notices below remain in force.

- 2026-10-06 Future start dates are displayed in days, weeks, or months depending on the remaining time. Unit transitions, calculation rules, and translations follow [Task row date display](../../development/task-list.md#task-row-date-display).

- 2026-10-06 Added context menus with icons to the list, calendar, and Gantt. Connected document opening, existing schedule editing, completion toggling, and deletion; read-only mode provides only document opening. Supports Shift+F10/Menu key, arrow-key navigation, closing and focus restoration, and placement above the mobile dock. Verified behavior, icons, permissions, keyboard controls, and menu boundaries in all three views in `server/task-menu-ui.test.ts`.

- 2026-10-06 Applied swipe-to-delete to list and calendar items. Removed default and hover delete indicators; swiping left reveals a single delete icon that must be explicitly pressed to delete. Provides vertical movement, cancellation, read-only protection, and keyboard opening. Verified desktop/mobile opening/closing, opening only one item, vertical movement/cancellation, read-only mode, keyboard controls, and explicit deletion in `server/task-swipe-ui.test.ts`.

- 2026-10-06 Moved the Open Document icon in list and calendar items to the right of the date display. Keyboard navigation also follows date → document → delete.

- 2026-10-06 Fixed save failures that occurred after editing document properties. Markdown retrieval interprets string completion values and empty-tag, single-tag, and inline-array strings as object properties. Retained API input validation and protection for corrupted files.
- 2026-10-06 Converted file opening from the document icon to use paths relative to the configured Documents folder. Opening the same file from Docs and the task panel reuses the existing document tab. Verified custom document folders, tab reuse in both opening orders, and Documents read/write scopes with 5 checks in `editor-files.test.ts` and `unified-editor-ui.test.ts`. Type checks, targeted lint, and document link/boundary checks also passed.

- 2026-10-06 Removed range handles at the user's request and restored the scrollbar and 5-day buffer after the end date. Wheel/Shift+wheel, touch, scale dragging, and arrow keys in the scroll area extend the range by 14 days after resistance at an edge. Preserve the current date position when extending left, and allow navigation in read-only mode. Keep extension state only in memory and skip the resistance animation when reduced motion is enabled. Do not reintroduce range handles without a separate request.

- 2026-10-06 Standardized outer spacing to the left of tag names and right of × icons in body tag chips to the shorter value of 6px on both desktop and mobile. Retain the 2px gap between names and × and the chip height.

- 2026-10-06 Changed the storage location to `.mew/tasks` and filenames to task titles. Match filenames to title edits in the panel/document while retaining internal IDs, bodies, and properties, and move frontmatter `id` to separate linking metadata. Automatically migrate old `tasks/<ID>.md` files when retrieved/saved with write permission. Supports numbering duplicate titles, correcting invalid filename characters, swapping filenames, and recovery on failure, following the [storage contract](../../development/task-list.md#saving-and-concurrent-edits).

- 2026-10-06 Corrected the handle position to the center of the actual task-row area. With 3 items, it is centered on the second row; with 4 items, it is between the second and third rows. Exclude the add row from the calculation. Update the position for item counts, filters, and vertical scrolling.

- 2026-10-06 Moved Gantt display-range handles from the date header to both ends of the first task row.

- 2026-10-06 Moved undated items to the last status group in the list. Undated items added with Enter no longer move above scheduled items, and items in the same group retain storage order.

- 2026-10-06 Switched to Markdown-based storage. Migrate existing JSON on retrieval/modification with write permission while preserving IDs, order, and properties, leaving only order and the tag list in version 3. Reflect external edits/deletions/renames through file-watching SSE and periodic queries. Provide a searchable multiple-tag input to the left of the title and an Open Document icon. Inline `@` references and `#` tag extraction were removed at the user's request and must not be reintroduced without a separate request.
- The inline-reference and hashtag implementation/verification below is history from before the change; the current contract follows the [Markdown storage contract](../../development/task-list.md).

- 2026-10-05 Implemented the default Gantt date range, hidden scrollbar, and display-range handles at both ends. Navigation is independent of schedule editing and supports read-only mode, keyboard adjustment, and cancellation.

- 2026-10-05 Moved tags between the checkbox and body. Tags appear first in the shared input for list, calendar, and Gantt editing; limit the tag area to 50% and use the remaining space for the body.

- 2026-10-05 Reduced spacing between names and × in body/filter tag chips to 2px. Retain the existing click/touch area of the body delete button.

- Connected `TaskDocumentProvider` and `TaskText` to retrieve internal file candidates on demand and save Markdown links in existing content. Link buttons reuse App's file-opening behavior. Detailed path and input contracts follow the [task storage contract](../../development/task-list.md#internal-document-links).

- 2026-10-05 Set the background height of tags beside content to 20px on desktop, mobile, and in read-only mode, and aligned them with the center of the first body line. Removed the rule that expanded chips to 28px for mobile delete buttons, and retained the interaction area with transparent touch padding above and below. Display them beside the first line even for multiline bodies.

- 2026-10-05 Reduced tag-filter dropdown row heights from 32→28px on desktop and 44→32px for touch, and adjusted the width from 220→200px. Applied 10px corners, 4px padding, a light shadow, and rounded selected/active backgrounds for each item.

- 2026-10-05 Refined the large single-tag picker into a small filter icon, selection count, colored chips, and result count. Added multiple selection to the shared `SelectField` for consecutive selections and keyboard toggling in the open list, and connected OR filtering across the three views, individual/global deselection, and selected tags as defaults for new items.

- 2026-10-05 Moved the saving status directly to the right of the task title in the title bar. Keep the title and status grouped on the left, and view tabs and close control grouped on the right.

- 2026-10-05 Removed `#` from tag chips and applied automatic colors by name, theme-specific contrast, and 9px corners. Size the content input to its text length to place tags immediately to its right on the same line, and scroll the tag area horizontally on narrow screens.

- Changed the shared calendar's date display to segmented year, month, and day inputs. The same `DateField` handles direct editing of single dates and both ends of a date range, automatic segment navigation, preservation of invalid dates, and read-only mode. Keep the calendar open during direct input.

- 2026-10-05 Removed the parent-child UI at the user's request and replaced it with tag chips, prefix autocomplete, and shared filters. Reuse `TaskText` in the list, calendar, and Gantt edit cards, and convert version 1 to flat version 2. Do not reintroduce the hierarchy UI without a separate user request.
- The hierarchy, collapsing, and automatic parent date-range implementations below from 2026-10-03~04 are history from before their removal. Current behavior follows the [storage contract](../../development/task-list.md).

- Handle horizontal touch and pen swipes on the shared `DateCalendar` date grid as month navigation. Vertical scrolling and cancellation do not change the month, and date clicks after a swipe are blocked.

- 2026-10-04 Updated date-range selection conditions so that selecting the same date twice confirms that date as both the start and end date.

- 2026-10-04 Date calendar polish: refined the month heading, start/end columns, next selection target, circular endpoints, and continuous range band. Unified popover backgrounds, spacing, and corners in the list and Gantt while retaining the circular highlight for today, date input, read-only behavior, and existing selection method.

- 2026-10-04 Connected collapse/expand buttons before checkboxes using shared `TaskDisclosure` and `hiddenTaskIds`. Preserve collapsed state across view switches while the panel remains open, and allow read-only users to operate them. Continue including hidden descendants in saving, parent date-range calculations, and subtree movement, and collapse Gantt name/bar rows together.

- 2026-10-04 Automatically calculated parent date ranges with `taskRollups` and applied them consistently to list status, sorting, calendar, and Gantt. Ignore a parent's own stored dates; if no descendants have dates, it has no dates. Block date selection/deletion and Gantt movement/resizing/drawing for parent ranges, and have the server reject direct date changes as well. Derived dates are not stored separately, so child edits/deletions and hierarchy changes are reflected immediately.

- 2026-10-04 Replaced the two calendar buttons and date inputs in list/Gantt popovers with `TaskRangeCalendar`. Clear the end date when selecting a start date and update both dates together. After selecting an end date, the next click starts a new range selection. Years (0001–9999) and months (1–12) support clicking, direct input, confirmation with Enter/blur, and restoration with Esc; read-only mode allows navigation only.

- 2026-10-03 Added start dates and three views. Retain the existing `date` as the end date and save/merge `startDate` as a separate field. Display dates with only one endpoint as one-day schedules.
- Display view tabs in the 36px title bar and navigate with arrow keys and Home/End. Connected App's current-panel tab-switch signal so dock swipes cycle through previous/next views while keeping the panel open.
- Display items whose date ranges include the selected calendar date, along with completed items, and create new schedules for the selected date.
- Imported date calculations, scales, SVG drawing, status colors, and nested unions from the `gantt-maker` source. Connected date-range movement/resizing, drawing on empty rows, edit cards, touch scrolling, keyboard controls, and zoom to existing autosave.

- 2026-10-03 Implemented a new standalone task panel at the user's request. Preserve but do not use the storage files for [previous hierarchical tasks](../../history/project-tasks.md) and personal-home to-dos.
- Connected the shared `DateField` text input and custom calendar to the object's `date`. Only valid dates are saved, and dates follow the same independent field merging, conflict, draft, and retry behavior.
- Child objects are distinguished by `parentId`, and the server validates the hierarchy in preorder. Existing flat lists are read as is. Enter/paste creates siblings at the same level.
- Connected TaskPanel's per-line input and object API to App-owned sessions. The latest draft and unsaved changes are retained per account and root.
- Registered `tasks` in the dock, DockWorkspace, mobile stack, and account UI ledger.
- The server atomically saves changes per object/field, merges changes to different fields, and reports conflicts with 409.
- Mouse and touch Pointer Events on checkboxes handle move previews, insertion positions, edge auto-scrolling, and Esc/cancellation. The displayed order changes immediately during dragging and follows the shared 180ms reorder animation used by tabs and the dock, as well as reduced motion settings. Changes are saved only on drop; cancellation restores the original order. For keyboard movement, focus a checkbox and press Alt+Up/Down.
- Removed the checklist toggle button previously added to notes to match the user's intent. Existing note editing and collaborative editing are retained.

## Verification

- 2026-10-23 panel restoration: Passed 55 unit tests for docking, mobile dock, foreground stack, presets, task sessions, and DB display settings, plus 4 browser checks for the actual App, standalone task panel, task creation shortcut, and DB views. Verified Alt+T to open tasks/Alt+F to open features on desktop and mobile, item creation, autosave, closing, reopening, restoration after refresh, and existing DB Gantt behavior. Fixed a fixture that conflicted with the server data boundary by separating the standalone panel test's data folder and workspace into sibling paths. Ran type, targeted lint, documentation, and UI static checks; lint retained only existing warnings. No app build, deployment, or server restart was performed.

- 2026-10-07 sort UI and date criteria breakdown: Unit tests verified default tag-to-schedule priority, date proximity within schedule status, whether items have started, independent due/start dates, reverse order, unspecified dates, and changes to today. Passed desktop/mobile browser regressions for sorting, the task panel, calendar/Gantt, right-click, and swipe, and verified manual movement after clearing all criteria and restoring defaults. Reviewed desktop dark and 320px mobile light screens and passed frontend type, targeted lint, description, documentation boundary, and diff whitespace checks. The full type check failed due to two type errors in `packages/editor/src/editor/file-link.ts` outside the task scope. Design detection retained only one existing swipe `padding-right` animation warning. No build or server restart was performed.

- 2026-10-07 list multi-sort: Passed 15 unit tests for sorting, default date order, saved order, and shared translations, plus 3 browser regressions for sorting, the task panel, and calendar/Gantt. Verified adding/changing/removing criteria, priority, direction, duplicate prevention, keyboard/touch, read-only behavior, filter combinations, view switching, project initialization, and saved order preservation in desktop dark and 320px mobile light modes. Type, documentation boundary, description, and diff whitespace checks also passed; full lint reported only existing warnings outside the changes. No build or server restart was performed.

- 2026-10-06 document icon alignment: Passed 2 task panel and schedule browser regressions and verified alignment with the first line of body text and dates on desktop dark and 320px mobile light screens. Documentation link and diff whitespace checks also passed. UI detector reported 1 existing `padding-right` animation warning outside the changes. No build or restart was performed.

- 2026-10-06 automatic save error recovery: Passed 14 session, object API, Markdown save, and desktop/mobile browser tests. Verified autosave without warnings for transient failures, preservation of additional input during retries and after lost responses, up to two retries, explicit Save Again for persistent failures, conflict/4xx protection, and cancellation on session end. Type, targeted lint, documentation boundary, and workspace link checks also passed. No build or restart was performed.

- 2026-10-06: Passed 3 task panel, schedule, and right-click UI checks and 7 order/translation unit tests. Verified immediate hiding on completion, shared behavior across three views and calendar counts, tag combinations, hidden item preservation, read-only filtering, and reset on remount on desktop and mobile. Type, targeted lint, and documentation boundary/link checks also passed.

- Verification criteria: Initially hide completed items, hide immediately on completion, show again and restore to incomplete, combine with tags, share across three views, support read-only mode, preserve hidden items in storage, and reset on remount.

- 2026-10-06 waiting-to-start wording: Passed 12 tests related to date display, schedules, duration aggregation, and shared translations, along with type, changed-code lint, documentation boundary, and workspace link checks. No build or restart was performed.
- Verification criteria: Check unit switching and rounding down at 1, 6, 7, 13, 14, 29, 30, 59, and 60 days until the start date, leap years and year boundaries, display in supported languages, and switching to D-day on the start date.

- 2026-10-06 range scrolling changes: Passed desktop/320px mobile browser regressions in `server/task-schedule-ui.test.ts`. Verified default dates, handle removal, scrollbar display properties, initial resistance, 14-day expansion in both directions, left-side position preservation, expansion with actual touch input, read-only arrow key behavior, reset on reentering the view, no save requests, and existing schedule editing. Type, targeted lint, and documentation boundary checks passed; the workspace map check failed due to a missing `docs/하이.md` link outside the task scope.

- 2026-10-06 title-based filenames, migration to `.mew/tasks`, and removal of frontmatter `id`: Passed 16 unit/API and session tests and 2 desktop/mobile browser tests. Verified internal ID linking, external renaming/replacement saves, restoration after migration failure, and preservation of body content/user properties. Type, lint, and documentation boundary/map checks also passed.

- 2026-10-06: Passed 16 unit/API checks for Markdown saves, migration, restoration after conflicts/failures, and sessions/tags/sorting, plus 2 desktop/mobile list, calendar, and Gantt browser regressions. Verified immediate reflection of external edits, title/body/user property preservation, file opening/deletion, search, multiple tag selection, read-only behavior, and 320px screen boundaries. Full type, changed-code lint, UI detector, and documentation boundary/link checks also passed. No build or server restart was performed.

- 2026-10-05: Passed 4 tests in `task-schedule-ui.test.ts` and `task-schedule.test.ts`. Verified the default date range, dragging both ends, keyboard adjustments, Esc restoration, read-only behavior, no schedule saves, and existing desktop/mobile interactions. Type, targeted lint, and documentation boundary/link checks also passed.

- 2026-10-05 tag position changes: Passed 2 task panel and calendar/Gantt browser regressions. Verified tag placement before body text, first-line alignment, multiline body text, read-only behavior, and deletion/filtering/autocomplete in desktop dark and 320px mobile light modes. Full type, targeted lint, and documentation link checks also passed.

- 2026-10-05 tag name/× spacing adjustment: Passed 1 task panel desktop/mobile browser regression and documentation link checks. Verified reduced spacing and existing deletion, filtering, and touch targets on desktop dark and 320px mobile light screens.

- 2026-10-05 internal document links: Passed a total of 4 task panel and calendar/Gantt browser regressions and link conversion unit tests. Verified suggestion boundaries, arrow keys, Enter/Tab, touch, Esc close priority, saving/reopening, opening in read-only mode, and Gantt portal selection in desktop dark and 320px mobile light modes. Checks for paths containing spaces, parentheses, brackets, and URL delimiters, exclusion of external/malformed URLs, full types, changed-code lint, and documentation links/boundaries also passed.

- 2026-10-05 tag height and alignment: Passed 2 task panel and calendar/Gantt browser regressions. Reviewed desktop dark and 320px mobile light screens and checked that chip centers were within 1px of the center of the first body text line on desktop/mobile, with multiline text, and in read-only mode. Also verified deletion by actually tapping the transparent touch area above the background. Passed full type, targeted lint, and documentation link/boundary checks.

- 2026-10-05 dropdown polish: Passed 2 task panel and theme settings browser regressions, full type, targeted lint, and documentation link/boundary checks. Directly verified reduced row heights and width, rounded selection backgrounds, and popup boundaries in desktop dark and 320px mobile light modes.

- 2026-10-05 multi-tag filter: Passed 3 task, calendar/Gantt, and theme settings browser regressions. Verified OR results, duplicate-free display, consecutive selections, Enter/Space toggling, Esc close priority, individual/clear-all deselection, focus after clearing, selected tags for new items, hidden item preservation, filter row/popup boundaries, and selected chip contrast of at least 4.5:1 in desktop dark and 320px mobile light modes. Passed full type, targeted lint, and documentation link/boundary checks.

- 2026-10-05 after repositioning the saving status, passed 1 task panel browser regression, type, targeted lint, and documentation link checks.

- 2026-10-05 tag chip placement and color fixes: 2 task, calendar, and Gantt browser regressions verified removal of `#`, placement on the same line immediately to the right of the text, automatic color variety, 9px corners, text contrast of at least 4.5:1 in desktop dark and 320px mobile light modes, autocomplete screen boundaries, and saving/reopening. Passed type, targeted lint, and documentation link checks.

- 2026-10-05 transition to tags and a flat list: 26 related checks verified preservation of existing hierarchy IDs/completion/display periods, tag saves, field merging/conflicts, retries, Space/Enter confirmation, prefix suggestions, keyboard/touch selection, duplicate prevention, draft chip deletion, filtering across three views, hidden item preservation, Gantt editing, reload, and read-only behavior. Reviewed screen layouts and popup boundaries in desktop dark and 320px mobile light modes, and passed full type, changed-code lint, and workspace documentation link/boundary checks. No build or restart was performed.

- 2026-10-05: `server/date-calendar-ui.test.ts` and `server/frontmatter-ui.test.ts` verified direct segment input, automatic navigation, keeping a single popup open, correction of reversed date ranges, preservation of nonexistent dates, deletion, and read-only mode on PC and mobile. Existing `server/date-field-ui.test.ts` and targeted lint also passed. The full type check failed due to an unused variable error in `server/task-schedule-ui.test.ts` outside this work's scope.

- 2026-10-05: `server/frontmatter-ui.test.ts` passed checks using actual mobile touch for left/right month navigation, preserving the selected value, vertical gestures, cancellation, and subsequent date taps, along with PC regression checks. Lint for the changed calendar also passed. The full type check failed due to task Gantt and tag code errors outside this work's scope.

- 2026-10-04 same-date selection: Verified that clicking month 10, day 16, then pressing Enter on the same date saves the start and end dates together and highlights a single date. Passed 1 browser regression covering reselection of an earlier date, a new selection after confirming a range, and existing desktop/mobile, Gantt, and read-only behavior, plus type, targeted lint, and documentation link checks.

- 2026-10-04 removed automatic input focus after deletion. Passed 2 browser regressions, including verification that remaining items and the draft input do not receive focus after consecutive deletions using mobile touch, plus type and targeted lint checks.

- 2026-10-04 calendar polish: Verified connected date ranges, the today circle, date input/selection, read-only behavior, and popover boundaries in desktop dark and 320px mobile light modes. Checked selected-date text contrast of at least 4.5:1 and circular proportions, and passed 2 related browser regressions, type, targeted lint, design detection, and documentation link checks.

- 2026-10-04 collapse/expand: Verified placement to the left of the checkbox, Enter/touch, shared behavior across three views, preservation of nested collapse state, read-only interaction, moving collapsed subtrees, and automatic expansion/focus when adding children with 2 browser regressions and 2 unit tests. Passed type, targeted lint, and design detection checks.

- 2026-10-04 automatic parent schedule calculation: Verified overlap and inclusion of empty dates, nesting, unspecified dates, previous own dates, modification/deletion/promotion, year boundaries, server date rejection, list/Gantt read-only behavior and content editing, mobile, and save/merge regressions. Passed targeted lint, design detection, and documentation link checks. The full type check failed due to missing `FeatureSpecification` and 3 symbol-to-string conversion errors in `feature-development.tsx` outside the task scope.

- 2026-10-04 unified date-range calendar: Verified day 17→day 9→day 19, reselection of the same date, year/month editing and invalid month restoration, keyboard selection, mobile touch, saving/reloading, and read-only behavior with 2 browser regressions. Type, lint (existing warnings only), and documentation link/boundary checks also passed.

- 2026-10-04: Three UI checks verified the three view tabs in the title bar and arrow key/Home navigation; switching in both directions, wrapping at the ends, and panel retention using actual touch input on the bottom dock; and regressions for existing task input, saving, Gantt editing, and dock gestures. Type, targeted lint, and workspace documentation link checks also passed.

- 2026-10-04 at the user's request, fixed the start and end dates to the left of + on the same line as the content on both desktop and mobile. Removed placement on the next line in narrow panels and allowed horizontal scrolling. Passed two UI checks, including existing task UI regressions and checks for same-line placement and left-to-right order of dates/content/+ at 320px.

- 2026-10-03 added list, calendar, Gantt, and start dates: Passed all 19 related checks, including range boundaries, existing single dates, date field merging/conflicts, nested unions, actual API saves/reloads, calendar keyboard input/per-date input/paste, Gantt movement/resizing/drawing/cancellation/editing, scale movement/zoom, mobile touch, 320px date placement, read-only behavior, translations, and existing input/drag regressions. Full type, changed-code lint, design detection, and documentation link checks also passed. Follow-up UI checks verified keyboard focus entry/restoration for edit cards and text contrast of at least 4.5:1 for light/dark selected dates and the today badge. All three issues identified in the screen review were resolved. The documentation boundary check failed due to existing unregistered documents in todo/docs outside the task scope. No build or restart was performed.

- 2026-10-03 segmented date input: Passed 2 UI checks covering a single 0000-00-00 mask, desktop clicks/mobile taps, segment navigation on digit completion and with Tab/Enter/arrow keys, single-digit month/day correction, native numeric input, clearing all input, the existing calendar, and actual task saves/reloads, plus type and targeted lint checks.

- 2026-10-03 date placement adjustment: Displays 104px and 11px date fields on the same line to the left of + on both desktop and mobile. Passed existing task input, child item, calendar, and save UI regressions, plus type, targeted lint, and documentation link checks.

- 2026-10-03 added dates: Passed 15 checks covering text date formats, leap year validation, date field merging/conflicts/deletion, retries after save failures, custom calendar keyboard/touch/translation/closing behavior, desktop/mobile themes, 320px boundaries, actual task saves/reloads, and App entry. Type, changed-code lint, and documentation link checks also passed. No build or restart was performed.

- 2026-10-03 added child items: Passed 9 checks covering object saves/hierarchy validation, subtree movement/retries, promotion on deletion, and sessions, plus desktop/mobile checks for + input, sibling creation, and hierarchy reload. Type, changed-code lint, and documentation link checks also passed.

- 2026-10-03 real-time reordering: Passed 10 related checks, including updating the displayed order before drop on desktop and touch, the shared 180ms animation, preventing saves before drop, Esc restoration, and moving child blocks together.
- 2026-10-03 added dragging: Passed 8 checks covering reordering, concurrent edits, server saves, consecutive reordering while saving, desktop/touch dragging, completion state preservation, reload, Esc/touch cancellation, and keyboard movement. Type, changed-code lint, and documentation link checks also passed.

- 2026-10-03: Passed 27 checks for object saves/API, sessions, desktop/mobile tasks, actual App entry/Esc/reopening, dock/layout, and existing note regressions. Full type and documentation link checks also passed. Changed-code lint reported no errors and 2 existing mobile-dock dependency warnings. The documentation boundary check failed due to existing unregistered documents in todo/docs outside the task scope.

- Verification criteria: Right-click menus in three views, per-item icons, document/date/completion/deletion actions, keyboard interaction, screen/dock boundaries, and read-only menus.
- Pending user verification: In the actual app, the feel of separate tag input, search/multiple selection, bidirectional Markdown updates, and filtering across three views; task dock entry; start/end date ranges; per-date calendar schedules and Gantt movement/resizing; and restoration of per-project lists and docking layouts.
- Save/API, session, and desktop/mobile UI verification files and criteria follow the detailed contract.

- 2026-10-04 added date status display and a schedule popover. Unspecified dates are displayed as `날짜 설정`; dates are set or deleted in the shared DateField and saved automatically.
- Verification criteria: Check date → document order in the list and calendar; deletion display after swiping, explicit deletion, closing, keyboard opening, and read-only document opening; displays for future start dates, today's start dates, and before/after completion dates; editing both dates and calendar selection in the popover; Esc close priority for the nested calendar; and desktop/mobile screen boundaries.

- 2026-10-04 added default sorting by list status. Buttons without dates display `날짜 설정`, and the list is reordered when dates are edited or today changes. Calendar and Gantt order is retained.
- Verification criteria: Check status ranking, manual order within the same group, parent/descendant preservation, and list keyboard movement.
