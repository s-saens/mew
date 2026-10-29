---
title: "0026 — Name-based storage of DB row pages directly under the source document"
description: "Decision to store DB row pages directly under the document containing the DB, using primary column values, preserve UUID associations, existing bodies, links, and drafts, and migrate old UUID files. Supersedes the UUID filename choice in 0012."
created: 2026-10-20
updated: 2026-10-20
---

# 0026 — Name-based storage of DB row pages directly under the source document

Status: Approved

## Background

Row pages were stored in `데이터베이스/<DB UUID>/<행 UUID>.md`, causing intermediate documents separate from the source document and hard-to-read filenames to appear in the explorer. Users must be able to find pages by row name under the document containing the DB.

## Decision

- Store new row pages directly under the source document using primary column values. If the source is a single Markdown file, convert it to a representative file under the existing parent/child document rules.
- Keep natural-language filenames and adjust reserved characters and names. Avoid file and folder name collisions by appending numbers.
- Retain internal row UUIDs and frontmatter association IDs. Also preserve the contract that keeps existing paths when titles are changed or pages are moved manually after creation.
- Migrate old UUID files to name-based paths under the source document. Preserve bodies, properties, links, and DB paths, and clean up only empty, automatically generated intermediate documents and folders.
- Roll back file changes if the DB transaction fails. In the browser, save drafts before making the request, update open tab paths, and then resume autosave.

Supersedes the UUID filename choice in [0012](0012-database-row-pages.md). Existing decisions on primary columns, shared fields, body preservation, and time fields remain in effect.

## Rationale and Impact

Paths expose the source document and row name, allowing navigation in the same way as ordinary documents. DB associations remain UUID-based even when duplicate names or values unsuitable for filenames are adjusted. Keeping paths unchanged when titles change after creation preserves existing links and the lifetime of open documents.

The [document page contract](../development/document-pages.md#database-row-subpages) governs the implementation contract and verification scope, and the [DB guide](../../../docs/guides/database.md#opening-rows-as-subpages) governs user operations.
