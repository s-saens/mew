---
title: "0028 — Displaying the same DB through multiple per-document views"
description: "Decision for tables, cards, boards, and calendars to share the same DB data, with per-document display settings, including start/end date criteria, stored in Markdown nodes and standalone popup settings stored as scoped browser preferences. Preserves existing DB storage, permission, and collaboration boundaries. The Gantt extension follows subsequent decision 0051."
created: 2026-10-20
updated: "2026-10-23"
---

# 0028 — Displaying the same DB through multiple per-document views

Status: Approved

## Background

Document DBs offered only tables, making it difficult to browse tasks by status or schedules by date. Users must be able to view the same data as cards, boards, and calendars without duplicating it, and display one DB differently across multiple documents.

## Decision

- Tables, cards, boards, and calendars share the same DB query and mutation controller. Reuse the existing table cell and option editors in item details.
- Board groups use single-select or checkbox columns, and calendars use date columns. Group moves and creation by date use the existing row and cell APIs. Read-only views provide display functionality only.
- 2026-10-21 extension: Keep the calendar's existing `dateColumn` as the end date or single date, and connect a separate date column to the optional `startDateColumn`. Store date range values in existing date cells without adding a separate range type to the DB schema. Existing documents without a start date column retain single-date behavior.
- Store per-document view mode, grouping/date criteria, and displayed properties as attributes of the DB reference node, and serialize them as `data-mew-db-layout` in Markdown. The default table retains its existing representation.
- The server collaboration schema and client use the same settings parser and serializer. Without document edit permission, selections apply only to the current screen.
- Standalone popups save settings in scoped browser settings keyed by DB UUID. Document settings and popup preferences do not overwrite each other.
- Postgres continues to own row and column data and DB definitions. Do not add DB schemas or data copies for display settings.

## Rationale and Impact

Each document can use a different view, and display settings can be collaboratively edited, moved, and managed in Git along with the document. Personal browser popup preferences do not change document content. Existing documents and DB APIs remain in use; if a criteria column is removed, fall back to an available column of the corresponding type or an empty state.

Detailed behavior and verification criteria follow the [DB feature contract](../features/document-databases/document-databases-and-catalog.md), user operations follow the [DB guide](../../../docs/guides/database.md#switching-views), and the scope of personal storage follows the [browser storage contract](../development/browser-storage.md#db-popup-display-settings).

2026-10-23: [0051 — DB Gantt integration](0051-database-gantt.md) adds Gantt to the same data and display settings contract.
