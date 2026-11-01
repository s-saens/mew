---
title: "Project-owned document metadata implementation"
description: "Records the 2026-11-01 fix for nested Documents .mew folders, shared file identity for comments and widths, shared option migration, local regression/build verification, and pending application to the running server."
created: "2026-11-01"
updated: "2026-11-01"
---

## Purpose and result

Investigated `.mew/docs/.mew/comments.json` in the Mew checkout. The file contained an empty version-1 comment registry. Comments, table widths, and frontmatter options all derived their metadata location from the Documents content root.

Added `server/document-metadata.ts` and routed all three stores through the active project's `.mew`. Documents comment and layout keys include the configured Documents path, matching Files. Known legacy files migrate on access, preserving unrelated files and combining comments and options with existing canonical state. The [owning contract](../development/architecture.md#project-owned-document-metadata) and [ADR 0109](../decisions/0109-project-owned-document-metadata.md) define paths and collision behavior.

## Local verification

- 22 checks passed across `server/document-metadata.test.ts`, `server/comments.test.ts`, `server/tableLayout.test.ts`, and `server/frontmatter-options.test.ts`, using temporary workspace and account-data locations. Coverage includes ordinary/custom Documents folders, named-project isolation, shared view identity, comment edit/delete, legacy merges and retries, corrupt originals, symlinks, and failed atomic publication.
- Targeted lint passed for the five changed TypeScript files.
- `npm run build` passed, including TypeScript checks. Vite reported large-chunk warnings.
- `npm run check:docs` passed: 624 descriptions, no metadata or document-link errors. The changed tracked files also passed `git diff --check`.
- Rechecked the checkout's legacy registry, confirmed it still contained no document entries and no extra fields or neighboring files, then removed that empty file and directory. No existing comments were removed.

## Application boundary

No deployment, launcher execution, or server lifecycle operation was performed. The running server must load the new backend code through a user-owned update/restart before subsequent requests use the new storage behavior. Migration is lazy and does not recursively inspect closed Documents folders. Unrelated legacy files remain in place.
