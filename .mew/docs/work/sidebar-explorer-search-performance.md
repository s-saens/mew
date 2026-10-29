---
title: "mew Sidebar Navigation and Exact Search Performance Design"
created: 2026-09-01
updated: 2026-09-07
reviewed: 2026-09-02
review-after-days: 60
description: "This design describes an incremental catalog and index architecture that reduces full traversal bottlenecks in file navigation, Ctrl+P, and exact content search, along with performance targets, permissions, consistency, recovery, and adoption priorities."
---

> 2026-09-28 follow-up: [ADR 0176](../history/decisions/0176-mew-remove-local-rag.md) removed RAG and its dedicated models and dependencies. The RAG implementation and review items below are historical records, not current adoption or deployment tasks.


This document defines the design
and priority criteria for **exact search and navigation performance**. The current UX contract follows [Sidebar File Search](../features/projects-files-search/filename-content-search-and-replacement.md), folder-level lazy loading follows [ADR 0088](../history/decisions/0088-mew-sidebar-tree-lazy-loading.md), and semantic
search follows [ADR 0071](../history/decisions/0071-mew-embedded-lancedb-local-rag.md). The incremental in-memory
catalog and Node built-in SQLite FTS5 store were adopted in [ADR 0105](../history/decisions/0105-mew-incremental-file-catalog-and-exact-search-index.md).

## Conclusion

The biggest improvement is eliminating the architecture that walks the entire disk and rereads content for every search. Have file
navigation and filename/content search share **one incremental file catalog**.

```text
파일 변경 감지
    │
    ├─ 영향 받은 경로만 stat / 목록 갱신
    ├─ 파일명·경로 색인 갱신 ──────────────── Ctrl+P
    ├─ 텍스트 내용 색인 갱신 ─────────────── Ctrl+Shift+F
    └─ 폴더 자식 스냅샷 갱신 ─────────────── 사이드바 펼치기
                                              │
                                  요청 시 권한·가시성 재검사
```

The original files remain the SSoT, and the catalog is a derived cache that can be deleted
and rebuilt. With this applied, request cost generally scales with `검색어 길이·결과 수` or `펼친 폴더의 직접 자식 수` rather than `프로젝트 전체 파일 수·총 바이트`.

## Bottlenecks before replacement

| Path | Current cost | Problems in large projects |
| --- | --- | --- |
| Expanding a folder | One-level `readdir` | ADR 0088 already avoids full recursive traversal, but rapidly opened folders, concurrent requests, and watcher updates can cause repeated reads of the same directory. |
| Filename search | After 250 ms, build the **entire tree** for Documents and the workspace, then calculate fuzzy scores in the browser | Opening the search screen for the first time reads all nested folders and transmits and parses large JSON payloads for each scope. With many files, sorting also blocks the main thread. |
| Content search | Build the entire tree for every search, then sequentially open up to 4,000 files and run a regex | Every single-character change to the query rereads the same files and creates new line arrays. SSE displays the first result sooner, but the full scan cost remains. |
| tree watcher | After a change, traverse all watched targets again and compare against the full tree JSON | Creating even one file triggers another traversal proportional to workspace size and bulk JSON serialization. |

Changing synchronous I/O to async helps reduce server event loop blocking, but does not reduce the number of directories or files that must be read.

## Targets and measurement

Do not judge performance as simply "fast." Record separate p50/p95 values for the following using developer tools performance marks and structured
server logs. Use synthetic fixtures with 10,000, 100,000, and 500,000 files and total text sizes of 1/10/50 GiB, along with one actual large
workspace, as benchmark projects.

| User action | Measurement start → end | Warm target | Cold/rebuild target |
| --- | --- | --- | --- |
| Initial sidebar display | Project switch → first paint of root rows | p95 ≤ 100ms | p95 ≤ 300ms |
| Folder expansion | Click → child row paint | p95 ≤ 80ms | p95 ≤ 250ms |
| First filename results | Ctrl+P input → paint of first 20 results | p95 ≤ 50ms | Show index readiness immediately without blocking the UI |
| First content result | Ctrl+Shift+F input → first match paint | p95 ≤ 150ms | p95 ≤ 500ms or progress display and cancellation available |
| Content search completion | Input → done | p95 ≤ 1 second (representative queries over 100,000 files) | Separate rebuilding from searching and record their completion times separately |
| Change propagation | write/rename/delete → update affected results and folders | p95 ≤ 300ms | Apply bulk Git checkout changes once after the batch completes |

