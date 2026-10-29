---
title: "mew File Opening Performance Improvement Criteria"
created: 2026-08-25
updated: 2026-10-18
description: "Preserves the existing performance investigation into file opening, tab restoration, and collaboration readiness, along with the design for displaying large files first. Connects the implementation and synthetic measurements of conditional retrieval, asynchronous caching, and parallel collaboration connection preparation on 2026-10-18 with the remaining conditions for authenticated production measurements and the current retrieval contract."
---

This document is a reference outlining the current diagnosis and execution sequence for reducing perceived delays when opening files in mew. Storage and cache architectures that have not yet been adopted are not considered decisions. If implementation changes persistent storage or the collaboration lifecycle model, finalize those changes in a separate ADR.

## 2026-10-18 Parallel Collaboration Connection Preparation

Changed the collaboration socket, which previously started after the active file's content request completed, to prepare in parallel. Before the file response is verified, the prepared document is neither passed to the editor nor seeded with cached content. A CDP exception breakpoint revealed an error in which seeding targeted a destroyed Tiptap editor when preparation finished first (`editor.isDestroyed=true`, `collab.synced=true`). Resolved it by replacing the editor using a React key specific to each collaboration document. The current contracts follow [File Retrieval](../development/file-loading.md) and [Collaboration](../development/collaboration.md); the tradeoffs and choice among caching, hover prefetching, and retaining editors follow [ADR 0014](../decisions/0014-parallel-file-collaboration.md).

Connected to `mew.liiiiv.life` using actual Chromium; the public page returned 200, and unauthenticated file retrieval returned 403. Without login credentials, click-to-body-display and collaboration completion times for production documents could not be collected. No production build or restart was performed.

`node server/file-open-performance-benchmark.mjs` builds a separate test bundle in memory and intercepts only same-origin browser requests to compare synthetic documents and responses. This does not measure actual production API performance. It uses 60-paragraph Markdown, Chromium 153, Node 22, production React, and 7 runs per condition, alternating serial/parallel order. Because the comparison uses the same code with only connection preparation reverted to serial order, it is also not an A/B comparison against the entire production deployment. CSS is only read from the existing dist; dist and the server are not changed.

| Delay for each synthetic HTTP and WebSocket connection | Median serial preparation | Median parallel preparation | Reduction |
| --- | ---: | ---: | ---: |
| 180ms | 526ms | 325ms | Approximately 38% |
| 400ms | 944ms | 527ms | Approximately 44% |

The metrics above cover the time from the click until the editor with the collaboration extension connected was confirmed to have content and be editable, followed by two rAFs. They are not actual paint timestamps or field INP. Under the 180ms condition, the frame where the initial content DOM was observed occurred at 288ms for serial preparation and 306ms for parallel preparation. **This does not show that the initial text itself appeared faster**; final readiness time decreased, including the interval in which content briefly appeared before being replaced during collaboration initialization. These results alone do not establish that users' production loading times were halved.

Browser tests verified the absence of update frames before cache validation, read-only initial display, external changes, permission revocation, cleanup of prepared connections, and prevention of previous-document exposure during reconnection and path switching. In extended checks, the keyboard and workspace cases in `workspace-switch-ui.test.ts` timed out while waiting for new-document input/`Select extra.md`. That fixture replaces EditorPane with a stub. These failures remain unresolved and are separate from the successful editor and collaboration verification in this change.

## 2026-10-17 Follow-up Implementation

Implemented conditional content retrieval, per-root memory cache retention, and asynchronous IndexedDB storage. Cached content is displayed read-only before the response, and editing and collaboration start after permissions and freshness are verified. Total byte calculation in the status bar is deferred until after the first paint, and duplicate updates to identical tab state and save metadata have been reduced. Current contracts, limits, and verification follow [File Content Retrieval and Cache Restoration](../development/file-loading.md); the rationale follows [ADR 0013](../decisions/0013-file-content-revalidation.md). The 2026-08 investigation and unadopted follow-up designs below are preserved as records from that time.

## Break Down the Stages

Do not lump "file opening" into a single duration.

| Stage | Start | Completion |
| --- | --- | --- |
| Cold open | Click a file that has not yet been opened | First frame in which the content can be interacted with |
| Cached open | Click a file with cached content | Frame in which the cached content can be interacted with |
| Open tab switch | Select an already open tab | Frame in which that tab can be interacted with |
| Session restoration | Refresh or restart | Frame in which the active tab in each pane can be interacted with |
| Collaboration readiness | Select the active file | Point at which remote changes can be sent and received |

