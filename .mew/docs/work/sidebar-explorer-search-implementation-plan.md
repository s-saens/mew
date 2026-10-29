---
title: "mew sidebar exploration and search implementation plan"
created: 2026-09-01
updated: 2026-09-11
reviewed: 2026-09-02
review-after-days: 30
description: "Records the phased implementation, permission, recovery, and test plans and completed scope for an incremental file catalog, lazy folder loading, server-side filename search, and SQLite FTS5 content search."
---

> 2026-09-28 follow-up: [ADR 0176](../history/decisions/0176-mew-remove-local-rag.md) removed RAG and its dedicated models and dependencies. The RAG implementation and review items below are historical records, not current adoption or deployment tasks.


This document is an **execution plan for implementers** to
turn [Sidebar Navigation and Exact Search Performance Design](sidebar-explorer-search-performance.md) into actual code. Follow [Sidebar File Search](../features/projects-files-search/filename-content-search-and-replacement.md) for the UI contract and [ADR 0088](../history/decisions/0088-mew-sidebar-tree-lazy-loading.md) for the current lazy-loading contract. Content
files are the SSoT, and search data structures are disposable, regenerable
derived caches under `MEW_DATA_DIR`.

## Scope and definition of done

This work speeds up the following three paths.

1. Sidebar root display and folder expansion
2. Ctrl+P filename and path search
3. Ctrl+Shift+F literal content search

Semantic search (LanceDB), opening content in the editor, collaboration rooms, and external search services are out of scope. Regex content search
may remain as a fallback path that preserves result accuracy. Completion means eliminating full-tree and full-file reads from normal request paths and
meeting the tests and performance criteria below.

## Implementation status

Implementation and automated verification were completed on 2026-09-02. [ADR 0105](../history/decisions/0105-mew-incremental-file-catalog-and-exact-search-index.md) was adopted, and instrumentation, an in-memory `FileCatalog`, watcher updates for affected parents,
full reconciliation when watcher events are missed, server-side Ctrl+P, partial invalidation of the versioned tree, Node's built-in
SQLite FTS5, dirty-source fallback, and SSE batching were applied. File operation APIs immediately reflect changed parents in the catalog and
send guests only pathless tree signals. Recovery from index corruption, schema changes, and deletion, 0600 DB permissions,
and multiprocess write contention were also verified.

The implementation started with a single cohesive `mew/server/searchCatalog.ts` instead of the PoC folder split in this plan, and used asynchronous file I/O, transaction batches
of 128, and `setImmediate` yielding instead of a separate worker thread. Feature boundaries and rollback contracts remain the same. Only actual browser
p50/p95 traces will be measured separately after the new build is applied to the running app. This work did not run build, restart, or deployment,
in accordance with the operational contract in `mew/README.md`.

## Storage decision

ADR 0105 finalized content index storage as follows.

- Use `node:sqlite` and FTS5 trigram on the current minimum
  runtime, Node 22.18+, and store the data in `MEW_DATA_DIR/search/<workspace-hash>/catalog.sqlite`.
- If indexing is disabled or building or querying fails, safely fall back to the existing scanner.
- The content is a derived copy for generating FTS candidates; the source files are the SSoT. Schema mismatches trigger an automatic rebuild.
- Use storage independent of LanceDB RAG.

## Current code map

| Responsibility | Current file | Direction of implementation changes |
| --- | --- | --- |
| Tree traversal, visibility, and sorting | `mew/server/tree.ts` | Keep the policy functions and wrap disk walks in `FileCatalog` initial construction and incremental updates. |
| Change watching | `mew/server/watcher.ts` | Pass affected paths to the catalog instead of retraversing all watchers and comparing full JSON. |
| API | `mew/server/api.ts` | `/tree` and `/search/stream` use catalog queries and return the version and state. |
| Content scanner | `mew/server/search.ts` | Retain only source verification and regex fallback, and combine them with index candidate queries. |
| API client | `mew/src/api/client.ts` | Define types for the tree envelope, filename search API, and abortable search. |
| UI state and scopes | `mew/src/App.tsx` | Remove Ctrl+P candidate generation based on `fetchFullTree`. |
| Tree rendering | `mew/src/components/FileTree.tsx` | Invalidate parent caches by version to reread only the relevant open folders. |
| Search UI | `mew/src/components/SearchPanel.tsx` | Handle server-side filename search, abort, stale/bulding states, and result batches. |
| Current protection rules | `mew/server/guestAccess.ts`, `mew/server/ignoreList.ts`, `mew/server/paths.ts`, `mew/server/reqAuth.ts` | Do not duplicate them in the index; always reuse them immediately before returning results. |

