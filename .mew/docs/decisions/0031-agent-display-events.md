---
title: "Separating browser conversation display from original tool data"
description: "Decision to preserve ACP and server transcripts and project tool events into display fields. Defines sequence numbers and an advance-display budget; subsequent decision 0043 adds projection before IPC and lazy retrieval of thoughts and tool calls."
created: 2026-10-20
updated: 2026-10-22
---

## Status

Accepted. Implementation and isolated verification are distinct from production rollout. Local server changes take effect after the corresponding running instance is updated.

The [subsequent decision 0043](0043-agent-work-details-loading.md) moves projection to before supervisor IPC and lazily fetches task details for display. It supersedes the determination below that a separate detail lookup is unnecessary within that scope, while retaining source preservation and display field restrictions.

## Background

The agent panel displays tool execution IDs, titles, and statuses, but also included raw inputs and outputs sent by ACP in conversation events transmitted to the browser. A read-only examination of 20 recently saved transcripts found that tool events accounted for approximately 91% of all bytes. The policy of sending the most recent 20 questions does not limit the size of tool results included in a single question.

Conversation sequence numbers are the basis for reconnection, fetching earlier segments, and device caches. Deleting or merging events breaks this contract and restoration in existing browsers. Reducing the ACP source also affects provider context and server restoration.

## Decision

A shared pure function projects `update` of `tool_call` and `tool_call_update` into `sessionUpdate`, `toolCallId`, `title`, `status`, and `kind`. Outer event fields and other events, including user, answer, thought, approval, and settings events, are retained. Source objects, SQLite, and the supervisor's ACP events are not changed.

Apply the same projection to segment history, early display, live events, and legacy replay at the single browser WebSocket send boundary. Preserve event count, order, generation, global sequence numbers, and segment boundaries. Existing browsers render the same screen using the display fields they already use.

The early-display Worker also projects source rows immediately after reading them and accumulates only projected copies. Output byte limits and source read and single-row limits apply separately. Even when the source contains large tool results, a small display segment can be shown early; if time, memory, or read budgets are exceeded, it falls back to existing ACP restoration. [Conversation storage](../development/conversation-storage.md) owns the specific limits and storage and restoration contracts.

## Rationale and Impact

Keeping only display fields in the read-only sample reduced the source from approximately 62.2MB to approximately 7.36MB, and conversation assembly results were identical in all 20 cases. These figures do not measure full-screen loading times for actual accounts or improvement rates over external networks.

The current UI does not display raw tool inputs and outputs, so no separate detail lookup API will be added. When building a feature that displays raw results in the future, define separate authorization, lookup, and size contracts before adding the source back into existing transmissions.
