---
title: "Project hierarchical task contract"
created: 2026-09-30
updated: 2026-10-01
description: "Preserves the priority, date, time, storage, API, and validation contracts for hierarchical tasks before their removal on 2026-10-01. This is not the standard for the current Markdown task panel."
상위파일: "MOC.md"
---

[Removed feature](project-tasks.md)

> 2026-10-01: Removed the task UI, API, and related implementation and tests. The contract below predates removal. Only the saved files are preserved; the current app does not read or modify them. Do not reintroduce this without a user request.

## Usage and scope

After opening a project, manage the hierarchical task list in **Tasks** in the dock. Each item has a completion checkbox on the left, preceded by an expand/collapse arrow only when it has children. No arrow space is reserved for items without children. Click a title to edit it inline; save with Enter or by moving focus. Each row has priority (None, Low, Normal, High), date, and time inputs on the right, all of which can be cleared. Priority saves immediately on selection; date and time save when focus moves. If saving fails, retain the input and a button to retry saving.

Add buttons show only a + icon without text, while retaining their accessible names and tooltips. While an add input is open, hide the add buttons for the list and each row, then show them again after a successful save or cancellation. The + at the bottom of the list creates a top-level item; the + on each row creates a child task under that item. Parent relationships support arbitrary depth, and collapsed states persist while the panel is open. A checkbox toggles only that item between completed and planned; parent and child states do not change automatically. After clicking Delete, confirm with the deletion confirmation button. When a parent is deleted, preserve its immediate children by moving them to the deleted parent's parent level.

Use the same `data-dock-tab-bar` header as the Features and Git panels. The header has a height of 36 px, a surface-deep background, a 12 px title, 14 px icons, and 24 px refresh/close buttons; move it with the shared DockGrip. The body uses 12 px titles, 24 px inputs/icon buttons, 28 px rows, 18 px indentation, and the Features panel's list spacing and hover colors. Keep the title, priority, date, and time on one line, with metadata and action buttons aligned right. Display priority at 48 px, date at 100 px, and time at 94 px; pickers use the same 24 px height as the title input. In narrow panels, reduce input widths without a fixed minimum row width to preserve the single-line layout without horizontal scrolling. Limit indentation to 12% of the panel width. Preserve existing milestone data and in-progress/blocked states in storage, but do not provide milestone management, state selection, aggregation, or search filters in this simple hierarchical UI. Custom hierarchical controls replaced the old UI; do not restore it without a separate request.

Integrate dock tasks with existing docking, panel focus, the mobile frontmost stack, and Esc/Back behavior. Store the desktop open state in `chrome.tasksOpen` in the per-project account UI ledger. Layout uses the `tasks` kind in the existing dock ledger. Provide Korean, English, Chinese, and Japanese.

## Storage and API

- Store data per project in server-owned `DATA_DIR/project-tasks-<루트 경로 SHA-256>.json`. Accounts viewing the same project share the same board; do not change the existing user-owned to-do ledger on Home.
- `GET /api/project-tasks?workspace=<현재 루트>` returns `{revision, tasks, milestones, canEdit}`.
- `PUT /api/project-tasks` accepts `{workspace, board: {revision, tasks, milestones}}` and returns the newly saved revision and canEdit. Increment revision by 1 on each successful save.
- `ProjectTask`: `{id, title, milestoneId: string|null, status: todo|doing|blocked|done, due: YYYY-MM-DD|null, parentId: string|null, priority: low|medium|high|null, time: HH:mm|null}`.
- `ProjectMilestone`: `{id, title, due: YYYY-MM-DD|null}`.
- Only owner, manager, and member can access it. Read access to all files in the current root is required; writing also requires edit access to all files. If canEdit=false, hide or disable mutation controls. Guests cannot access it.
- The response is 409 if the server's current root differs from the requested workspace, 409 if the revision is stale, and 403 for insufficient file permissions. The client displays server errors; on a conflict, refresh and save again. Changes from other windows are not automatically overwritten or merged.
- Titles must be nonempty after trimming whitespace and contain at most 240 characters. Allow at most 2,000 tasks and 200 milestones. Reject duplicate IDs, references to nonexistent milestones or parents, self-references, parent cycles, and invalid dates, times, priorities, or states. Read missing parentId, priority, and time fields in existing saved data as null.
- Reuse the existing atomic save and corrupt-file handling contracts. Do not treat a corrupt file as an empty board and overwrite it. There are no asynchronous boundaries between synchronous reading, validation, and saving in the running server process.
- Server-push synchronization is not provided. Refresh to read the latest changes from other windows.

## Verification

- `server/project-tasks.test.ts`: storage, root isolation, stale revision rejection, preservation of corrupt originals, input validation, and role/root/conflict checks over actual HTTP.
- `server/project-tasks-ui.test.ts`: desktop and mobile checks in isolated Chromium for multilevel creation, collapse/expand, individual completion, optional metadata, inline editing, input retention after save failure, parent deletion, and horizontal overflow. Do not build or restart the running app.
