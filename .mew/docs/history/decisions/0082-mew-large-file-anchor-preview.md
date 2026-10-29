---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: For large plain files in mew, read around the target line first and edit after receiving the full content. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0082 — For large plain files in mew, read around the target line first and edit after receiving the full content"
created: 2026-08-26
updated: 2026-08-26
---

- Date: 2026-08-26
- Status: Adopted
- Decision maker: Song Sanghoon (directive)

## Background

The existing `/api/file` synchronously read the entire file and sent the full string to the browser, and CodeMirror navigated to the search result's target line only after creating the entire document. For large plain files, users actually want to see the target line first, so transferring and creating the entire document unnecessarily blocks the initial display.

## Decision

For large plain files with a target line, such as search results, first fetch a slice around the target line using a range request to `/api/file`. The server response includes the returned line range and file version (size + mtime). The initial slice starts approximately 10% before the target line, and the client immediately displays it as a read-only plain preview. The server does not scan to the end of the file to obtain the total line count for the initial response; the count is finalized after the subsequent transition to the full content. The full-content request then starts asynchronously, and on completion, the client atomically switches to the existing editing, collaboration, and comment paths.

- The initial scope covers only plain files within the project and navigation from search results. Markdown Hotview, external files, media, and collaborative documents retain the existing full-content path.
- The partial preview does not initiate saving, input, comment anchors, or collaboration. Do not create a path that saves and thereby deletes content that has not yet been received.
- The server classifies files of 512 KiB or larger as large files. Range requests for smaller files return a compatible full-content response.
- Cache the content after receiving it in full. Do not cache only a slice and restore an incomplete document the next time it is opened.

## Rationale

This boundary avoids the transfer and full-document creation costs that precede CodeMirror's DOM viewport optimization. Because partial state is not treated as an editable document or a Yjs room, it also leaves the room lifecycle and synchronization invariants in [ADR 0035](0035-mew-collab-rooms-rust-yrs.md) unchanged. The file version is the minimum contract needed to identify a delayed full response or a file change.

## Results

- The full-content path remains in use when opening a large file with a normal click or when there is no target line.
- The initial range implementation uses asynchronous reads on the server. A line offset index, adjacent chunk `0,+1,-1` supplementation, and a placeholder scrollbar will be considered as separate extensions after measurements confirm that the initial preview is sufficiently faster.
- If the preview and full response have different versions, retain the preview and apply only the latest full response. Do not concatenate partial slices and save them.
