---
title: "File body retrieval and cache restoration"
description: "Defines the contract for skipping body retransmission through file version checks and displaying project-specific memory and IndexedDB caches first. Describes retaining a read-only body while waiting for collaboration sync, seeding empty rooms, permission rechecks and protection against external changes, transparent loading layers and file error display, and the scope of performance instrumentation and verification."
created: 2026-10-17
updated: 2026-10-26
---

# File body retrieval and cache restoration

`useTabs` displays the body before the server responds when a cache is available. It remains read-only while the latest version and current permissions are checked, then applies the server’s edit permission once verification finishes. Display completion and readiness for editing and collaboration occur at different times. The rationale for storage and transport choices is in [ADR 0013](../decisions/0013-file-content-revalidation.md).

## Body retrieval

`GET /api/file?project=<scope>&path=<relative>` returns the full body along with `editable`, `version`, and `partial:false`. `version` includes `size`, `mtimeMs`, `ctimeMs`, and an opaque `tag`. The server computes the tag from the absolute path, device, inode, size, modification time, and change time. Files with the same name under different roots and files rewritten with the same size and modification time are not treated as the same version.

If the cache contains a body and tag pair received in the same server response, the client adds `version=<tag>`. On a match, the server returns `{path,editable,version,partial:false,unchanged:true}` without reading the body. The status code is 200 so HTTP and P2P use the same JSON contract. The client incorporates the cached body only when the response tag matches the request tag. An unchanged response with a mismatched tag triggers one retry with an unconditional request.

Every request rechecks read and edit permissions. Read permission is also checked after asynchronous reads; revoked permissions and deleted files are not treated as successful results using an old cache. Changed files are read in full asynchronously, and versions are compared before and after reading. If the file remains unstable after up to three reads, the reusable tag is omitted so the next request receives the full body. A tag is neither a cryptographic hash of the file contents nor a lock, and does not replace the existing body comparison check when saving.

## Project-specific cache

The synchronous `getCachedFile` in `src/utils/contentCache.ts` reads only memory. Memory is partitioned by browser storage scope, account, absolute root, API project, and file path, and maintains an LRU with a total maximum of 20 entries. Switching roots does not discard recent bodies from other roots.

`loadCachedFile` restores asynchronously from the scoped IndexedDB `mew-file-content`. Bodies and management metadata reside in separate object stores so budget checks do not clone every body. Disk limits are 2 MiB and 256 entries per DB, 40 entries per account/root, and 256 KiB per entry, with a maximum body length of 128 Ki UTF-16 code units. Entries older than 7 days since writing are not reused. P2P DB names follow the existing account and instance scope, so this budget also applies per DB. This limit is not combined with localStorage’s origin-wide budget.

`putCachedFile` updates memory immediately and delegates persistent storage to a separate task. Pending writes for the same file are coalesced to the latest value. Body serialization, storage, and cleanup of old entries do not run in file-click or response-application calls. Updates using a body without a server version, such as autosave updates, do not attach the previous tag.

Existing `mew:content:*` values are migrated asynchronously after validating their recorded timestamps and entry sizes, and only successfully migrated originals are deleted. Undated or expired caches are not reused. File opening continues even if IndexedDB is blocked or fails; a cold cache lookup waits at most 40 ms before proceeding to a server request. The body cache is not a draft store, so it does not delete server files, unsent drafts, or settings. The [browser storage contract](browser-storage.md) defines the boundaries with other caches and user settings.

Pending writes and deletions retain the DB and root from when they were scheduled. Logout, account changes, and explicit cache resets invalidate in-progress reads and previous writes. Late reads and stale writes must not restore cached bodies after deletion.

## Screen restoration and change protection

Restoration creates the paths, order, and splits for all tabs and retrieves only the active tab in each pane. Tabs with cached content are displayed with `loading:false` and `revalidating:true`, without a loading layer obscuring the body. Editing, autosave, collaboration seeding, DB page subscriptions, and comment operations do not start during verification. For logged-in users, the active main editor prepares body retrieval and the collaboration socket connection in parallel. The server separately checks collaboration capability and file edit permission for the socket, and the Y.Doc is connected to the editor only after the file response confirms the body and edit permission and the collaboration document’s initial sync completes. While waiting for sync, the local body remains read-only so an empty collaboration document cannot erase the displayed body and input entered while waiting cannot be replaced by remote state. Prepared connections are cleaned up if file retrieval fails, the file is deemed uneditable, or the tab changes. Guests, media, external files, archives, inactive restored tabs, and anchor preview are excluded from preparation. [ADR 0014](../decisions/0014-parallel-file-collaboration.md) supplements the preparation order in the existing ADR 0013. Without a cache, a transparent loading layer shows a three-dot indicator using the theme’s text color. The editor background is not covered in black during loading, and body input is blocked.

