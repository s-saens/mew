---
title: "Conversation Storage and Range Synchronization"
created: 2026-09-30
updated: 2026-10-26
description: "Defines SQLite storage of originals and attachments, prioritized display of the latest 3 turns and lazy loading of work details, early display during restoration and its limits using sequence-based synchronization and reverse searches for recent question boundaries to reduce unnecessary parsing of originals, per-frame conversation assembly, and the storage lifetimes and measurement of the IndexedDB sliding cache and local sends pending before initialization."
상위파일: "MOC.md"
---

[Session Contract](agent-sessions.md) · [ADR 0182](../history/decisions/0182-mew-incremental-conversation-storage.md) · [Display Tool Events Decision](../decisions/0031-agent-display-events.md) · [Lazy Loading of Work Details Decision](../decisions/0043-agent-work-details-loading.md)

## Server Storage

`server/agentTranscript.ts` stores `sessions` and `events` in `<DATA_DIR>/agent-transcripts/transcripts.sqlite`. The key remains SHA-256(runtime, cwd, sessionId), and the event primary key is `(session_key, seq)`. There is no separate DB server or new dependency; it uses the existing Node built-in `node:sqlite`. Directory permissions are 0700, DB file permissions are 0600, and the schema is `user_version=1`; higher versions are not written to.

Uses WAL, `synchronous=FULL`, and a 1-second busy timeout. The DB resides on a local disk on the same host. Normal streaming batches saves 250ms after the first unsaved event and saves immediately at turn completion and shutdown. Already recorded prefixes of the same append-only event array are not serialized or INSERTed again. When ACP restoration or another operation replaces the array, the session records are replaced in a single transaction. Saving identical content skips the DB update.

New messages and queued executions store `project`, `path`, and `mimeType` for all attachments in a `user_attachments` event immediately after the user body. Image bytes are excluded, and originals are retrieved using the stored attachment scope regardless of the current document scope. `user_images` events from older clients without attachment metadata are also read. Range retrieval, device caching, and early transcript display retain this event with the body.

WS input validation accepts both the current upload path `.mew/assets/` and the legacy `.mew/files/` for attachments and image references. The same rules apply to new messages, attachment-only messages, and queue edits so that uploaded file metadata reaches the supervisor.

Prepared statements for retrieval, insertion, and replacement SQL are reused for the lifetime of the DB connection and released when it closes. The schema, save interval, durability, revision checks for other writers, and restoration semantics remain unchanged.

If no session row exists on the first retrieval, migration checks the version 2, session key, and event array in the existing `<hash>.json`. The JSON is neither deleted nor overwritten. Incomplete v1 transcripts are not migrated. Corruption, locking, and capacity errors are logged, and failed transactions preserve previous records. Revision and count checks prevent stale append buffers from overwriting transcripts updated by another writer. Save failures do not stop ongoing conversations. Subsequent save opportunities retry the unsaved tail. The existing JSON preserves the original at migration time; it is not a rollback copy that receives reverse synchronization of new DB changes.

The provider's ACP history is authoritative for agent context. Merging external CLI changes, settings, and completion times follows the existing [Session Restoration Contract](agent-sessions.md#messages-reconnection-and-queues). SQLite holds the Mew display transcript and does not modify provider storage. The supervisor still holds the current full event array in memory and reconciles the entire history during ACP restoration, so this change guarantees neither provider restoration time nor an overall supervisor memory limit.

## Ranges and Connections

The scope of `shared/agent-history.ts` is `[start, end)`. Each supervisor creation or transcript replacement creates a new generation and incrementally indexes current question boundaries. New screens first receive the latest **3 questions and their associated answers** through `history=1&deferWork=1&turns=3`. Earlier ranges are also read in batches of 3 turns. `turns` ranges from 1 to 20; existing clients that omit it receive the latest 20 turns. Consecutive chunks and answers for a single question are not split, so the turn count alone does not limit the byte size of large questions or answers.

