---
title: "0144 — Prepare history lists and saved content before provider loading"
description: "Extends saved agent previews to history results through the authenticated connection, local recent-list warming, and partial search responses. Preserves provider authority, occupancy checks, temporary-display restrictions, and bounded preview preparation."
created: "2026-11-05"
updated: "2026-11-05"
---

## Status

Accepted. Extends [ADR 0084](0084-agent-history-search.md) and [ADR 0141](0141-agent-tab-history-previews.md). Provider restoration, writer ownership, and authoritative history synchronization remain unchanged.

## Context

Preparing saved tab transcripts made first visits faster after reopening Mew, but history still depended on provider session listing and started reading selected content only after selection. Listing recent saved sessions also backfilled full transcript search indexes, even though titles and dates need no body search. A slow source could therefore delay both the list and selection of a conversation whose display transcript already existed in Mew's SQLite store.

The authenticated agent connection already fixes runtime and working-directory scope. It can serve saved display data before ACP readiness without starting or loading another provider session.

## Decision

Advertise `ready.sessionHistoryPreviews: true` on capable relays. Warm the saved recent list through `list_sessions` with `localOnly:true` before ACP readiness. Local warming uses Mew's stored metadata and index without provider listing or external CLI indexing. Empty-query recent lists skip full transcript backfill; nonempty body searches retain it.

For ordinary list and search requests, publish available source results as `sessions` with `pending:true`, then publish a merged final response with the same request ID and query. Retain known rows during refresh and allow selection after occupancy checks and existing busy, approval, and queue restrictions pass. An unfinished list request alone does not prohibit selecting an available row.

Add `preview_session` and `session_preview` messages to the existing authenticated connection. Read the latest saved display turns from Mew's SQLite store using that connection's runtime and cwd. The browser prepares the first 6 recent session previews with the existing bounded scheduler, prioritizing rows hovered or focused by keyboard. Selection can immediately show a matching cached preview while the ordinary `load_session` runs. Preview preparation neither loads a provider session nor changes the session pointer, agent context, or writer ownership.

Keep preview events separate from authoritative history and device transcript writes. Apply request-ID and scope guards, temporary-display action restrictions, and final replacement rules. Provider-only history without a Mew transcript continues through normal restoration. Older relays retain the existing flow.

The [session contract](../development/agent-sessions.md#history-search) owns listing and search messages. The [conversation storage contract](../development/conversation-storage.md#saved-previews-for-history-results) owns preview messages, budgets, scope, and fallback. The [feature contract](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#history-search) owns visible behavior, and the [work record](../work/agent-history-loading.md) records verification and application limits.

## Alternatives and rationale

- Start or load all recent provider sessions: consumes provider processes and writer ownership to display saved text.
- Parse provider files directly for each preview: duplicates runtime-specific conversion when Mew already has a unified display transcript. External-only history still needs provider restoration.
- Wait for every list source: makes completed local results depend on the slowest provider query.
- Prefetch all historical transcripts: creates unnecessary I/O and memory use. Bounded preparation covers recent and explicitly focused results.

The existing authenticated connection gives history reads the same runtime and cwd scope as listing while avoiding another endpoint and provider startup dependency.

## Consequences

Saved recent titles and selected transcript text can appear before provider work finishes. Background reads add bounded I/O and an in-memory display cache. Missing records, failed reads, exceeded budgets, or selection before preparation completes retain ordinary restoration, so there is no guaranteed end-to-end latency. Saved previews may lag external CLI changes until authoritative synchronization. Sending, approval, and older-range retrieval stay blocked while a selected preview is displayed. No deployment or server lifecycle operation is authorized by this decision.
