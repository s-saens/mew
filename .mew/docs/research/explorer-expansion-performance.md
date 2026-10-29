---
title: "File and document explorer expansion performance investigation"
description: "2026-10-07 synthetic experiments and optimization priorities analyzing duplicate requests, cache invalidation, P2P receive control, large-scale row rendering, and sequential file metadata lookups when expanding folders and parent documents. These are not implementation changes or production performance validation results."
created: 2026-10-07
updated: 2026-10-07
---

Asynchronous per-folder fetching and the server catalog are already implemented. The key additional improvements are to **eliminate duplicate requests for the same folder, retain existing lists during refetching, reduce per-chunk round-trip waits in P2P transfers, and avoid creating off-screen rows**. The server-wide explorer can also reduce file-size lookups that the list does not use.

The working tree at the time of the 2026-10-07 investigation was analyzed. The figures below are synthetic measurements from isolated fixtures on Linux and do not establish performance for actual users' connection methods, deployed builds, phones, or external networks. The app code and running server were not changed.

The current feature contracts follow [File and folder browsing and operations](<../features/projects-files-search/file-folder-exploration-and-operations.md>), [Documents document map management](<../features/projects-files-search/documents-and-document-map-management.md>), and [Remote access](../development/remote-access.md). Previous designs and performance targets are in [Sidebar browsing and exact search](../work/sidebar-explorer-search-performance.md).

## Current fetch paths and latency factors

| Path | Current behavior | Areas for improvement |
| --- | --- | --- |
| Files folder or Documents arrow | `toggleDir` → `requestDir` → `/api/tree?path=…&v=1` → parse full JSON → replace `directoryChildren` → render all expanded rows | Immediately after the initial fetch, the restoration effect revalidates the same folder once more. |
| Documents parent document name | `openPage` finds the representative file in the child list and invokes file opening | It does not share a Promise with an in-progress fetch initiated by the arrow. Including the representative path in the parent entry could also reduce the preliminary list request when clicking the name. |
| Sidebar change notification | Delete the affected parent's child cache and refetch | Existing child rows disappear while waiting for the response. Replacing the root array also clears the entire child cache. |
| Single-level tree API for regular accounts | Direct children from the catalog → per-entry permission checks | Repeated synchronous filesystem checks cost more than the catalog lookup. |
| Restricted file permissions or guest | Recursively fetch the entire tree, filter permissions, then extract the requested folder | The entire project is traversed again even when `path` is specified. The user's role alone cannot determine whether this path is used. |
| Server-wide explorer | `/api/fs/entries` → single-level `readdir` → sequential `stat` for each file → full JSON | Waits for the sizes of all regular files even though file sizes are not displayed. |

Evidence: `requestDir`, the restoration effect, `treeInvalidation`, and `openPage` in [FileTree](../../../src/components/FileTree.tsx); `refreshTree` in [App](../../../src/App.tsx); `/tree` in the [tree API](../../../server/api.ts); `listCatalogChildren` in the [catalog](../../../server/fileCatalog.ts); `filterTreeForAccess` in [permissions](../../../server/access-policy.ts); `listEntries` in the [server file listing](../../../server/fsBrowse.ts); the [server explorer](../../../src/components/ServerFileExplorer.tsx) and [row UI](../../../src/components/file-browser.tsx).

## Network transfer measurements

In the current mewlink implementation, the central server handles login and signaling. File-list bodies travel directly over a DataChannel between the browser and device; TURN relay candidates and the central operation HTTP proxy are not used. An extra hop through a central relay server therefore cannot immediately be identified as the cause. Connecting directly to the server address also bypasses this DataChannel path. [Connection code](../../../src/utils/remote-connection.ts), [transport selection](../../../src/utils/remote-transport.ts), [current remote access contract](../development/remote-access.md).