Also separate the time until content is first visible from the time until collaboration synchronization completes. Independently assess whether cached content and the editor shell can be shown first even if collaboration preparation is slow.

## Current Paths and Potential Bottlenecks

Based on the code as of 2026-08-25. The paths below were identified through static code inspection; performance instrumentation must establish how much each bottleneck actually contributes.

### Tab State and Restoration

- `openFileIn` in `src/hooks/useTabs.ts` reads the content cache synchronously, creates tab state first, and then requests `/api/file` and `/api/rules` in parallel.
- Since 2026-08-26, content, rules, and save state updates change only panes with the same path open. Object identity is preserved for other panes and tabs, so one file response does not trigger an app-wide rerender. If the same path is open in multiple panes, only those panes are updated together.
- Session restoration immediately restores all tab shells, ordering, layout, and cached content. Since 2026-08-26, content and rules requests are sent immediately only for the active tab in each pane. Inactive tabs remain in the `deferredLoad` state and are read through the existing full-content path when the user selects them. An idle prefetch queue has not yet been added.
- Whenever `states` changes, open-tab metadata reserializes all projects, panes, and tabs and writes them to `localStorage`.

### Content Cache

- `src/utils/contentCache.ts` places `localStorage` behind an in-memory LRU. Disk-layer `getItem`, JSON parsing, serialization, and `setItem` are all synchronous main-thread operations.
- Up to 512 KiB of content may be parsed in the click path, and content and LRU order are also written synchronously when fetch completes and during autosave.
- The cache has no modification time, version, or ETag. Even when cached content is rendered first, the full content is requested again every time.

### Editor and Collaboration

- `src/components/EditorPane.tsx` renders only the active file in the editor. When switching files, plain replaces the CodeMirror document or rebuilds its configuration, while Hotview reapplies the Markdown to the ProseMirror document.
- The editable main view creates a new `Y.Doc`, awareness, and WebSocket in `useCollab` for each active file. When `collab.ydoc` changes, Hotview's `useEditor` recreates the editor, including all extensions, because of the per-file Y.XmlFragment binding.
- Comments are also loaded separately when switching files. The content byte count is calculated by traversing the entire content again with `TextEncoder`.
- Scroll restoration may inspect the editor DOM and height for up to 600 frames to preserve the saved position. The feature itself is the current decision in [ADR 0038](../history/decisions/0038-mew-scroll-restore-on-reload.md) and [ADR 0039](../history/decisions/0039-mew-scroll-restore-on-tab-switch.md).

### Server Requests

- `/api/file` reads content with synchronous `readFileSync`. Small local files usually take little time, but large files or slow filesystems can block the Node event loop.
- `/api/rules` synchronously checks MOC coverage and file links. Overall coverage is reused with a TTL of 3 seconds, but the first request after expiration scans the docs tree, and individual file links are checked every time.
- File content, rules, and comments arrive through separate responses and state updates. Rules and comments are not prerequisites for the initial content display.

## Display the Focus Area First in Large Files (Follow-up Design)

Since 2026-08-26, plain files of at least 512 KiB with a known target line, such as search results, first receive 400 lines around the target through an anchor request to `/api/file`. The server reads only through an async stream until the end of that range, and the client immediately displays a read-only CodeMirror preview with actual global line numbers. The full-content request starts after the preview, and only when it completes does the client switch to the existing cache, editing, collaboration, and comments path. [ADR 0082](../history/decisions/0082-mew-large-file-anchor-preview.md) defines the contract's rationale and boundaries.

Chunk replenishment in `0, +1, -1 …` order and a full scrollbar placeholder are not yet implemented. Only stage 1, which quickly shows the first preview and then safely switches to the full document, has been applied. CodeMirror limits the DOM to the screen viewport **after the full document is ready**, but does not reduce the upfront costs of network transfer, document creation, or syntax processing. Markdown Hotview must parse the entire source into a ProseMirror document, making the same benefit harder to achieve.

The goal, for example, when opening `abc.md:1536`, is to first show line 1536 about 10% from the top of the screen and asynchronously fill in nearby chunks in `0, +1, -1, +2, -2 …` order. This section is a **candidate follow-up design** for that behavior, not yet an adopted decision on API or collaboration contracts.

### Scope and Entry Conditions

