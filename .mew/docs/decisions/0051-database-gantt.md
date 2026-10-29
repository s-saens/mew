---
title: "0051 — Remove the task panel and integrate database Gantt"
description: "The decision integrates Gantt into the editor database's shared data, date columns, display settings, and detail editing. The removal of the task panel and Alt+T was superseded by subsequent decision 0052; database integration and data separation boundaries remain unchanged."
created: 2026-10-23
updated: 2026-10-23
---

Status: Partially superseded — [0052 — Restore the task panel alongside database Gantt](0052-restore-task-panel.md) supersedes the removal of the task panel, saved layouts, and shortcuts. Database Gantt integration and the separation boundary between existing task and database data remain unchanged.

## Background

The user requested removal of the standalone task panel and integration of Gantt into editor database views. Use existing database rows, date columns, and editors instead of task-specific data and a separate panel.

## Decision

- Remove the task panel from the dock, settings, mobile panels, and new-item and view-switching shortcuts. Discard task groups, tab assignments, and open states from old layouts while preserving neighboring panels.
- Add Gantt to the database view contract in [0028](0028-database-multiple-views.md). Share the date reference column, item details, read-only behavior, search, and save controller with the calendar. Preserve the scope for saving display settings in documents and standalone database popups.
- Preserve existing task Markdown, metadata, and storage APIs. Do not automatically copy them to the database or delete the originals. Task-specific completion, tags, assignees, and hierarchical aggregation are outside the database Gantt contract.
- Use Alt+F by default to toggle the feature panel. Remove the Alt+T panel shortcut and preserve Ctrl+backtick for the terminal.

## Rationale and Impact

Schedule editing uses the same data as other document database views. Existing task documents remain editable in Documents and are not automatically synchronized with database data. Database use requires the existing Postgres and permission setup. The user performs app builds and production rollout.

Current operations and verification follow the [database guide](../../../docs/guides/database.md#switching-views) and [database feature contract](../features/document-databases/document-databases-and-catalog.md).