P2P HTTP responses are sent in chunks of up to 12 KiB. The browser sends one `credit` for each `ReadableStream.pull` and waits for that chunk to arrive before proceeding with the next pull. The server also waits for `credit` for each chunk. This structure requires an additional round trip starting with the first body chunk, and subsequent chunks are also bound by round-trip latency. As with HTTP, it uses `Response.json()`, so partially received entries are not displayed. [Browser receiving](../../../src/utils/remote-transport.ts), [server sending](../../../server/remote-access-dispatch.ts), [chunk limit](../../../shared/remote-access.ts).

The actual `DataChannelTransport` and `remoteDispatcher` were connected through an in-memory HTTP connection. Half the RTT was added as a delay in each direction of the fake channel, and the server immediately returned prepared JSON. Each condition reports the median of 3 runs and excludes server disk lookups and UI rendering. Actual WebRTC bandwidth, loss, and congestion were not reproduced.

| Entry count | JSON bytes | Actual body chunk count | Receive completion at 0 ms RTT | Receive completion at 40 ms RTT | Receive completion at 100 ms RTT |
| --- | ---: | ---: | ---: | ---: | ---: |
| 50 | 4,371 | 1 | 1.7ms | 82.3ms | 202.9ms |
| 250 | 22,071 | 2 | 2.5ms | 123.3ms | 303.3ms |
| 1,000 | 88,821 | 8 | 5.1ms | 367.9ms | 911.3ms |

At 100 ms RTT, response headers arrived at approximately 102 ms. For the list of 1,000 entries, the remaining approximately 810 ms was spent receiving the body. In this experiment, completion time increased approximately as `(1 + 본문 조각 수) × RTT`. Assuming a continuous sequence of maximum-size chunks, the throughput ceiling for a 100 ms RTT path that waits for one chunk at a time is approximately 120 KiB/s.