Do not remove the existing public exports of `buildTreeAsync`, `listTreeDirAsync`, `flattenTextFiles`, and `searchInProjectProgressively` in a single PR. Move the internal implementation after confirming
that the new path is equivalent under the existing tests.

## Shared data contract

### Internal server types

Create `mew/server/fileCatalog.ts` and export the following types. Actual field names may change, but their meaning must be preserved.

```ts
type CatalogNode = {
  path: string
  parent: string
  name: string
  type: 'file' | 'dir'
  project: boolean
  size: number | null
  mtimeMs: number | null
  indexedAtVersion: number
}

type CatalogSnapshot = {
  project: string
  version: number
  builtAt: number
  childrenByParent: ReadonlyMap<string, readonly CatalogNode[]>
  files: readonly CatalogNode[]
}

type CatalogChange =
  | { kind: 'upsert'; path: string }
  | { kind: 'remove'; path: string }
  | { kind: 'rescan-parent'; path: string }
  | { kind: 'rescan-project' }
```

- Snapshots are immutable. HTTP requests must not read a Map while it is being updated.
- `version` increases only when the set of actually visible paths or a child list changes.
- Do not store roles or guest permissions in `CatalogNode`. These values are user-specific and mutable, so calculate them at response time.
- Export `filtersFor`, `fileVisible`, and `isPathVisible` from `tree.ts` or extract them into `treePolicy.ts` so the catalog, tree API, watcher, and search share
  one definition. Do not duplicate name and extension policies in two places.

### HTTP contract

Keep the existing array response from `GET /api/tree` for compatibility. Only new clients that send the opt-in query `v=1` receive an envelope.
Keep arrays for the existing recursive guest responses as well.

```ts
type TreeResponseV1 = {
  version: number
  state: 'ready' | 'building' | 'stale'
  entries: TreeNode[]
}

type FileNameSearchResponse = {
  version: number
  state: 'ready' | 'building' | 'stale'
  results: Array<{ path: string; project: string; scope: FileSearchScope }>
}
```

- Add `GET /api/search/files?q=&scopes=&project=`. Filename search does not use the full `/tree` response.
- `GET /api/search/stream` retains the current SSE event names `result`, `done`,
  and `error`. Add `{ truncated, state, version, scannedDirtyFiles }` to `done`.
- All new requests use `AbortSignal` and a request number. Aborted requests propagate cancellation to the server queue or, at minimum,
  immediately stop writing results.

### Real-time signals

Keep the existing `{ type: 'tree' }` on the presence WebSocket for compatibility. The new server sends the scope as follows only when possible.

```ts
{ type: 'tree', project: string, version: number, parents: string[] }
```

If `parents` is absent or the project differs, the client rereads the root as before. If `parents` is present, mark only those parents'
`directoryChildren` as stale and request only expanded folders again. Do not include filenames, paths, or permission information in the signal.

## Implementation phases

Make each stage a separate PR/commit, and proceed to the next stage only after the previous one passes. Because
the [Execution and Verification Rules](../development/getting-started.md) state that `npm run build` immediately changes the running mew instance, implementers must verify with `npm test`, `npm run lint`, and `npx tsc -b` and
must not build/serve/restart without user approval.

### 0. Baseline instrumentation and fixtures

**Purpose:** Establish a baseline for quantitatively demonstrating subsequent "improvements."