- The WS `history=1&generation=...&after=...` passes the last sequence number actually held. If it belongs to the same generation and is valid within the recent range, only the new tail is sent as `append`; otherwise, the recent range is sent as `replace`.
- The `history` response contains the session ID, generation, start/end/total, preceding question count (`usersBefore`), events, and current model/permission/thinking controls.
- `{type:'history', range:{generation,before:start}}` reads the immediately preceding range through `prepend`. The supervisor slices the range from memory it already holds and converts it for display. It does not repeatedly retrieve and parse the stored original JSON from SQLite.
- Real-time `history_event` sends the event together with `{generation,seq}`. The browser ignores duplicates and requests the recent range again if it detects gaps or a generation change. Sequence numbers are recorded in memory before being applied to screen state, preventing incorrect cursors even on rapid reconnections.
- The supervisor negotiates through hello capabilities and subscribe. Older clients receive a full replay, and older supervisors use the existing replay path. A running older supervisor may continue sending the full history until replaced.
- Retrieval is available only through the existing tab WS/supervisor IPC, which rechecks authentication and feature permissions. No public retrieval API accepting arbitrary session keys is added. If automatic restoration fails, the original tab pointer and device transcript are preserved.

Binary search finds the preceding range and `usersBefore` in the question boundary array. This avoids scanning the prefix on every request in proportion to the turn count, while preserving the same range and question boundaries.

### Display Tool Events

In the copy sent to the browser, `shared/agent-display.ts` reduces `update` in `tool_call` and `tool_call_update` to the `sessionUpdate`, `toolCallId`, `title`, `status`, and `kind` fields used by the screen. Raw tool inputs and outputs, result bodies, and location information unused by the screen are not sent. Settings and other data outside events are preserved, and user messages, answers, approval requests, errors, and controls pass through unchanged. Lazy loading of work details also provides only display fields, without raw tool results.

The data is first reduced for display at the IPC send boundary of `server/agentHost.ts` so that large originals are not serialized between the supervisor and server. The same transformation remains in the shared send function of `server/agentWs.ts` after authentication and permission checks, protecting `history`, full `replay`, and individual events from older supervisors. Original order, generation, sequence numbers, range boundaries, and restoration failure information are preserved.

SQLite transcripts, supervisor memory, and provider ACP history retain the originals. Display conversion does not modify original objects or participate in provider restoration, context, or tool execution. This change reduces transfer volume for conversations with large tool results, but does not guarantee total transfer volume or initial display time when questions or answers themselves are large.

### Lazy Loading of Collapsed Work Details

`deferWork` and `turns` are negotiated only when the supervisor's `hello.workDetails` is true. Recent and earlier ranges and early restoration display send consecutive `agent_thought_chunk` and `tool_call` as `{type:'work_pending',count:N}`. Small `tool_call_update` is reduced to display fields and sent immediately so that status updates arriving after completion do not create spurious turns. Real-time thinking and tool events are not delayed. Older supervisors receive no new options and retain the existing transmission behavior.

The browser expands each received run into lightweight markers matching the original sequence count. This preserves the one-sequence-number-per-row semantics of `start/end/total`, reconnection cursors, and device caches, as well as bubble keys. The assembler groups markers into a single contiguous range that only establishes the location of work details.

200ms after the first screen is displayed, up to 2,048 events for the latest 3 answers in the visible tab are prefetched into the memory cache. At most 2 requests run concurrently, with pending requests for expanded details taking priority. New detail requests stop in inactive tabs or hidden browsers and resume when visible again. Responses already in flight are received and cached. Background responses alone do not assemble or render collapsed details; once all details for an expanded turn arrive, only its markers are filled, followed by one reassembly.

Retrieval uses `{type:'history_details',requestId,generation,start,end}` on the existing authenticated tab WS. It checks the current generation and valid range, targeting at most 256 events per request and 1MiB of display JSON per response. The first event alone may be up to 8MiB; exceeding the limit returns an error. If the response's actual `end` is smaller than requested, reading continues from that sequence number. Requests and responses for the same range are shared, and a slot is released if no response arrives within 10 seconds. Failed expanded details can be retried, and questions and answers are preserved.