As a first step, the initial response and a small body could be sent in the same transmission interval, with a **multi-chunk transmission window limited by byte count** for large responses. The browser's receive queue and the server's credit checks must be changed together. Increasing only the server's credit value could cause the current browser's queue overflow check to terminate the connection. Stream cancellation, permission revocation, concurrent requests, and global memory limits must be preserved, and protocol compatibility on both sides must be verified. The send queue can be managed using [`bufferedAmount`](https://developer.mozilla.org/en-US/docs/Web/API/RTCDataChannel/bufferedAmount) and low-water events.

A base64 body increases the byte count by approximately 33%. The total server-sent frames for a response with 1,000 entries amounted to 119,193 bytes. Binary frames and compression are also candidates, but eliminating per-chunk round trips has higher priority for small lists. Adding native HTTP compression must not be assumed to automatically compress this custom channel as well.

## Duplicate requests and cache revalidation

In a production React fixture using the actual FileTree, expanding a folder for the first time with an empty child cache requested the same path **2 times** in both Files and Documents. StrictMode was not used, and the result was the same across 3 runs each with 50, 250, and 1,000 entries. This matches the behavior in which the restoration effect treats even the newly received list as a restoration cache after the click-initiated request completes. The second request occurs after the initial display, so it does not simply double the time to first display, but it increases network traffic and subsequent rendering and storage work.

A separate cache fixture restored saved children for two open folders, `a` and `b`, and added a 150 ms delay to fetch responses. This check used the actual FileTree's state handling and fetching, excluding styles and menus.

| Action | Display during refetching | Requests |
| --- | --- | --- |
| Initial restoration from saved child lists | Children of both folders retained | 1 request each for `a` and `b` |
| Change notification for `a` only | Children of `a` disappear; children of `b` remain | 1 request for `a` |
| Replace the root list with a new array containing identical contents | Children of both folders disappear | 1 request each for `a` and `b` |

The first improvement is to consolidate fetching into a single function that manages in-flight Promises and received versions by account, workspace, project, and path. A successful new fetch itself is recorded as completed revalidation, distinguished from initial revalidation of a saved list. `openPage` and change notifications also share this function.

For ordinary changes, marking the list stale and replacing it when a new response arrives can keep previously viewed entries visible immediately. Unrelated child caches should not be cleared merely because the root list was replaced. Confirmed deleted paths, permission revocations, and account or root switches must invalidate the cache immediately and discard late responses from the previous state.

[ADR 0105](../history/decisions/0105-mew-incremental-file-catalog-and-exact-search-index.md) specifies invalidating only affected parents, and [ADR 0125](../history/decisions/0125-mew-sidebar-center-anchor-and-visible-loading.md) specifies reusing received lists and in-flight requests and reading only open paths. Prewarming all collapsed top-level folders must not be reintroduced.

## Display measurements for large lists

The actual FileTree and project CSS were bundled in memory. Conditions were a Chromium viewport of 1,100×750, production React, 4× CPU slowdown, and a 100 ms response delay for `loadChildren`. Each condition reports the median of 3 runs. The display metric was the point after two `requestAnimationFrame` callbacks following the first child DOM update, so it is not a precise screen-paint trace or INP. It also excludes the full App and load on actual devices.

| View | Child count | First click to display metric | Response to display metric | Re-expanding a cached folder | Total DOM elements after display |
| --- | ---: | ---: | ---: | ---: | ---: |
| Files | 50 | 130.8ms | 30.6ms | 25.7ms | 171 |
| Files | 250 | 154.6ms | 53.7ms | 36.5ms | 771 |
| Files | 1,000 | 332.6ms | 231.1ms | 160.8ms | 3,021 |
| Documents | 50 | 156.0ms | 55.7ms | 38.9ms | 676 |
| Documents | 250 | 269.1ms | 168.9ms | 155.1ms | 3,276 |
| Documents | 1,000 | 539.5ms | 438.2ms | 387.7ms | 13,026 |

Large lists can be slow even when re-expanded from cache without network access. All children are mounted using `map`, and per-row touch hooks also run. `Node` is not memoized, and the shared `ctx` is recreated on every render, so loading or selection changes in one folder also cause other open rows to rerender.

The key for large lists is to organize per-row props and callbacks so unchanged rows can be reused, then flatten the expanded tree into a list of display rows and apply virtualization that mounts only rows near the viewport. Simply adding `memo` while passing a new `ctx` each time has limited effect. [React memo explanation](https://react.dev/reference/react/memo), [virtualizing long lists](https://web.dev/articles/virtualize-long-lists-react-window).

Existing parent-row pinning, ancestor lines, drag moves, keyboard focus, selected-file location indication, and center-based scroll restoration must all be preserved. Simply wrapping the existing nested DOM in a virtualization component is insufficient. Full `directoryChildren` serialization during saving and queries for every row's coordinates in `readTreeCenter` are also measurement targets.

## Server lookup costs

Regular Markdown files were created in a temporary filesystem, and each condition was measured 12 times after the catalog was ready. The owner's unrestricted file permissions and a valid temporary permission policy file were used. The figures below are medians from a local filesystem with a warm OS cache.

| Scope | Child count | Direct catalog child lookup | Permission filtering | JSON serialization |
| --- | ---: | ---: | ---: | ---: |
| Files | 50 | 0.06ms | 1.87ms | 0.01ms |
| Files | 250 | 0.17ms | 7.76ms | 0.03ms |
| Files | 1,000 | 0.31ms | 26.45ms | 0.08ms |
| Documents | 1,000 | 0.18ms | 29.79ms | 0.08ms |

A single permission-filtering pass over 1,000 entries called `realpathSync` 3,000 times and `statSync` 2,000 times. In Documents, `mkdirSync` was also called 1,000 times to ensure the root existed. Even with the policy file cached, stamp checks and canonical path calculations are repeated for every entry. Policies, capabilities, and workspace roots could be obtained once per request, with duplicate calculations reused. Symbolic-link and path-escape checks must be preserved.

When file permissions contain deny exceptions, `/tree` rebuilds the entire tree instead of using the warm catalog. This path is a separate improvement target. Results should be built using the catalog's parent lists, permission inheritance, and ancestor paths of allowed descendants, while preserving parent paths for guests and permission checks at request time.

The server-wide explorer's `listEntries` looks up the size of each regular file sequentially. With local temporary files, medians over 6 runs were 5.63 ms for 50 files, 25.35 ms for 250 files, and 84.60 ms for 1,000 files. In the 250-file condition with an artificial 2 ms wait added to each file's `stat`, the current code took 554.18 ms, while a comparison file-listing implementation with 8 concurrent lookups took 79.49 ms. The comparison implementation was confirmed to produce identical lists, sizes, and sorting results for regular files; it is not a deployed improvement validated on actual slow disks or symbolic links.

Current server explorer rows do not display file sizes. Omitting sizes from list requests or fetching them separately when needed could eliminate one `stat` per regular file. If sizes must be retained for compatibility, use bounded parallel lookups. Per-directory `.git` and project marker and icon lookups could also be cached or separated so they do not delay the initial name-list response.

## Progressive display and recommended implementation order

Calling an API separately for each entry increases request counts and round-trip waits. If progressive display is introduced, **receive sorted lists in batches and update the screen in batches**. A suitable approach is to send the first 50–100 entries from the server catalog first, then receive the rest during scrolling or idle time, or continue receiving them as a stream. Receiving the full JSON and only splitting up display updates can reduce rendering stalls but cannot reduce the wait for network reception.

| Order | Candidate change | Expected result |
| --- | --- | --- |
| 1 | Consolidate fetch Promises, distinguish new fetches from restoration revalidation, update only affected parents, and retain existing lists | Requests on first expansion: 2 → 1. Eliminate the wait with missing lists during refetching. |
| 2 | Send the first P2P body with the response and use a bounded transmission window | Reduce the additional RTT for small lists and per-chunk RTTs for large lists over remote access. Remeasurement on actual networks is required. |
| 3 | Separate and reuse row props; virtualize large sets of display rows | Reduce hundreds of milliseconds of rendering time and cached re-expansion costs independent of the network. |
| 4 | Remove unnecessary `stat` calls from the server-wide explorer or use bounded parallel processing | Reduce waits proportional to entry count on slow filesystems. |
| 5 | Reuse permission calculations within requests; use catalog lookups for restricted permissions | Reduce repeated synchronous I/O and full recursive lookups on permission-exception paths. |
| 6 | Paginated or streaming responses for large folders, with batched rendering | Display the first screenful before waiting for the large list to complete. |

If progressive rendering is needed, yield execution between long tasks without delaying the initial list needed on screen. Use [`scheduler.yield` and splitting long tasks](https://web.dev/articles/optimize-long-tasks) with a fallback depending on support. The response contract must include server sort order, representative-file determination, cache version, cancellation, errors, and whether the list is complete.

Validation separates click → request → response headers → first chunk → full parsing → first child display, and also records server listing, permission-filtering, and serialization times. The existing `tree.list` in `MEW_PERF_LOG` alone cannot assess permission filtering, transfer, or rendering. Compare direct HTTP versus P2P, new versus cached fetches, unrestricted accounts versus accounts with permission exceptions, and PCs versus phones.

Acceptance criteria for the first improvement are 1 initial fetch per folder, 1 revalidation of a saved open list, retention of existing rows during ordinary updates, and retention of unrelated caches when the root updates. Large lists must mount only rows near the viewport while preserving ancestor pinning, focus, dragging, and scroll restoration. Actual p95 targets should use the existing [explorer performance design](../work/sidebar-explorer-search-performance.md) values of 80 ms for cached expansion and 250 ms for new expansion as the baseline, with transfer time evaluated separately when external-network RTT is high.