1. Add `mew/server/perfMarks.ts`. Provide `measure(name, fields, fn)` based on `process.hrtime.bigint()`, and write a single JSON line only in development mode or
   when `MEW_PERF_LOG=1`. Do not emit logs or private paths during default execution.
2. Instrument the following intervals in `tree.ts`, `search.ts`, `watcher.ts`, `/api/tree`, and `/api/search/stream`:
   `tree.list`, `tree.full`, `search.candidate-build`, `search.read`, `search.match`, `watch.sync`, `watch.signature`, and `api.serialize`. Attach only file counts,
   bytes read, and result counts.
3. Create `mew/server/perfFixture.ts` and a test-only fixture generator. Generate up to 10,000 files in default tests, and 100,000/500,000
   files only with `MEW_PERF_FIXTURE=1`. Include a mix of binary files, ignored files, docs, subprojects, and long paths.
4. Add regression budgets to `mew/server/perf.test.ts`, but avoid absolute timing assertions in CI. Instead, check deterministic upper bounds such as full-tree
   call counts, candidates read, and rows returned.

**Pass criteria:** Logs distinguish every interval in the current bottleneck table, and fixtures do not create or delete working-tree or user files.

### 1. Transition to an in-memory FileCatalog and tree API

**Purpose:** Eliminate full recursive tree rebuilds during normal navigation and watcher processing. This phase introduces no new DB.

1. Implement a per-project `Map<project, Catalog>` in `fileCatalog.ts`. `ensure(project)` starts an asynchronous initial scan only once, on the first
   request, and concurrent requests share the same Promise.
2. Use `fs.promises.readdir` for the initial scan. Yield recursive traversal to `setImmediate` every 64–256 directories, and
   do not use unbounded `Promise.all`. Apply the existing policies for `.git`, `node_modules`, `.data`, ignore, and download-only unchanged.
3. Implement `listChildren(project, parent, opts)`. Produce the same sorting and `project` classification results as `listTreeDirAsync`, and return the last
   complete snapshot while stale/building. Safely fall back to the existing `listTreeDirAsync` only when no snapshot exists.
4. Keep the public functions in `tree.ts`, but change only `/api/tree` to use the catalog adapter. The full filter for preserving guest paths
   may still use the existing `buildTreeAsync`. Optimize guests in a separate PR without permission regressions.
5. Inject `catalog.note(change)` into `watcher.ts`. If the event's filename is reliable, schedule a rescan of only the affected parent; if the filename is
   absent or the event is `rename`, schedule a parent rescan. Keep the existing `collectWatchDirsAsync` because incremental additions to and removals
   from the watcher set are not the goal of this stage.
6. Once catalog changes are reflected, broadcast a tree signal containing the affected parents and version. Remove the `lastJson` signature comparison
   from the catalog path.

**Required tests:**

- `fileCatalog.test.ts`: initial scan deduplication, file/folder creation, rename, and deletion, parent-only rescans, immutable snapshots, and sorting.
- Existing `tree.test.ts`: result arrays for member/manager/owner/guest remain identical to previous results.
- Add or extend `watcher.test.ts`: when one file changes, publish only affected parents without a full recursive build.

**Pass criteria:** Repeated `/tree?path=` requests use snapshots without disk `readdir` calls, and only currently open folders refresh after project changes.

### 2. Server-side filename index for Ctrl+P

**Purpose:** Eliminate the two `fetchFullTree` calls in `App.tsx` and browser-side sorting of all candidates.

1. Add `mew/server/fileNameSearch.ts`. Build candidate views by scope from the files in the catalog snapshot, and retain normalized basenames, segments, and
   full paths. Scope classification must produce the same results as the current Documents/direct-child `.mew` subproject rules
   in `App.tsx`.
2. For the fuzzy algorithm, first inspect and reuse the already verified functions in `mew/packages/editor/src/utils/fuzzy.ts`. If reuse is unsuitable,
   extract a pure function and maintain a single canonical implementation. Rank matches in this order: basename
   exact/prefix, segment prefix, boundary match, and subsequence, with a deterministic tie-break (`path.localeCompare`).
