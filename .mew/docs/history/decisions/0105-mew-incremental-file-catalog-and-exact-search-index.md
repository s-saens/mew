---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew navigation and exact search share an incremental file catalog. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0105 — mew navigation and exact search share an incremental file catalog"
created: 2026-09-01
updated: 2026-09-02
---

- Date: 2026-09-01
- Status: Adopted
- Partially supersedes: 0088 — the scope in which search and watchers that need the full tree continue building a recursive tree
- Decision maker: Song Sanghun (implementation direction; draft: Codex)

## Background

[ADR 0088](0088-mew-sidebar-tree-lazy-loading.md) lazy-loaded the sidebar by folder during normal use, but filename and content searches and watcher change
detection still recursively build the entire tree. Content search rereads the same files whenever the input
changes. SSE only shows the first results sooner; it does not reduce total disk work.

mew already requires Node 22.18+ or 24 and a single process as its installation contract, and source files must remain the SSoT. Exact search
failures must not block file editing, navigation, or server startup.

## Options

1. Perform a full scan with Node or `rg` for every request — no separate state, but repeated I/O and process costs scale with project size.
2. External search service — handles large scale well, but breaks the contract of installing mew as a single package and the local document boundary.
3. In-memory file catalog + Node's built-in SQLite FTS5 — supports incremental updates without separate services or packages and can fall back to full scans on failure.
4. Combine exact search with LanceDB RAG — reuses storage, but vector chunks and exact file and string searches have different data lifetimes and query contracts.

## Decision

Adopt option 3.

- A per-project in-memory `FileCatalog` owns an immutable snapshot of paths, parents, types, and sorted lists by parent, while the exact-search SQLite
  database tracks each file's size and mtime. The first root response
  is returned immediately using the existing single-level read, while the full snapshot is built once in the background.
- Navigation, Ctrl+P, and Ctrl+Shift+F use the same catalog version. The watcher updates only changed parents and files and notifies clients of the
  affected parents and version so that only the relevant folder caches are invalidated.
- Ctrl+P applies fuzzy ranking to server catalog candidates and returns only the top 50 results. It does not send the entire `TreeNode` to the browser.
- The exact content index uses Node 22's `node:sqlite` and the FTS5 `trigram`
  tokenizer. The DB is stored at `<MEW_DATA_DIR>/search/<workspace-hash>/catalog.sqlite`, separate from LanceDB RAG.
- Only non-regex queries of at least 3 characters use FTS candidates. Case, line, column, and preview are revalidated against each candidate file's current source text. Queries of 1–2
  characters, regex queries, and index states involving preparation, failure, or inconsistency fall back to the existing exact scanner.
- Source files are the SSoT. The DB is not backed up and is automatically rebuilt if deleted, corrupted, or subject to a schema change. Index errors do not cause server
  startup or file navigation to fail.
- The catalog and index are not permission boundaries. All tree, filename, and content results are filtered again using the role, guest approval, ignore, and blocking policies in effect at request time.
- Send partial tree signals containing parent paths only to authenticated roles; send guests only full refresh signals without paths.
- When `MEW_SEARCH_INDEX_ENABLED=0`, immediately use only the existing scanner. The default is `1`, and the fallback is always retained.

## Rationale

Both the current minimum Node version and the Docker base provide `node:sqlite`, so no new native packages, compilation tools, or external processes are needed. FTS trigram
can narrow candidates for Korean and English substrings of at least 3 characters, while source-text revalidation and fallback for short queries preserve accuracy.
Separating the in-memory catalog from the SQLite index lets navigation work regardless of DB failures and allows recovery and schema changes for the semantic
search storage layer and exact search to be managed independently.

## Results

- Warm navigation and filename search scale with the number of children under a parent and the number of top results, rather than total disk size.
- Warm literal content search reads only FTS candidate files instead of reading all files.
- Initial catalog and index construction incurs the same full-read cost as before, plus additional disk space proportional to the source content. The existing scanner provides accurate results even during construction.
- Review Node 22's `node:sqlite` warnings and API stability when upgrading Node. Removing this API or switching to an external DB requires a new ADR.
