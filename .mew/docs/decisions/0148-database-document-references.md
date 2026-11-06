---
title: "0148 — Persist document database references and delete unreferenced databases"
description: "Records event-driven project/file/line references and last-reference database deletion, including legacy gaps and external-source safety. Supersedes ADR 0035's saved-conversion retention and ADR 0147's database Dock entry."
created: "2026-11-06"
updated: "2026-11-06"
status: "accepted"
---

## Context

The database catalog exposes tables without showing where documents use them. The single `owner_path` supports row-page placement, but cannot represent multiple references or source lines. The requested lifetime rule removes a DB when deleting its last reference. This changes the conversion retention decision in [ADR 0035](0035-table-database-conversion.md). The requested Dock removal also changes [ADR 0147](0147-compact-workspace-menu.md).

## Decision

Persist one record per document DB occurrence, containing DB UUID, project, project-relative file, source line, and occurrence index. Update these records after successful file writes and structural operations, and through changed-path watcher events. Catalog reads use the stored records without searching documents. Preserve project isolation and the existing database access boundaries.

Replace the affected document's records transactionally. Register all surviving references in a batch before orphan cleanup. Serialize project reference mutations and lock affected DB rows. Move records with file/folder paths before processing deletion events.

On reference removal, delete a DB with no remaining recorded references. Drop a managed DB's physical table and remove its catalog metadata. For external DBs, remove only Mew's attachment; retain the external source. Existing linked row-page bodies remain. Missing legacy records are harmless; previous content from API saves/deletes identifies legacy removed blocks. Do not scan or backfill old documents on catalog reads, or sweep unrelated zero-reference DBs.

Remove the database action from desktop/mobile Dock and its settings. Keep the floating explorer and editor entry points. Display the selected DB's recorded references and count in the catalog.

## Alternatives and rationale

A catalog-time workspace search would reconstruct references repeatedly and violate the requested creation-time recording model. Reusing `owner_path` would lose multiple references and confuse usage with row-page placement. Retaining every DB for document undo would violate last-reference deletion. Persisted occurrence records keep updates local to affected documents and support repeated blocks in a single file.

## Consequences

Saving the removal of the last reference deletes Postgres data. Document undo/redo can restore a UUID but cannot recreate deleted data; other remaining recorded references preserve the DB. Postgres backups remain necessary.

Older documents acquire references when saved or changed. Unrecorded legacy references cannot protect data during cleanup, and external legacy file deletion cannot identify blocks that were never recorded. Optional Postgres failures preserve file edits and may leave metadata stale until another change of the path. This decision does not introduce a workspace migration or a background retry journal.

Current behavior belongs to the [database feature contract](../features/document-databases/document-databases-and-catalog.md#persisted-document-references-and-database-lifetime) and [user guide](../../../docs/guides/database.md#finding-where-a-database-is-used). Actual checks and limitations belong to the [work record](../work/database-document-references.md).
