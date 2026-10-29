---
title: "ADR 0014: Preparing File Retrieval and Collaboration Connections in Parallel"
description: "Decision to prepare content retrieval and a permission-checked collaboration connection for the active file in parallel, but connect it to the editor only after file verification. Records cache seeding prevention, document identity, editor replacement, and remaining conditions for production measurements."
created: 2026-10-18
updated: 2026-10-18
---

# ADR 0014: Preparing File Retrieval and Collaboration Connections in Parallel

## Background

[ADR 0013](0013-file-content-revalidation.md) displays the cache read-only first and starts collaboration after verifying file content and permissions. This sequence accumulates the waits for content requests and collaboration connections serially. Reducing cached content transfers still leaves both waits for a document opened for the first time.

## Decision

For ordinary files opened by a logged-in user in the active main editor view, prepare the content request and collaboration connection in parallel. The socket remains subject to the existing server checks for collaboration functionality and file editing permissions. Do not pass the unverified Y.Doc to the editor or seed, edit, or autosave it with local content. Connect it only when the file response confirms the content and editing permissions. Clean up the connection on retrieval failure, lack of editing permission, tab switching, or unmounting.

This does not apply to guests, media, external files, archives, inactive restored tabs, or anchor preview. Do not create pools of collaboration sockets or inactive editors. Preserve the wire format and server permission and storage contracts. Retain ADR 0013's prohibition on modification and seeding before cache verification, and supplement only the connection preparation sequence.

The collaboration hook returns only documents matching the current project, path, and account. Hotview remounts the editor using a React key when the collaboration document changes. This prevents a race that seeds a discarded previous editor when synchronization completes before the file response.

## Approaches Compared

- Caching and conditional content retrieval: Already implemented and reduces transfer volume on return visits. The collaboration wait remains on cold opens.
- Hover prefetching: Can prepare before a click, but offers little benefit for touch input and increases requests for files that will not be read. Not adopted this time.
- Keeping inactive collaboration editors: Reduces creation costs on return visits, but requires changing room, socket, and memory lifetimes and the existing decision against pooling. Not adopted this time.
- Parallel preparation for the active file: Chosen because it overlaps two network waits without increasing the number of request targets. However, a file found to be uneditable may incur one additional preparatory connection.

## Verification Boundaries

`server/editor-file-cache-ui.test.ts` verifies cached content reading, modification blocking, and the absence of collaboration update frames before verification; connection and editing after verification; external changes, permission revocation, and cleanup of preparatory connections. `server/collab-reconnect-ui.test.ts` owns reconnection checks.

`server/file-open-performance-benchmark.mjs` reports actual public URL connectivity and synthetic latency experiments separately. Synthetic experiments intercept browser requests and use separate sample documents and HTTP and WebSocket responses. These are not results from opening actual documents after logging into the deployed site. No production build or restart is performed; production performance verification after login and user application remains outstanding.