Detail responses do not advance the conversation cursor or replace live events. Reconnection and generation replacement clear requests and the memory cache and ignore late responses. Real-time events and unsequenced errors received in the same frame as hydrate are also preserved. Temporary early display during ACP restoration does not retrieve details until the final generation arrives.

## Browser and Screen

`src/utils/agent-history-cache.ts` uses the sessions/events stores in the `mew-agent-history` IndexedDB database. Keys consist of the logged-in account, runtime, tab, and cwd, with one event row per sequence number. Only the latest 20 questions are stored, and when new records are appended to the same range, only new rows are saved. Even when a new question shifts the range start, overlapping rows for the same session and generation are preserved; deletion of the dropped prefix, insertion of the new tail, and metadata updates occur in one transaction. The optional `bytes` on event rows is calculated from serialized length when absent from existing rows, and DB version 1 is retained. Updates during slow saves are coalesced into one latest snapshot so the queue does not keep growing.

A WeakMap holds a question index for each socket-owned append-only event array, so only new events are indexed when calculating the recent range. Inserting earlier ranges or replacing the transcript creates a new array and rebuilds the index. Snapshots awaiting storage use separate arrays so subsequent streaming is not mixed in.

Limits are 4MiB per entry, 32MiB total, at most 128 entries, and 7 days after the last write. Sizes are estimates based on serialized length and differ from actual browser quotas. Expired entries are cleaned up on initial opening; expired entries and entries exceeding capacity or count limits are cleaned up on save. If a range exceeds the per-entry limit, device caching is skipped and server records are retained. Quota errors, storage restrictions, and delayed upgrades fall back to a connection without caching. Cache reads wait at most 200ms. Saves run asynchronously during normal operation, and completion of saves on shutdown events is not assumed.

After checking the server tab ledger, valid device records for the same account and session are displayed first as actual bubbles. Legacy localStorage plain-text previews are not used, and the legacy transcript key is removed when a new range arrives. The device cache is not authoritative for session pointers. Input drafts, settings, and control caches retain the existing [Browser Storage Contract](browser-storage.md). Explicitly closing a tab also removes all runtime/cwd IndexedDB records for that account and tab.

Scrolling upward to within 80px of the top requests the preceding range. The height difference before and after prepending preserves the reading position, and global event sequence numbers serve as bubble keys to preserve expanded states. Question counts for CLI batches and new CLIs include `usersBefore`. Previously read ranges remain on the open screen, while the default range for reconnection/device storage is the latest 20 questions.

### Early Display of Server Transcripts During ACP Restoration

During automatic restoration, history selection, or refresh of the current conversation, the supervisor reads the already stored SQLite transcript independently of ACP readiness and `session/load`. A temporary Worker in `server/agent-history-preview.ts` uses a read-only DB connection and read transaction to extract event types and user message IDs through SQLite, starting from the latest sequence number, to find a complete range of recent questions; only originals in the selected range are read into JavaScript and parsed. The presence, absence, and changes of question chunk IDs and neutral events use the same boundaries as the existing forward index. This reduces cases where unnecessary older originals in the existing 256-row batch caused early display of the recent range to be skipped. New screens receive thinking and tool calls from 3 turns as markers, while existing requests retain 20 turns. I/O and JSON parsing do not run on the supervisor's event loop, and concurrent queries with the same transcript and display options share one in-flight Worker. No schema changes, JSON migration, or saves are performed.

`{type:'history_preview', preview:{sessionId,start,events}}` is sent only to range synchronization clients on existing authenticated tab connections. It excludes generation, reconnection cursors, and controls. Late results are discarded if supervisor restoration has already finished or the conversation has changed. If no transcript exists or reading/parsing fails, early display is skipped and existing restoration continues.

