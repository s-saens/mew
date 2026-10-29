---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Load the mew sidebar tree lazily by folder. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0088 — Load the mew sidebar tree lazily by folder"
created: 2026-08-27
updated: 2026-09-11
---

- Date: 2026-08-27
- Status: Adopted
- Follow-up decision: [0105](0105-mew-incremental-file-catalog-and-exact-search-index.md) — Recursive trees for full search and watchers, and full cache invalidation
- Follow-up decision: [0125](0125-mew-sidebar-center-anchor-and-visible-loading.md) — Prewarm collapsed top-level folders
- Decision maker: Song Sanghoon (directive)

## Background

When switching root projects, the server recursively traversed the entire directory tree, and the client waited for multiple tree requests
to finish before rendering the sidebar. In large projects, even information that could be displayed immediately, such as top-level
files and folders, had to wait for disk reads at the deepest subpaths.

## Decision

- `GET /api/tree?path=<상대 폴더>` returns only the folder's immediate children. If the response has no `children`, it means they have not
  been loaded yet, not that the folder is empty.
- When switching projects, the sidebar renders the root listing first, then starts preloading the immediate children of top-level folders one at a time
  in the background from the next frame onward. Deeper folders are requested when expanded.
- When a new root listing arrives after a file operation or watcher update, discard the lazily loaded child cache.
- `/api/tree` without `path` continues to return the full recursive tree for compatibility with server tools and existing callers. The guest tree retains
  the existing full-tree filtering because parent paths must be retained based on descendants' public-access rules.

## Rationale

The initial display is intended to let users start browsing, not to transfer the entire project in advance. Single-level requests limit
disk access and JSON size per path, while top-level preloading reduces the perceived delay when opening the first frequently used folder.
Preserve the existing server paths for search and watchers that require the full tree so that permission and monitoring semantics remain unchanged.

## Results

- When switching to a large project, the sidebar displays its root entries as soon as they are ready.
- Deep folders that are not collapsed do not trigger disk reads. When expanded for the first time, a loading state may briefly appear below the row.