- Initially, use this only when a target line already exists, such as a saved scroll position, search result, or `경로:줄` link. If there is no target or the file is small, the existing full-content path is simpler and faster.
- The initial scope is limited to sufficiently large **non-collaborative plain text**. Markdown Hotview, collaborative documents being edited, and external files retain the full-content path.
- Determine size and line-count thresholds through measurement. Splitting small documents makes request, state, and placeholder costs exceed the benefits.
- Consistency must be maintained when a file changes, even if the focus chunk can be read immediately. Bind all chunk responses to the same file version (at minimum mtime and size, preferably ETag). If the version changes, discard partial state and restart with the latest full content or a new chunk session for the latest version.

### Transfer and Replenishment Order

1. The client supplies `path`, `anchorLine`, and `chunkLines`, and the server returns the first chunk containing the anchor along with `totalLines`, the version, and the returned line range. The first chunk leaves about 10% of its space above the anchor.
2. The view uses estimated-height placeholders for the missing sections before and after the loaded content and displays the first chunk immediately. Scrollbar proportions are approximated from the total line count and observed average line height, and adjusted only when actual line heights are known.
3. A single cancelable queue requests adjacent chunks in `0, +1, -1, +2, -2 …` order. If the user scrolls in the opposite direction, prioritize that direction. Cancel remaining requests when switching tabs or projects or when the file version changes.
4. Once enough contiguous chunks complete the full file, switch once to normal CodeMirror state. This transition preserves scroll position and selection, and enables editing, comments, lint, and collaboration only after preparation is complete.

If the server scans text from the beginning of the file to the anchor for every chunk, large files gain no benefit. Before actual adoption, therefore, verify a line-offset index that preserves safe UTF-8 boundaries and CRLF (an in-memory cache tied to the file version), or an equivalent range-reading method. Do not add persistence or sharing for this index without a separate decision.

### Editing, Collaboration, and Correctness Boundaries

- A partial document is not a complete document model. In the first version, it is a read-only preview; if the user starts typing, commenting, finding and replacing, or shared editing, hand off to the existing path after the full content is complete. Saving partial state must never delete content that has not yet been received.
- Yjs/ProseMirror collaboration assumes a complete document with stable positions and structure. Do not put a partial document directly into a collaboration room. Changing this requires a new ADR first, including a review of the lifecycle and synchronization boundaries in [ADR 0035](../history/decisions/0035-mew-collab-rooms-rust-yrs.md).
- In Markdown, preceding frontmatter, lists, or code fences can determine the structure near the anchor. Because complete structure cannot be guaranteed, partial parsing for Hotview is excluded from the initial scope.
- Search-result line numbers, selection positions, and scroll restoration remain based on full-file line numbers. Placeholders are not actual text and therefore cannot be copied, selected, or used as comment anchors.

### Pre-adoption Verification and Stop Criteria

- Performance samples include large plain files, anchors at the beginning, middle, and end, rapid tab switching, file modifications, and network cancellations. Compare first anchor paint and full-document readiness time separately against the existing full read.
- Do not adopt this if first anchor paint does not become significantly faster, placeholder height adjustments cause visible jumps, or memory use or request counts exceed the full-content path. Record the results and whether to retry in this document or an ADR.
- Write a new ADR before adopting the range retrieval API, partial document state, and editing transition as actual product contracts, because this choice changes the file transfer protocol and collaboration/storage invariants.

## Improvement Priorities

### 1. Restore the active tab first

At session start, restore tab paths, ordering, and layout immediately, but initially read content and rules only for the active tab in each pane. Load inactive tabs when the user selects them, or prefetch them during idle time with low concurrency after the initial view stabilizes.

This change eliminates contention from initial requests, Markdown parsing, and state updates that scaled with the number of restored tabs. In the first implementation, limit prefetching to a cancelable queue with concurrency of 1–2, and discard remaining prefetches when switching projects.

**Status (2026-08-26):** Active-tab-first restoration and deferred loading on selection have been implemented. Idle prefetching and a cancellation queue for inactive tabs will be added after instrumentation confirms actual benefits and whether contention occurs. Initial content request counts therefore scale with the number of active panes rather than all open tabs.

### 2. Reduce prerequisites for the first display

Immediately after a click, only the active path, content, and editor are needed. Load rule badges and comments after the first interactive frame. Decide whether to combine `/file` and `/rules` after measurement; even if combined, rule computation must not delay the content response.

Content, editable, and rules updates for one file change only the affected panes and tabs, preserving state objects when values are unchanged. Narrow rendering boundaries so that `EditorPane`, the sidebar, and tool panels also avoid rerendering when their relevant props have not changed.