Original sizes are checked in SQL first, and each selected row is read separately and converted to a display event, so large batches of originals do not accumulate in memory. Display output, including the envelope, is limited to 4MiB; boundary searches are limited to a total original size of 64MiB and 50,000 rows, and individual events in the selected range are limited to 8MiB. SQLite boundary extraction reads the original JSON but does not create JavaScript objects for large tool bodies. The Worker's 64MiB V8 memory limit and 500ms timeout also remain. If a limit is exceeded, existing ACP restoration continues, and the Worker terminates after a result, error, or timeout. Even original tool results larger than 4MiB can be displayed early if they fit within the display output and retrieval limits. The full replay path for older clients remains.

The browser displays only records matching the current restoration target ID in separate temporary state. The existing conversation, device cache, tab pointer, and reconnection cursor are preserved, and the early display is not saved. Expanding questions and answers, copying, and scrolling are allowed; sending, approvals, and requests for earlier ranges are blocked. CLI history from the previous conversation is not mixed in. The conversation's `aria-busy` is retained until restoration finishes. Temporary display is cleared on final `history`, `replay`/`meta`, `reset`, errors, authentication transitions, or connection closure. Failure preserves the existing conversation; success replaces it with the latest ACP transcript. Provider restoration time and writer replacement rules remain unchanged.

### Incremental Screen Updates

Real-time events are appended to a socket-specific buffer, and sequence numbers are updated immediately. The full history array is not copied for every event, and a separate array is passed to React screen state. Copying the screen state's event array and assembling the conversation occur once per animation frame.

`src/hooks/use-agent-event-state.ts` and `src/utils/agentFold.ts` apply only events from the new frame to question, answer, tool, and approval items. Only changed items and their children are copied, preserving snapshots from previous renders. Completed bubbles and unchanged answers retain the same objects, allowing memoized components to skip rendering and Markdown conversion. Late tool updates and approval responses for earlier turns modify only their corresponding locations. Per-question setting change indicators are calculated in a single pass.

Transcript replacement, insertion of earlier ranges, and changes to the language or starting sequence number trigger full reassembly. If a frame contains a reset, only events after the last reset are applied to the new conversation. Legacy full replay and range restoration use the same assembly rules.

The Markdown HTML cache uses language and body as keys and is managed as an LRU with at most 128 entries and an estimated 4MiB. If one entry exceeds an estimated 512KiB, it bypasses the global cache and reuses only the last conversion result for the mounted answer. New streaming bodies do not clear the entire cache. Raw HTML blocking, code/table copying, and translated controls remain.

Screen update optimizations do not change the conversation context sent to providers or prompt caching. Open screens and supervisors may still hold the full history, and Markdown for a single large answer in progress is reparsed when its body changes. This change does not introduce DOM virtualization or a supervisor memory limit.

The queue is also saved asynchronously as a separate snapshot in the same IndexedDB database. After checking the account, runtime, tab, cwd, and session, it displays bodies, types, attachment references, and settings at registration before connecting; receipt of the server's `meta` replaces it exactly, including an empty queue. The last queue display remains during temporary disconnections. Editing, deletion, and reordering are blocked until server state arrives, and cached work is neither resent to the server nor executed. The server supervisor is authoritative for queue execution. The queue shares the conversation's per-entry/total budgets, 7-day lifetime, save-failure fallback, 200ms read limit, and cleanup on explicit tab closure. Queue snapshots count as separate entries toward the overall 128-entry limit.

Messages accepted in a new tab before session readiness reside in a separate in-memory list in `AgentStartupQueue`. Without a session ID, they are not written to IndexedDB server queue snapshots or represented as an existing queue. While that tab remains mounted, unsent items persist through reconnections and login waits and are handed off once each after initialization completes. Recovery after tab closure, refresh, or app exit is not guaranteed. The [Session Contract](agent-sessions.md#messages-reconnection-and-queues) owns sending conditions, cancellation, and scope switching.

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
