---
id: "mew-projects-tasks"
parent: "mew-projects"
title: "Project hierarchical task management"
status: "changed"
created: "2026-09-30"
updated: "2026-10-01"
files: ["src/components/project-tasks.tsx", "server/project-tasks.ts", "server/project-task-routes.ts", "src/App.tsx"]
commits: []
description: "Records the requirements, detailed behavior, implementation, validation, and existing JSON preservation policy for the removed hierarchical task feature. Distinguishes it from current flat tasks."
상위파일:
  - "../features/projects-files-search/MOC.md"
  - "../features/projects-files-search/_projects-files-search.md"
---

> 2026-10-01: Removed the task panel and API at the user's request and replaced them with the [shared memo panel](../features/collaboration-comments-chat/shared-notes.md). The record below predates removal and does not describe a current feature. Do not delete existing `DATA_DIR/project-tasks-*.json` or automatically migrate it to memos. Do not reintroduce this without a user request.

## Requirements

- Easily add, edit, and complete individual tasks for each project in a hierarchical list.

### Scope

- Provide top-level and child task creation, inline title editing, expand/collapse, and deletion.
- Add buttons display only +; hide them while entering a new item and show them again after saving or canceling.
- Use the checkbox on the left to complete that item. Show an expand/collapse arrow before the checkbox only when the item has children; otherwise, leave no empty space.
- Provide optional priority, date, and time inputs on the right of each item.
- Display everything from the title through the time and action buttons on one line, align metadata right, and use a uniform input height of 24 px. Adjust input widths and indentation in narrow panels to display without horizontal scrolling.
- Open from the dock, using desktop docking and a frontmost panel on mobile.

### Boundaries and limitations

- Data is stored on the server per root project, with read and write access restricted by permissions for all files.
- Do not migrate or change existing personal home tasks.
- Refresh to view changes from other windows, and do not automatically overwrite save conflicts.

### Detailed contracts

- [Usage, storage, and API contract](project-tasks-contract.md).
<!-- mew:implementation:start -->
## Implementation details

- Connected the task panel to the existing dock, docking, mobile stack, and panel closing behavior.
- The title/tab bar uses the same header structure, size, colors, and icon buttons as the features and Git panels, and reuses the shared DockGrip and expanded panel header contract.
- Server-side atomic saves and revision checks handle project isolation and concurrent editing conflicts.
- When a parent is deleted, its subtasks are preserved by moving them up a level.
- Replaced the milestone, aggregation, and search-focused UI with a concise hierarchical list using the shared panel style. Existing data is preserved.
- When saving fails, retain the row/add input and provide an error and a save retry option.
- Uses Korean, English, Chinese, and Japanese text and existing themes.

## Verification

- 2026-10-01 reimplementation checks: Passed 4 server storage/API/hierarchy and metadata validation checks and 1 desktop/mobile UI check. Confirmed that inline input is retained on failure and that completion, date, time, and priority are actually saved after consecutive edits.
- Frontend type checking, lint for changed files, and document boundary/link checks passed. Full type checking failed due to a node:path type error in `server/update-policy.ts` outside the scope of this work.

- 2026-09-30 automated checks: Passed a total of 22 checks covering storage, permissions, conflicts, input validation, isolated desktop/mobile UI, and dock, docking, and mobile stack regressions.
- Full type checking and lint passed (warnings remain in existing files). Document boundary and link checks passed.
- The full UI translation check failed due to existing untranslated text in shared-memo, agent-history-cache, agent-scheduled-cache, and Editor; the new task text is not on the failure list.
- Pending user verification: access through the dock in the actual app, project switching, docking restoration, and work data management.
<!-- mew:implementation:end -->