**Status (2026-08-26):** File response, rules, save, and revert updates in `useTabs` have been scoped to the path. When opening a file, panes without that path reuse their existing state objects.

### 3. Remove synchronous persistent caching from the click path

Keep the in-memory LRU for immediate display. Evaluate asynchronous storage candidates such as IndexedDB for content caching across refreshes; if adopted, preserve the current identity and project isolation. Also consider having the server provide modification times or ETags so it does not resend full content when the cache is current.

Finalize storage changes in a separate decision after measurement and fallback design. IndexedDB or migration failures must not block file opening or saving.

### 4. Reduce editor preparation costs

- Measure Markdown parsing, CodeMirror state construction, and comment decoration application separately, and reduce the largest stage first.
- For non-collaborative tabs, consider whether parsing results or editor state for recent documents can be reused through a bounded LRU.
- Do not keep sockets or Y.Doc alive for inactive collaborative tabs. [ADR 0035](../history/decisions/0035-mew-collab-rooms-rust-yrs.md) prohibited retrying socket pooling because of room counts, ghost cursors, and lifecycle cleanup issues. Keeping recent collaborative tabs fully alive requires a new decision superseding this ADR first.
- Defer content byte calculation until after the first frame that accepts input, or calculate it incrementally.

### 5. Verify displaying the area around focus first in large files

Validate the design above only when measurements from stages 1–4 show that full-content transfer and creation costs dominate for large plain files. Use a small experiment to establish applicability, read-only transitions, cancellation, and version consistency without complicating all normal file opening.

**Status (2026-08-26):** Stage 1 of anchor preview has been implemented for large plain files in search results. The server's first range stream returns 400 lines starting about 10% before the target line, after which the full-content response opens the existing editor. Adjacent-chunk prioritization and placeholder scrolling will be expanded after confirming that actual first-paint measurements for this stage improve sufficiently.

### 6. Replace scroll restoration polling

Retain scroll position restoration. Combine editor readiness signals, collaboration sync completion, and `ResizeObserver` to retry only when height changes, eliminating the path that queries the DOM every frame up to 600 times. Lock in the outcomes of ADR 0038 and 0039 with regression tests that preserve position during tab switching, split-pane remounts, and late-loading images.

**Status (2026-08-26):** Replaced `EditorPane`'s 600-iteration rAF polling with `MutationObserver` + `ResizeObserver`. The saved position is reapplied only when the scroll host or actual editor body appears or changes height, and the observers are disconnected after about 10 seconds even if sync never arrives.

## Instrumentation and completion criteria

Before optimizing, record at least the following points using the browser Performance API and React Profiler.

1. File click
2. Memory and persistent caches ready
3. `/file` response
4. Editor creation and body application
5. First interactive paint
6. Collaboration sync complete
7. Rules and comments complete

**Status (2026-08-26):** Implemented 1–5 as `mew:file-open:<id>:<phase>` Performance marks/measures. DevTools Performance or `performance.getEntriesByType('measure')` can compare elapsed times to `cache-ready`, `file-response`, `editor-ready`, and `first-paint`. `/api/rules` and `/api/comments` start after the first paint and record `rules-response` and `comments-response`, respectively. The collaboration sync completion mark remains a follow-up task that does not block completion.

Record p50 and p95 for cold opens, cached opens, switching between open tabs, and restoring sessions with multiple tabs, each broken down by Markdown/plain and small/large files. Set numeric targets after establishing a baseline. Do not declare completion based on being "faster" without meeting the following conditions.

- The initial display for cached opens and switching between open tabs does not wait for a network response.
- The number of initial body requests during session restoration is proportional to the number of active panes, rather than the total number of tabs.
- There are no Long Tasks caused by processing body content in `localStorage` between the click and the first interactive paint.
- Rules or comments failing or being delayed does not block body display.
- Remote content, awareness, autosave, and per-tab scroll restoration for collaborative documents continue to work.

## Recommended work units

1. Add instrumentation only to establish a baseline
2. Restore active tabs first and lazy-load on selection (implemented); consider limited idle prefetching after instrumentation
3. Defer rules and comments and narrow the scope of tab state updates
4. Validate and decide on asynchronous body caching and conditional server requests
5. Validate displaying the area around the focus first for large plain files (implement after an ADR if needed)
6. Optimize editor preparation costs and scroll restoration polling

Split the work so each stage allows independent before-and-after measurement and can be reverted if regressions occur.