For each request, record `indexState(hit|stale|building)`, candidate file count, bytes read, index query time, result count, and whether it was canceled. Do not use measurements
as evidence for adoption unless they distinguish whether the bottleneck is CPU, disk, serialization, or client rendering time.

## Recommended Architecture

### 1. In-memory snapshots and asynchronous incremental updates

The server keeps an immutable snapshot for each project in memory. Each snapshot contains only paths, parents, types, visibility, sizes, mtime/versions,
and normalized names for filename search. `/api/tree?path=` immediately returns the snapshot's list for the specified parent, while a separate update queue creates a
new snapshot and atomically replaces the old one. Since snapshots serving active requests are not modified, no contention locks are needed.

- Limit the initial scan to serial asynchronous directory I/O and periodically yield to the event loop. Add worker threads only
  when instrumentation confirms a CPU bottleneck.
- Batch watcher events over 100–300ms, but for OS events that lose path information, reread **only the affected parent folder**.
- Handle a rename as a single move when possible, or as delete+create when it cannot be identified. Correctness takes priority over optimization.
- Do not broadcast every event during Git checkout or bulk creation. Collect a set of dirty parents and publish them as one snapshot version.
- When the client receives `treeVersion`, it replaces only the affected parent listings without clearing the entire cache. Show listings for open paths first using stale-while-revalidate.
- The client stores expanded folder paths and the last direct-child snapshot received for each folder in the account's workspace UI state. When reopening, request only the root listing first, immediately render the saved subfolders and files, then revalidate expanded paths in the background in depth order. Use the same background requests to fill in older state that stores only paths. Do not persist child snapshots for guests, so old filenames do not remain after permissions change.

This step alone eliminates full recursive tree regeneration during browsing and watcher processing. Preserve ADR 0088's single-level response and recursive guest filtering contracts.

### 2. Dedicated filename and path index

Filename search does not use the content index or the full `TreeNode` JSON. Keep a small, sorted candidate array built from
the snapshot on the client or server, and briefly cache results by scope key (a combination of `root/docs/subproject`).

- Start fuzzy search only after at least 2–3 characters. Before that, show recent files, recent folders, and commands.
- Do not rely solely on a simple subsequence score; rank in the order `파일명 완전 일치 > 파일명 prefix > 경로 segment prefix > camel/kebab 경계 > 부분 일치`. Prioritize the basename over the path so results remain stable for the same input.
- Calculate fuzzy scores in the server's in-memory catalog and send only the top 50 results to the browser. The UI thread handles only input and result rendering.
- Cap results at 50 and use a virtualized list for keyboard selection. Do not create thousands of DOM rows.
- Include the index version in responses. If an update arrives during a search, retain the previous results and replace them on the next input or idle requery.

If the file count exceeds several hundred thousand or browser memory becomes a problem, promote this index to a server-side SQLite FTS5 trigram/prefix index. Initially,
an in-memory array is simple and fast, so do not introduce a separate DB until actual p95 and memory measurements exceed the thresholds.

### 3. Exact content search index

For content search, neither running `rg` for every request nor performing a full `readFile` scan in Node every time is sufficient as a final solution. Maintain a local index
that reflects ongoing changes; for literal search, first narrow candidates using FTS/an inverted index, then verify match positions against the original text.

- Storage candidate: Consider SQLite FTS5 first for deployment without native dependencies. Keep file metadata and the content index in the same DB, stored under `MEW_DATA_DIR/search/`. Its role differs from the existing LanceDB RAG, so do not combine them.
- Separate databases by workspace hash, and include `project, relPath, mtimeMs, size` and the copy of the body required by FTS in index records. The original text on disk
  is always authoritative, and the DB is a disposable derived cache.
