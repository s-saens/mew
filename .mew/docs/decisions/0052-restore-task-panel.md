---
title: "0052 — Restore the task panel alongside database Gantt"
description: "Restore the standalone Markdown task panel, dock, docking, mobile support, saved layouts, and new-item shortcuts while retaining editor database Gantt. Supersede the task panel removal in 0051 and assign Alt+T to tasks and Alt+F to the feature panel."
created: 2026-10-23
updated: 2026-10-23
---

Status: Approved

## Background

The user requested bringing back the standalone task panel while retaining the Gantt view integrated into the editor database. Completion, tag, assignee, and duration management in existing task Markdown must be available alongside schedule editing based on document database rows and date columns.

## Decision

- Supersede the removal of the task panel, dock, mobile support, and shortcuts and the exclusion from saved layouts in [0051](0051-database-gantt.md). Restore the existing list, calendar, and Gantt views; docking, popups, and mobile foreground display; saved groups, tab assignments, and open states; and layout presets.
- The default `Alt+T` toggles the task panel. Preserve the feature panel's default `Alt+F` and the terminal's `Ctrl+백틱`. When tasks have focus, use the existing new-item and view-switching shortcuts.
- Preserve editor database Gantt and existing date columns, display settings, and item detail editing. Tasks use the existing Markdown and storage APIs, with no automatic migration to or synchronization with database rows.

## Rationale and Impact

Users can continue managing existing tasks while also using Gantt shared with other views of the same document database. The existing contract for database Postgres and permission setup remains unchanged by the task panel restoration. For layouts already omitted from saved state during the removal period, do not guess their former placement; add the panel at the default position when opened.

Current operations follow the [task usage guide](../../../docs/guides/projects.md#tasks) and [database guide](../../../docs/guides/database.md#switching-views); storage and input follow the [task contract](../development/task-list.md); shared layout and focus follow the [UI contract](../development/ui-contracts.md).