3. Wire `/api/search/files` into `api.ts`. If the query is shorter than 2 characters, it may return a `recent` slot instead of empty search results, but recent-file persistence
   is not a prerequisite for this stage. Return at most 50 results.
4. Add `searchFiles()` to `client.ts` and remove the `loadSidebarFileSearchResults` and `fetchFullTree` imports from `App.tsx`.
5. In file mode, `SearchPanel.tsx` calls `searchFiles` after debouncing. Remove the previous full candidate cache in `fileCandidatesRef` and discard late responses
   using `AbortController` and a request ID. Preserve the existing regex and case-sensitivity options, tooltips, and scope UX.
6. To accommodate possible expansion to 100 or more filename results, render list rows with a simple viewport window without a new
   dependency such as `react-window`, or retain the cap of 50. Retaining the cap of 50 is the default for this stage.

**Required tests:**

- `fileNameSearch.test.ts`: Korean, camelCase, kebab-case, identical basenames, scope OR, docs/subproject scopes, regex/case.
- `SearchPanel` or pure helper test: canceled old responses do not overwrite results for a new query.
- Static check: 0 calls to `fetchFullTree` in the Ctrl+P path.

**Pass:** With a fixture containing 100,000 files, Ctrl+P requests transmit and parse no more than 50 candidates, and no long tasks occur on the UI main thread during search.

### 3. Client tree version and partial invalidation

**Purpose:** Eliminate rereading the entire root, docs, and active project trees on every change signal.

1. Add `fetchTreeV1()` to `client.ts`. Keep the old array API until all callers have migrated.
2. Maintain per-project `{ version, rootEntries, staleParents }` state in `App.tsx`. Instead of replacing the current tree state all at once, use an
   adapter function to produce the `TreeNode[]` expected by `FileTree`.
3. Extend the tree message type in `usePresence.ts`, and mark only `parents` as stale in `onTreeChange` in `App.tsx`. Immediately refetch expanded parents
   in the background, and fetch collapsed parents on their next expansion. If the server sends only legacy signals, fall back to the existing full reload.
4. Add `catalogVersion` and `invalidateParents(paths)`, or equivalent props, to `FileTree.tsx`. Preserve unaffected keys, openDirs, focus,
   and scroll identity within `directoryChildren`.
5. Preserve the optimistic UI after successful file operations, but do not force a full root refetch until the catalog version response arrives.

**Required tests:**

- `usePresence` message parsing test: both old and new tree signals work.
- `FileTree` test: changes to `docs/a` do not clear the expansion cache for `src`.
- Late v1 responses during project switching do not overwrite the new root state.

**Pass:** Editing one file does not change UI scroll or expansion state outside the relevant expanded folders, and does not trigger another `/tree` root request.

### 4. Content index PoC

**Purpose:** Demonstrate a candidate index accurate and recoverable enough to replace the scanner. Keep this stage behind a feature flag.

1. Create `mew/server/searchCatalog/` with `storage.ts`, `schema.ts`, `indexer.ts`, `query.ts`, and `manifest.ts`. Do not scatter the database path
   and schema version outside this folder.
2. Include `files(project, path, mtime_ms, size, content_hash, indexed_at)` and an FTS table in the schema. Use project/path uniqueness, transactions, and prepared statements. Handle cases
   where SQLite cannot find the same Korean substring under FTS syntax using the tokenizer/auxiliary
   trigram table specified in the ADR.
3. `SearchCatalog.ensure(project, visibleFiles)` compares the manifest with filesystem fingerprints and indexes only dirty files. Run the initial build as a background
   job, and have the API immediately return `{ state: 'building' }`. Do not perform bulk indexing in the search request's
   event loop.
4. Catalog changes from write, upload, rename, and delete APIs and the watcher schedule search catalog updates. For renames, delete the old row and upsert
   the new row in one transaction; for deletions, delete the row without a tombstone.
