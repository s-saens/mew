---
title: "Remove the standalone task panel"
description: "Supersedes task panel restoration with document database views, preserving existing task Markdown and legacy data without automatic migration."
created: "2026-11-17"
updated: "2026-11-17"
---

## Status

Accepted. This supersedes [ADR 0052](0052-restore-task-panel.md).

## Context and decision

The standalone panel duplicates list and schedule views that can be represented with document databases. Remove its dock entry, display, shortcut, and layout restoration. Use the [document database](../../../docs/guides/database.md#switching-views) for new structured work.

Existing `.mew/tasks` Markdown and legacy task metadata remain untouched and accessible as files. They are not automatically imported into a database or synchronized with its rows. The legacy task API remains available for compatibility, but the workspace no longer opens or loads the panel. The editor's file AI action treats task Markdown as ordinary documents.

## Alternatives and consequences

Keeping both panels would preserve two separate interfaces and data models. Automatic conversion would impose a mapping between distinct task and database schemas and could modify user data. Preserving files allows users to choose if and how to migrate them. Existing task-specific panel controls and views are no longer available; database views have their own capabilities and permissions.
