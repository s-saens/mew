---
title: "0093 — Rename linked database pages with primary titles"
description: "Decision to preview page-type primary titles immediately and rename linked files on confirmed saves, preserving UUIDs, manual locations, children, links, drafts, and rollback. Supersedes the title-change path stability choice in 0026."
created: "2026-10-30"
updated: "2026-10-30"
---

# 0093 — Rename linked database pages with primary titles

Status: Approved

## Background

[0026](0026-database-row-page-paths.md) created row pages with readable filenames but kept those paths unchanged after title edits. Rows created with default titles could consequently retain names such as `제목 없음.md` while displaying meaningful primary values. Tasks already preview edited titles in the explorer and open tabs and confirm filename changes after saving.

## Decision

- Page-type primary title edits use the shared title preview flow immediately. Operational paths remain unchanged until the server confirms a structural mutation. Failed saves restore the confirmed title without replacing newer edits.
- A confirmed title change renames the linked page in its current directory. Keep the existing filename sanitization and collision numbering. A parent row page renames its folder and representative together, preserving children and attachments.
- Preserve row and DB UUIDs, page bodies, user properties, links, open-tab identity, and drafts. Reuse the document rename engine and register its rollback with the DB change. Compose multiple structural moves into original-to-final path mappings for one client update.
- Track the last filename-synchronized title separately from shared field baselines. Row-page autosaves retain their request path, and background file watchers defer structural moves so they cannot consume a browser's pending path mutation. The next ordinary DB synchronization completes the rename. A manual move remains intact until the primary title changes again.

This supersedes only the title-change path stability choice in 0026. Name-based initial storage, legacy migration, collision protection, and UUID associations remain in effect.

## Alternatives and rationale

Keeping the filename fixed and changing only its display label leaves misleading filenames in the regular file view and external tools. Renaming on every keystroke creates path churn and exposes incomplete or invalid input. Duplicating folder and link operations in the DB layer would split the existing document rules. Immediate previews followed by confirmed structural changes match Task behavior and reuse the existing draft and tab lifecycle.

## Consequences

Title edits can now change link targets, including descendant paths of parent pages. Successful mutations update supported links and bindings together; failure restores file changes with the DB transaction. This is runtime rollback, not recovery from a process crash. Existing manually named paths are not bulk-renamed merely by opening a DB. Cross-user tab migration and physical-device verification retain the limitations in the [document page contract](../development/document-pages.md#database-row-subpages).
