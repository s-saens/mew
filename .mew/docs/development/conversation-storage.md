---
title: "Conversation Storage and Range Synchronization"
created: 2026-09-30
updated: "2026-11-04"
description: "Conversation persistence and recovery contracts: SQLite originals and attachments, range/work-detail synchronization, MCP startup diagnostic exclusion, temporary restoration display, per-frame updates, and local prompt feedback. Defines IndexedDB cache and queue scope, limits, and authority, including the 25ms transcript-cache startup gate and parallel queue restoration."
상위파일: "MOC.md"
---

[Session Contract](agent-sessions.md) · [ADR 0182](../history/decisions/0182-mew-incremental-conversation-storage.md) · [Display Tool Events Decision](../decisions/0031-agent-display-events.md) · [Lazy Loading of Work Details Decision](../decisions/0043-agent-work-details-loading.md)

## Server Storage

`server/agentTranscript.ts` stores `sessions` and `events` in `<DATA_DIR>/agent-transcripts/transcripts.sqlite`, using the existing Node built-in `node:sqlite` without a separate DB server or new dependency.

| Storage property | Contract |
| --- | --- |
| Session key | SHA-256(runtime, cwd, sessionId) |
| Event primary key | `(session_key, seq)` |
| Directory / DB file permissions | 0700 / 0600 |
| Schema | `user_version=1`; higher versions are not written to |

The DB resides on local disk on the same host and uses WAL, `synchronous=FULL`, and a 1-second busy timeout.

| Save condition | Behavior |
| --- | --- |
| Normal streaming | Batch saves 250ms after the first unsaved event |
| Turn completion or shutdown | Save immediately |
| Same append-only event array | Do not serialize or INSERT already recorded prefixes again |
| Array replaced by ACP restoration or another operation | Replace session records in a single transaction |
| Identical content | Skip the DB update |

**Attachments.** New messages and queued executions record every attachment's `project`, `path`, and `mimeType` in a `user_attachments` event immediately after the user body. Exclude image bytes; retrieve originals using the stored attachment scope regardless of current document scope. Also read legacy `user_images` events without attachment metadata. Range retrieval, device caching, and early transcript display retain the attachment event with the body.

WS validation accepts current `.mew/assets/` and legacy `.mew/files/` upload paths for attachments and image references. Apply the same rules to new messages, attachment-only messages, and queue edits so uploaded metadata reaches the supervisor.

Reuse prepared retrieval, insertion, and replacement SQL statements until the DB connection closes, then release them. The schema, save interval, durability, revision checks for other writers, and restoration semantics remain unchanged.

**Migration and failures.** If the first retrieval finds no session row, check the version 2, session key, and event array in the existing `<hash>.json`. Do not migrate incomplete v1 transcripts or delete/overwrite the JSON. It preserves the original at migration time; new DB changes are not reverse-synchronized into a rollback copy.

Log corruption, locking, and capacity errors; failed transactions preserve prior records. Revision and count checks prevent stale append buffers from overwriting another writer's updates. Save failures do not stop conversations: retry the unsaved tail at subsequent save opportunities.

