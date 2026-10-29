---
title: "Displaying Agent Conversations First and Deferring Work Detail Retrieval"
description: "Display questions and answers from the most recent 3 turns first, and separate thinking and tool calls using markers that preserve sequence positions, bounded background retrieval, and retrieval on expansion. Defines projection before IPC, retrieval from memory, compatibility with older supervisors, and the boundaries of verification and production application."
created: 2026-10-22
updated: 2026-10-22
---

## Status

Adopted. Implementation and isolated verification are complete; the user applies the production build and server restart.

## Background

[Decision 0031](0031-agent-display-events.md) excluded raw tool results, but thinking and tool calls from the most recent 20 turns were still transmitted and assembled even when collapsed. The supervisor reparsed events it already held from SQLite, sent large originals through internal IPC, and only reduced them for display at the WS stage.

There is no need to wait for details before reading questions and answers. However, simply deleting events can change reconnect cursors, caches, and bubble keys, and can miss late tool status updates.

## Decision

A new view starts with the most recent 3 turns and reads earlier segments on scroll. Only connections with confirmed supervisor capability send consecutive segments of thinking and tool calls as markers carrying the original event count. The browser preserves sequence slots and assembles only the positions of details. Small tool status updates and real-time events are forwarded immediately in display form.

After the initial display, prefetch details for visible tabs with bounded concurrency, prioritizing expanded turns. Keep background results in memory and fill the corresponding markers on expansion. Retrieval checks the current generation within the existing authenticated tab WS and supervisor IPC, with limits on segments, bytes, and time, plus retries. Connection or generation replacement invalidates stale retrievals.

The supervisor converts segments in memory to display form and removes original tool results before IPC transmission. Older supervisors retain the existing path. Preserve SQLite and ACP originals and execution context; do not add a separate DB schema or raw tool result retrieval API. [Conversation Storage](../development/conversation-storage.md#lazy-loading-of-collapsed-work-details) owns the specific contract and figures.

## Rationale and Impact

Excluding thinking and tool content hidden on the initial screen reduces retrieval, transmission, parsing, and assembly costs. Adding bounded prefetching to retrieval on detail expansion also reduces the wait immediately after the user expands details. Hidden tabs stop new requests to avoid competing with other work for communication resources.

Synthetic comparisons and isolated server and browser checks verified reduced transmission, sequence positions, duplicates, late responses, and error recovery. Actual Mewlink connection times and provider ACP restoration times were not measured. Cases where a single question or answer is itself large, original-data reads by the preview Worker, and the supervisor's total memory usage are outside this change's upper-bound guarantees.