- After file saves or watcher changes, a debounce queue reindexes only the affected files. To ensure accurate searches immediately after saving, search dirty files directly for supplemental matches and merge them with index results until the queue finishes.
- Literal searches use index candidates. For regex, complex word boundary, and case-sensitive queries, use the index only when candidate filtering is safe; otherwise, verify against the source text with a **fallback scanner with a restricted candidate set**. A slow, accurate search is preferable to an incorrect "no results."
- Calculate match lines, columns, and previews from the candidate files' source text. Add a line-start cache only when measurements show that source-text verification has become a bottleneck again.
- Do not index binaries, excessively large files, files outside the user's permissions, or ignore/denied paths. Define a separate policy for text files exceeding the size threshold, as with the current anchor preview.

After completion, limit search results by file count and maximum match count, while displaying `indexed`, `scanning dirty files`, and `truncated` distinctly. Keep SSE, but send
results in small batches ordered by score and path rather than disk order to reduce visual shifts.

## Permission, Consistency, and Recovery Invariants

- Catalogs and indexes are not access control. Refilter all `/tree`, `/search`, and `/search/stream` results using roles, guest approvals, and hiding rules at **request time**.
- Even if manager/owner `showAll` and the guest-visible tree share the same index file, build permission-specific views after querying and include the role and visibility version in cache keys.
- Apply the same policy to `.git`, `node_modules`, `.data`, configured ignores, and download-only internal files across browsing, search, and watch. When the policy changes, assume the catalog cannot be partially updated and rescan the affected project.
- Do not trust results if a file's `mtimeNs + size` differs from the indexed value. For reads during changes, atomic saves, or network filesystem errors, retry, then mark the file stale or fall back to the source text.
- Index corruption, schema changes, and server restarts must be recoverable by deleting and rebuilding the cache. Do not modify or lock source files, Git state, or user settings.

## Adoption Sequence

| Stage | Changes | Expected benefit | Conditions for the next stage |
| --- | --- | --- | --- |
| 0. Instrumentation | Add marks, logs, and large fixtures to the current tree/search/watch stages | Quantify bottlenecks instead of guessing | Establish baseline p95, file counts, and byte counts |
| 1. Navigation snapshots | Per-parent listing cache, watcher updates to affected parents, versioned invalidation | Decouple navigation and watchers from file count | Eliminate recursive tree walks after bulk changes |
| 2. Filename index | Lightweight path index + worker fuzzy + recent items | Eliminate initial search latency in Ctrl+P | Meet the p95 target even with 100,000 files |
| 3. Content index PoC | Verify building, recovery, and permission refiltering for SQLite FTS5/alternatives | Verify whether reading every file can be eliminated | 0 correctness regressions, installation and deployment contract review complete |
| 4. Adopt content indexing | Implement incremental indexing, dirty fallback, and SSE batch after the ADR | Substantially reduce Ctrl+Shift+F completion time | Pass 30 days of real-world usage metrics and recovery tests |

Stages 1 and 2 extend the direction of ADR 0088, while ADR 0105 finalized the storage and recovery lifecycle for stages 3 and 4. Exclude external resident services, search
SaaS, and APIs that send original text externally from consideration because they blur the single-installation,
local-first, and permission boundaries.

## Validation Scenarios

- Measure root display, first opening and reopening of deep folders, 20 consecutive expansions, and project switching in a tree of 500,000 files.
- Compare result sets for prefix, fuzzy, Korean, camelCase, regex, and case-sensitive queries over 100,000 text files byte-for-byte against the existing full scan.
- Reproduce file creation, saves, rename, delete, Git checkout, ignore rule changes, and watcher overflow/missed events, and verify that old paths do not remain in results.
- Send the same query as guest, member, manager, and owner, and verify that no unapproved files, secret files, or denied paths are returned.
- After deleting or corrupting the index directory or downgrading its schema, verify that server boot, rebuilding, and fallback searches preserve the source text.
- Verify that previous SSE or worker results do not mix into the UI or cache when a search is canceled by entering a new query or switching tabs or projects.