**Authority and limits.** Provider ACP history is authoritative for agent context. External CLI changes, settings, and completion times follow the [Session Restoration Contract](agent-sessions.md#messages-reconnection-and-queues). SQLite holds Mew's display transcript without modifying provider storage. The supervisor still retains the full current event array and reconciles the entire history during ACP restoration; neither provider restoration time nor an overall supervisor memory limit is guaranteed.

## Ranges and Connections

`shared/agent-history.ts` uses `[start, end)` ranges. Supervisor creation or transcript replacement starts a new generation and incrementally indexes current question boundaries.

| Request | Turn range |
| --- | --- |
| New screen: `history=1&deferWork=1&turns=3` | Latest **3 questions and their associated answers** |
| Earlier ranges | Batches of 3 turns |
| `turns` | 1 to 20; clients omitting it receive the latest 20 turns |

Do not split consecutive chunks and answers for one question. Turn count alone therefore does not bound the bytes in large questions or answers.

- WS `history=1&generation=...&after=...` sends the last sequence number actually held. Send only the new tail as `append` if the generation matches and the number is valid within the recent range; otherwise send that range as `replace`.
- The `history` response contains session ID, generation, start/end/total, preceding question count (`usersBefore`), events, and current model/permission/thinking controls.
- `{type:'history', range:{generation,before:start}}` requests the immediately preceding range as `prepend`. The supervisor slices its existing in-memory range and converts it for display, without repeatedly retrieving/parsing original JSON from SQLite.
- Real-time `history_event` includes `{generation,seq}`. The browser ignores duplicates and rerequests the recent range on gaps or generation changes. Record sequence numbers in memory before screen state, preserving cursors during rapid reconnections.
- Negotiate through supervisor hello capabilities and subscribe. Older clients receive full replay; older supervisors keep the existing replay path. A running older supervisor may send full history until replaced.
- Retrieve only through existing tab WS/supervisor IPC, rechecking authentication and feature permissions. There is no public retrieval API accepting arbitrary session keys. Failed automatic restoration preserves the original tab pointer and device transcript.

Binary search of the question boundary array finds the preceding range and `usersBefore`. It preserves range/question boundaries while avoiding a prefix scan proportional to turn count on every request.

### Display Tool Events

For browser copies, `shared/agent-display.ts` reduces `update` in `tool_call` and `tool_call_update` to the screen's `sessionUpdate`, `toolCallId`, `title`, `status`, and `kind` fields. Omit raw tool inputs/outputs, result bodies, and unused locations. Preserve settings and other data outside events; pass user messages, answers, approval requests, errors, and controls unchanged. Lazy work-detail loading likewise sends display fields without raw tool results.

Reduce data first at the `server/agentHost.ts` IPC send boundary, avoiding serialization of large originals between supervisor and server. Keep the same transformation in the shared send function of `server/agentWs.ts`, after authentication/permission checks, for `history`, full `replay`, and individual events from older supervisors. Preserve order, generation, sequence numbers, range boundaries, and restoration failure information.

SQLite transcripts, supervisor memory, and provider ACP history retain originals. Display conversion neither mutates original objects nor participates in provider restoration, context, or tool execution. It reduces transfer volume for large tool results, without guaranteeing total transfer volume or initial display time for large questions/answers.

**MCP startup diagnostics.** Codex ACP reports asynchronous server startup failures/cancellations as `tool_call` or `tool_call_update` with reserved `mcp_startup.*` IDs. These are connection diagnostics, not assistant work for a user request. The display fold ignores them before allocating a conversation turn, both live and during replay. Do not defer them into anonymous `work_pending` markers: retain their identity and one sequence position so the browser can apply the same rule. Preserve original supervisor/SQLite/provider records and ordinary MCP tool calls; genuine assistant text such as “Done” remains visible. Common connection state and recovery stay in the [MCP management contract](shared-mcp.md#shared-authentication).

### Lazy Loading of Collapsed Work Details

Negotiate `deferWork` and `turns` only if supervisor `hello.workDetails` is true. In recent/earlier ranges and early restoration display, send consecutive `agent_thought_chunk` and `tool_call` events as `{type:'work_pending',count:N}`. Reduce small `tool_call_update` events to display fields and send immediately, so post-completion status updates do not create spurious turns. Do not delay real-time thinking/tool events. Older supervisors receive no new options and keep existing behavior.

The browser expands each run into lightweight markers matching its original sequence count. Preserve one sequence number per row for `start/end/total`, reconnection cursors, device caches, and bubble keys. The assembler groups markers into one contiguous range that establishes only the work-detail location.

**Prefetch and visibility.** 200ms after first display, prefetch up to 2,048 events for the latest 3 answers in the visible tab into memory. Run at most 2 requests concurrently; pending requests for expanded details take priority. Stop new requests in inactive tabs or hidden browsers and resume when visible. Receive/cache in-flight responses.

Background responses alone do not assemble or render collapsed details. Once all details for an expanded turn arrive, fill only its markers and reassemble once.

**Retrieval.** Use `{type:'history_details',requestId,generation,start,end}` on the existing authenticated tab WS, checking the current generation and valid range.

| Limit or result | Behavior |
| --- | --- |
| Request target | At most 256 events |
| Response display JSON | 1MiB; the first event alone may be up to 8MiB; exceeding the limit returns an error |
| Actual response `end` below requested end | Continue from that sequence number |
| Same range | Share requests and responses |
| No response within 10 seconds | Release the slot |
| Failed expanded details | Allow retry; preserve questions and answers |

Details neither advance the conversation cursor nor replace live events. Reconnection/generation replacement clears requests and memory cache and ignores late responses. Preserve real-time events and unsequenced errors received in the hydrate frame. Temporary early ACP-restoration display waits for the final generation before retrieving details.

## Browser and Screen

### Device transcript cache

`src/utils/agent-history-cache.ts` uses sessions/events stores in IndexedDB `mew-agent-history`, keyed by logged-in account, runtime, tab, and cwd, with one event row per sequence number.

Store only the latest 20 questions. Append only new rows to the same range. When a new question shifts the start, preserve overlapping rows for the same session/generation; delete the dropped prefix, insert the tail, and update metadata in one transaction. Calculate missing optional event-row `bytes` from serialized length; retain DB version 1. Coalesce updates during slow saves into one latest snapshot, bounding the save queue.

A WeakMap indexes questions for each socket-owned append-only event array, indexing only new events when computing recent ranges. Earlier-range insertion or transcript replacement creates a new array and rebuilds the index. Use separate arrays for pending storage snapshots so later streaming does not mix in.

| Cache budget | Limit |
| --- | --- |
| Per entry | 4MiB |
| Total | 32MiB |
| Entry count | At most 128 |
| Lifetime | 7 days after the last write |

Sizes estimate serialized length, not actual browser quotas. Clean expired entries on initial opening; also remove expired entries and capacity/count excess on save. Skip device caching for ranges above the entry limit, retaining server records. Quota errors, storage restrictions, and delayed upgrades fall back to a connection without caching.

**Startup.** Existing sessions wait at most 25ms for transcript cache before connecting. A transcript returned within the gate supplies generation/sequence cursor for incremental synchronization. Restore the saved queue in parallel without holding the socket. New sessions skip both reads. Save asynchronously during normal operation; do not assume saves finish on shutdown events. [ADR 0111](../decisions/0111-fast-agent-recovery.md) records the tradeoff.

After checking the server tab ledger, display valid device records for the same account/session as actual bubbles first. Do not use legacy localStorage text previews; remove the legacy transcript key on a new range. Device cache is not authoritative for session pointers. Drafts, settings, and control caches follow the [Browser Storage Contract](browser-storage.md). Explicit tab closure removes all runtime/cwd IndexedDB records for that account/tab.

Scrolling within 80px of the top requests the preceding range. Preserve position using the height difference after prepend and expanded states using global sequence-number bubble keys. CLI batch/new-CLI question counts include `usersBefore`. Keep previously read ranges on the open screen; reconnect/device storage defaults to the latest 20 questions.

### Early Display of Server Transcripts During ACP Restoration

During automatic restoration, history selection, or current-conversation refresh, the supervisor reads the stored SQLite transcript independently of ACP readiness and `session/load`.

A temporary `server/agent-history-preview.ts` Worker uses a read-only DB connection and read transaction. Starting at the latest sequence number, SQLite extracts event types/user message IDs to find a complete recent-question range. Read and parse only that range's originals into JavaScript. Question chunk IDs (present, absent, or changed) and neutral events use the existing forward index's boundaries. This reduces skipped early display caused by unnecessary older originals in the existing 256-row batch.

New screens receive thinking/tool calls from 3 turns as markers; existing requests retain 20 turns. I/O and JSON parsing stay off the supervisor event loop. Concurrent queries sharing transcript and display options share one in-flight Worker. No schema changes, JSON migration, or saves occur.

Send `{type:'history_preview', preview:{sessionId,start,events}}` only to range synchronization clients on existing authenticated tab connections, excluding generation, reconnection cursors, and controls. Discard late results after restoration finishes or the conversation changes. Missing transcripts and read/parse failures skip early display while existing restoration continues.

Check original sizes in SQL, then read/convert each selected row separately so batches of originals do not accumulate in memory. SQLite boundary extraction reads original JSON without creating JavaScript objects for large tool bodies.

| Early-display budget | Limit |
| --- | --- |
| Display output, including envelope | 4MiB |
| Boundary search | 64MiB total originals and 50,000 rows |
| Individual selected event | 8MiB |
| Worker V8 memory | 64MiB |
| Worker timeout | 500ms |

Exceeding a limit leaves existing ACP restoration running. Terminate the Worker after a result, error, or timeout. Original tool results larger than 4MiB can display early if display output and retrieval limits permit. Preserve full replay for older clients.

Display only records matching the current restoration target ID in separate temporary browser state. Preserve the existing conversation, device cache, tab pointer, and reconnection cursor; do not save early display or mix in the previous conversation's CLI history.

| During temporary display | Behavior |
| --- | --- |
| Expand questions/answers, copy, scroll | Allowed |
| Send, approve, request earlier ranges | Blocked |
| Conversation `aria-busy` | Retained until restoration finishes |
| Final `history`, `replay`/`meta`, `reset`, errors, authentication transitions, or connection closure | Clear temporary display |
| Restoration failure | Preserve existing conversation |
| Restoration success | Replace with latest ACP transcript |

Provider restoration time and writer replacement rules remain unchanged.

### Incremental Screen Updates

#### Local prompt feedback

`src/hooks/use-agent-prompt-feedback.ts` overlays one locally submitted idle question and waiting reply on folded display items. It never appends synthetic events to `events` or `historyRef`, allocates server sequence numbers, or persists optimistic content in transcript caches.

Observe new live batches alongside the frame's actual event append: a matching question echo removes the local question; its `turn_start` removes the waiting reply. Only new events acknowledge sends, so identical older text cannot consume feedback. Buffered echoes take priority over a later queue acknowledgment with identical text.

Reconcile the overlay on server queue acknowledgments, errors, disconnects, conversation changes, and authoritative history replacement. Startup feedback stays attached to its cancellable in-memory queue entry until sending. Local feedback does not prove server acceptance, is not automatically resent after disconnect, and does not survive refresh. The [feature contract](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#immediate-message-and-reply-feedback) owns visible behavior.

#### Event assembly and Markdown

Append real-time events to a socket-specific buffer and update sequence numbers immediately. Do not copy full history per event; pass a separate event array to React state. Copy screen-state events and assemble the conversation once per animation frame.

`src/hooks/use-agent-event-state.ts` and `src/utils/agentFold.ts` apply only the new frame's events to question, answer, tool, and approval items. Copy changed items/children only, preserving prior render snapshots. Completed bubbles and unchanged answers retain object identity, letting memoized components skip rendering/Markdown conversion. Late tool updates and approvals modify only their earlier-turn locations. Compute per-question setting indicators in one pass.

Reassemble fully on transcript replacement, earlier-range insertion, or language/starting-sequence-number changes. A frame containing reset applies only events after its last reset. Legacy full replay and range restoration use the same rules.

The language/body-keyed Markdown HTML LRU holds at most 128 entries and an estimated 4MiB. An entry above an estimated 512KiB bypasses it and reuses only the mounted answer's last conversion. New streaming bodies do not clear the global cache. Preserve raw HTML blocking, code/table copying, and translated controls.

These optimizations change neither provider conversation context nor prompt caching. Open screens/supervisors may still retain full history; a large streaming answer's Markdown is reparsed when its body changes. There is no DOM virtualization or supervisor memory limit.

### Saved queue and startup messages

Save the server queue asynchronously as a separate snapshot in the same IndexedDB database. After checking account, runtime, tab, cwd, and session, display cached bodies, types, attachment references, and settings if the parallel read finishes before session synchronization. Server `meta` replaces the cache display exactly, including an empty queue; late cache results cannot replace synchronized state. Queue reads do not delay connection.

Keep the last queue display during temporary disconnections. Block editing, deletion, and reordering until server state arrives. Never resend cached work to the server or execute it; the server supervisor controls execution. Queue snapshots share conversation per-entry/total budgets, the 7-day lifetime, save-failure fallback, and explicit-tab-close cleanup. Each snapshot counts separately toward the overall 128-entry limit.

Before a new tab has session readiness, accepted messages live in a separate `AgentStartupQueue` in-memory list. Without a session ID, never write them to IndexedDB server queue snapshots or represent them as an existing queue. While mounted, the tab retains unsent items across reconnections/login waits and hands off each once after initialization. Recovery after tab closure, refresh, or app exit is not guaranteed. The [Session Contract](agent-sessions.md#messages-reconnection-and-queues) owns sending conditions, cancellation, and scope switching.

## Validation and Measurement

On 2026-10-26, a regression check was added that reproduces early display being skipped because of large or corrupted events preceding the latest 3 turns within the same 256-row batch and verifies that only the recent range displays correctly. Boundaries for chunks with matching or changing question IDs, chunks without IDs, neutral events, the beginning of the document, and generated mixed histories were compared against the existing forward index. PC and mobile checks of the history UI in both themes verified parallel list and occupancy requests, selection locking before occupancy confirmation, sharing of duplicate occupancy requests, and display of the last list when reopened. These results do not measure actual provider restoration time or production improvement rates.

The 2026-10-22 lazy loading was verified with `agent-work-loader.test.ts`, `agent-work-state.test.ts`, and server display/history/preview checks covering sequence numbers, duplicates, 2 concurrent requests, priority, partial responses, timeouts, pause/resume, preservation of originals, and late tool status. Isolated Chromium in `agent-work-details-ui.test.ts` (1100/390px, both themes) verified early question/answer display, detail loading, error retries, exclusion from copying, blocking of late generation responses, and preservation of live updates and unsequenced errors immediately before hydrate. Existing history/preview UI regressions and type checks also passed.

For 30 synthetic turns in `node server/agent-conversation-benchmark.mjs` (with 40 thinking chunks, 40 tool calls, and 40 status updates per turn), medians over 5 runs were measured after warmup. The existing 20 display turns used 1,962,381B and 2.80ms for parsing/assembly; the same 20 turns with deferred details used 130,581B and 1.10ms; the new initial 3 turns used 19,588B and 0.12ms. Transmitted array sizes fell by approximately 93.3% and 99.0%, respectively. This is a synthetic comparison excluding background details and envelope bytes, not a measurement of actual accounts, external networks, or overall ACP restoration latency. No build or production server restart was performed.

- `agentTranscript.test.ts`: nondestructive v2 migration, v1 exclusion, reopening, key isolation, long transcripts, incremental INSERT, range reads, replacement, rollback on failure, and multiprocess WAL writes.
- `agent-history.test.ts`: recent/earlier ranges, real-time sequence numbers, reconnection deltas, and clear generation changes using mock ACP and isolated WS/supervisors. Checks run without actual provider calls.
- `agent-history-state.test.ts` · `agent-command-timeline.test.ts`: full reconstruction, duplicates/gaps, concurrent prepend/append, cached recent ranges, global bubble keys, and CLI ordering.
- `agentFold.test.ts` · `agent-event-state.test.ts`: frame boundaries, photos, message IDs, late tool/approval updates, immutability of previous renders, item reuse, reset, replacement, and language/starting sequence number changes.
- `agentMarkdown.test.ts`: preservation of frequently used answers during cache eviction, omission of large entries, HTML/unsafe link blocking, language-specific code controls, and original copy text for each table.
- `agent-history-ui.test.ts`: scroll preservation, IndexedDB restoration, account isolation, delta reconnection, quota rollback, and tab cache cleanup in isolated Chromium on PC/mobile in both themes; 200 real-time events and duplicate exclusion; saving only new rows in sliding ranges, compatibility with existing rows without bytes, and rollback of prefix deletion. Existing connection/queue UI tests are also checked.
- `agent-history-preview.test.ts`: complete recent questions, batch boundaries, long question chunks, no parsing of older records, sharing of in-flight queries, host event loop responsiveness, key isolation, and read-only fallback for missing/corrupted/oversized records.
- `agent-history-preview-ws.test.ts`: early display for automatic/selected restoration while actual restoration is held pending in isolated WS, supervisors, and mock ACP; replacement with the latest transcript and recovery of the previous conversation on failure.
- `agent-history-preview-ui.test.ts`: early display for automatic/selected restoration on PC/mobile in both themes, blocking of sends/approvals, preservation of copying/drafts, no pointer changes before the final response, failure recovery, and ignoring late early-display results.
- `agent-display.test.ts`: matching bubble assembly before and after tool display field conversion, unchanged originals, preservation of approvals and external settings, and preservation of all outbound forms, ranges, sequence numbers, and controls. `agent-history.test.ts` also checks range, real-time, and legacy transmission and preservation of stored originals using actual mock ACP and WS.

The 2026-10-20 display tool event changes were verified with 11 isolated unit/WS checks and 2 Chromium UI checks. Checks covered early display and preservation of synthetic tool originals exceeding 4MiB, fallback when a single original event, total retrieval budget, or display output exceeds limits, and early display without waiting for ACP completion.

On the same day, read-only queries of 20 recent stored transcripts transformed with the new shared function reduced the total from 65,539,527B to 7,816,900B, approximately 88.1%. The largest sample shrank from 22,531,218B to 1,840,501B, and the actual read Worker's early-display result was 1,840,573B in 299ms. These queries did not modify server records and do not represent total loading time over an external network or on an actual account screen. No local production build or server restart was performed.

2026-09-30 results from a single local run with 500 synthetic turns (20 answer chunks per turn, 256 characters per chunk), totaling 11,500 events:

| Metric | Existing full JSON | New structure |
| --- | --- | --- |
| Cumulative serialized payload | 925,911,740 bytes | Event payload 3,684,780 bytes |
| Initial transmission payload | 3,696,281 bytes | Latest 20 turns, 148,002 bytes |
| Average read (20 runs) | Full parse 6.37ms | Recent range query 0.38ms |
| Elapsed time for 500 saves | 1,799ms | 2,608ms |

SQLite figures represent event payloads excluding DB page, WAL, and index write bytes. Durability conditions differ: JSON uses write+rename without fsync, while SQLite uses FULL commit. This measurement showed reduced read and transfer volume but increased write latency. Actual user experience, provider restoration, and power-failure recovery performance were not measured.

### 2026-10-07 Screen Processing Optimization Measurements

Using Node v22.22.2 locally, medians over 5 runs after warmup were compared for 500 synthetic turns (20 answer chunks per turn, 210 characters per chunk) and one question in progress, totaling 11,502 events. The SQLite range query uses a separate isolated DB containing 10,000 events and reads the last 100 events 1,000 times.

| Total elapsed time for repeated operations | Before | After |
| --- | ---: | ---: |
| Conversation assembly and state updates over 200 frames with new chunks | 54.44ms | 8.19ms |
| Adding 2,000 real-time events to the buffer | 143.33ms | 0.18ms |
| Computing recent-range snapshots 200 times | 51.20ms | 0.69ms |
| Querying SQLite ranges of 100 rows 1,000 times | 64.50ms | 42.93ms |

The before measurement for conversation assembly uses the existing full fold; the after measurement includes the initial full assembly, per-frame incremental assembly, and state array copying. Cache-range measurements exclude IndexedDB I/O. These figures do not represent single-frame latency or improvement rates on actual devices or across the entire app, and vary between runs due to other processes and JIT. A separate browser check of rolling-cache writes confirmed that only the new turn's 4 rows were saved, without rewriting 19 of the 20 turns.

Remeasure the current optimized path with `node server/agent-conversation-benchmark.mjs`. The benchmark DB is created in the OS temporary folder and deleted on exit. No build, production server restart, or actual provider call was performed.

### 2026-10-08 measurement of early transcript display during restoration

ACP completion was delayed by 3,000ms on the same mock socket in isolated Chromium. The time from history selection to the first body display was 3,305ms before the change at 1100px in the light theme, and 31–33ms after the change at 1100/390px in both themes. These figures compare rendering with a prepared socket fixture and exclude server queries, actual providers, and user network time.

A separate check using real WS, a supervisor, and a read Worker blocked mock ACP completion with a file signal and confirmed that the early display arrived first. A single local measurement run in parallel with the browser check recorded 658ms for automatic restoration by a new supervisor (including supervisor startup), 120ms for selection-based restoration in an open tab, and 144ms for early display of a target that would fail. These figures do not guarantee actual provider readiness times or improvement rates in production. No build, production server restart, or actual provider call was performed.
