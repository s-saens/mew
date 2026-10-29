---
title: "0035 — Storage and history boundaries for conversion between regular tables and document DBs"
description: "A decision to record bidirectional conversion between regular tables and document DBs as a single document transaction, preserving the source DB so undo and redo reuse the same reference. Defines text import and preservation of source values under primary column constraints."
created: 2026-10-21
updated: 2026-10-21
---

# 0035 — Storage and history boundaries for conversion between regular tables and document DBs

Status: Approved

## Background

Markdown tables are stored in the body, while document DB rows and columns are stored in Postgres. Supporting undo and redo while converting between the two formats through the context menu requires separating document history from the DB lifecycle. Empty and duplicate values in regular tables can conflict with the DB's required, unique primary column constraints.

## Decision

- Record conversion as a single document node replacement. In both regular ProseMirror history and Yjs collaborative history, undo and redo it as one step separate from preceding and following input.
- DB→table inserts a text snapshot of all rows and columns into the body and retains the source DB and row pages. Do not apply display search, sorting, or row limits to the snapshot.
- Table→DB imports all columns as text and handles DB creation, column definitions, and row storage in one transaction. Use the existing creation API's optional initial table input, and retain example values for ordinary `/db` insertion.
- If the first column's values do not satisfy the required and unique constraints, add a separate text primary column to preserve the source cells. Retain the required and unique rules in the [Primary column decision](0012-database-row-pages.md).
- Undo and redo do not create or delete DBs. A new DB remains in the list after undo, and redo references the same UUID. Request removal of a new DB that could not be inserted into the document because the source changed while the request was pending.

## Rationale and Impact

Retaining the source DB allows document history alone to be restored without damaging references from other documents or linked pages. An unused DB may remain in the list after undo; users can delete it separately if needed. DB cell edit history is not included in document undo/redo. When converting a table into a new DB again, use text types.

Follow the [DB feature contract](../features/document-databases/document-databases-and-catalog.md#markdown-tables-and-conversion) for current behavior and validation, and [DB usage](../../../docs/guides/database.md#converting-between-databases-and-regular-tables) for operating instructions.