Full responses are applied only when they match the current root’s transition generation and file request order. If another path changes the buffer during a read, that content is preserved; if the server body has also changed, the existing save baseline and error state are retained. External changes are not autosaved over with stale cached content. Permission or retrieval errors remove the displayed body and cache and report the error.

File errors appear with `role="alert"` inside the editor containing the affected tab, rather than in the app’s top header. Files that cannot be edited because retrieval failed show an error instead of the body; save and commit errors for editable files appear above the status bar while preserving the content. Errors remain visible on mobile and are not moved to another tab or the agent screen.

Tab updates with identical values reuse the existing state object. Saving open tabs updates localStorage and the account ledger only when metadata such as paths, order, or views changes. DB frontmatter parsing in `EditorPane` depends only on the relevant body, path, and readiness state, and the status bar’s full UTF-8 size calculation is deferred until after the first paint. Editors and collaboration connections for inactive documents are not kept resident. The collaboration hook returns only documents matching the current project, file, and account.

Hotview recreates the editor instance when the Y.Doc to connect changes. If the room’s body fragment is still empty after initial sync, it is seeded with the verified local body in a layout effect before painting. Before seeding, it checks that the current editor’s Collaboration extension is actually connected to the same Y.Doc, preventing body injection into an old editor left over during replacement. Rooms that already contain a body are not seeded again. Selection and focus restoration information is preserved in the intermediate read-only editor during replacement and restored once editing becomes available.

## Performance instrumentation

On servers with `MEW_PERF_LOG=1`, full body reads record elapsed time and the file size before retrieval (`bytes`) in a `file.read` JSON log. Retries for files changed during reading are included in the same interval. Conditional requests ending with `unchanged` do not read the body and therefore produce no such log. File paths, bodies, and accounts are not included in the fields. This interval excludes network transfer and editor display time.

The browser’s existing `mew:file-open:<id>:<phase>` Performance measure separately measures the interval from the start of file opening to `cache-ready`, `file-response`, `editor-ready`, and `first-paint`. Comparing phases with the same id distinguishes time spent waiting for the server response from editor preparation and display time. Each value is cumulative from the start; request ids are not automatically correlated with server logs. Operators apply the server configuration, build, and restart required to enable instrumentation.

## Verification and scope of application

- `server/file-revalidation.test.ts`: Skipping body reads, rewrites with the same size and mtime, changes and permission revocation during reads, and account/root isolation and deletion.
- `src/api/client-file.test.ts`: Shared P2P retrieval, tag matches and mismatches, and unconditional retries.
- `src/utils/contentCache.test.ts`: Asynchronous storage and restoration in actual Chromium IndexedDB, budgets, expiration, migration, root/account/remote scope transitions, and deletion races.
- `server/editor-file-cache-ui.test.ts`: Displaying cached bodies before responses, read-only mode and modification blocking before verification, editing and collaboration after verification, external changes and permission revocation, and prevention of stale body autosaves.
- `server/editor-collab-handoff-ui.test.ts`: Frame-by-frame body preservation on desktop and mobile with slow collaboration responses, fast sync, existing rooms, and cached reopening; read-only mode and blocked seeding before sync; and resumed editing and autosave after completion.
- `server/tab-cache-state-ui.test.ts`: Continued editing and saving in verified split-screen panes, save buffer protection from late retrievals, retries to save identical metadata after localStorage failures, and prevention of duplicate account notifications.
- `server/editor-pane-ui.test.ts`, `server/workspace-switch-ui.test.ts`: Regressions in cold loading, storage failures, and project screen restoration.

The uncompressed JSON response for a synthetic 100 KiB document decreased from about 102.6 KB to about 0.2 KB for an unchanged response, with 0 body reads for unchanged requests. The isolated browser check verifies that the cached editor completes its first paint while the file response is withheld. These are not measurements of improvements in total transition time for actual projects, large Markdown parsing, or P2P latency over external networks. The user builds and applies the server changes to the running installation.