5. `/search/stream` first calls `SearchCatalog.candidates()` for literal queries. After checking each candidate file's current `mtime/size`, verify it
   using the line/match calculations in `searchInProjectProgressively`. Also run the original scanner on dirty/stale files so indexing delays
   do not omit results.
6. Regex uses the existing scanner by default. Do not use the index for regex until the PoC proves that the FTS candidate filter is a **superset**
   of regex results.
7. Index open/migration/build failures result in `state: 'stale'` plus fallback to the existing scanner, rather than 503. Show users only generic error
   messages without paths or content.

**Required tests:**

- Schema creation/upgrades, rebuilding after DB deletion or corruption, file rename/delete, and full reconciliation after missed watcher events.
- Literal search results match the existing `searchInProject` in files, lines, columns, and match counts.
- Documents saved immediately after an index write is delayed are also searchable (dirty fallback).
- For guest/member/manager/owner, no paths outside their permissions appear in results, snippets, or progress events.

**Pass:** Representative literal queries over 100,000 files validate only candidates rather than performing a full scan, and the result equivalence suite has 0 omissions.

### 5. Put content search into production

**Purpose:** Make the PoC the default path while allowing an immediate, safe rollback if problems occur.

1. Provide the `MEW_SEARCH_INDEX_ENABLED=0|1` feature flag. Per ADR 0105, the default is `1`; when set to `0`, use only the scanner. Record configuration values,
   DB location, and state as code contracts in the relevant documents under `mew/docs/configuration/`.
2. Include `state`, `version`, and `scannedDirtyFiles` in the done event from `/api/search/stream`, and add an "Index preparing — supplementing with exact search"
   state to `SearchPanel.tsx`. Do not use definitive no-results wording before index building is complete.
3. Flush result events in batches of at most 20 files, at intervals of 50–100 ms. Replace the current path, which appends each file's results via `setResults([...])` immediately
   on arrival and causes thousands of React renders, with a batch reducer.
4. Record `candidateCount`, `dirtyFallbackCount`, `queryMs`, `firstResultMs`, `indexLagMs`, and the fallback rate for 30 days. If an index error or omission is suspected, it must
   be possible to change the flag to 0 to use only the scanner.

**Pass:** New dependencies, configuration, and recovery procedures are documented in the README and ADR, and all existing search tests pass with the flag off.

## Prohibitions and precautions

- Do not solve this by launching an `rg` process for every request. Even if it is fast, it creates another separate contract for watchers, permissions, scope, and Windows deployment, and
  increases ongoing search load.
- Do not resend the entire `/api/tree` tree for filename search in the UI.
- Do not use index results to determine permissions. Reapply `guestAccess` and tree visibility **immediately before returning results**.
- Do not directly mutate stale snapshots from worker threads, SSE, or watcher callbacks.
- Do not send file contents, absolute paths, or search terms to default logs or telemetry.
- For bulk Git changes, do not perform an index transaction or WebSocket broadcast for every event. Use a debounced batch and a single version.
- Do not run `npm run build`, restart the server, or deploy without user approval.

## Final validation checklist

- [x] `npm test`, `npm run lint`, and `npx tsc -b` pass
- [x] `python3 .mew/docs/.github/scripts/moc_coverage.py` and `docs_health.py` pass
- [x] Functional equivalence checks for tree, filename, and content search pass with the baseline fixture of 10,000 files
- [x] With the optional performance fixture, Ctrl+P returns only the top 50 results without calling the full-tree API
- [x] Regression tests pass for literal, regex, case-sensitive, Korean, empty queries, long queries, binary files, and large files
- [x] No stale results remain immediately after saves, renames, or deletions, or after full reconciliation for missed watcher events or bulk changes
- [x] No private paths appear in search results or tree presence signals before or after guest permission changes
- [x] Rebuilding and scanner fallback continue to work after index directory deletion, corruption, or migration failure
- [ ] Collect actual browser traces in an environment that supports a connection, and record the design document's p50/p95 targets
