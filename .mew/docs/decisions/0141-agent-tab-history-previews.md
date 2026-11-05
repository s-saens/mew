---
title: "0141 — Prepare saved agent tab history before first visit"
description: "Decouples saved transcript display from first-visit ACP startup through an authenticated account-tab preview API and bounded browser prefetch. Extends display projection, temporary restoration, and the 25ms device-cache gate without changing provider authority."
created: "2026-11-05"
updated: "2026-11-05"
---

## Status

Accepted. Extends [ADR 0031](0031-agent-display-events.md), [ADR 0043](0043-agent-work-details-loading.md), and [ADR 0111](0111-fast-agent-recovery.md). Replaces the WS-only saved-display retrieval restriction with an additional account-owned tab read path. Authoritative ranges, work details, and agent controls retain the existing authenticated WS/supervisor path.

## Context

After reopening Mew, the selected agent tab starts preparing first. Other tabs begin their connections only on their first visit. Returning to a mounted tab is fast, but that does not address the first visit after reopening. Early WS transcript display already avoids waiting for ACP when its saved read succeeds; it still starts only after the tab's connection exists. IndexedDB display also depended on a result arriving within the 25ms connection gate, so a slower valid read could be discarded for display.

Mew already keeps a unified display transcript in SQLite. Reading provider files or databases separately would duplicate conversion and compatibility work for each runtime. Starting all providers in advance would consume processes and potentially compete for writer ownership just to display saved text.

## Decision

After the authoritative account tab ledger is synchronized, prepare recent saved transcript previews for ACP tabs through `GET /api/user-ui/agent-tabs/history?workspace=<root>&tab=<id>`. Resolve the saved runtime, cwd, and session pointer on the server from the authenticated account's tab ledger. Require agent permission before the read and recheck permission and target afterward. Do not accept arbitrary session keys.

Reuse the existing read-only SQLite Worker, recent-turn selection, display projection, and retrieval budgets. The browser bounds concurrency, read deadlines, and preview memory, and cancels or rejects results when their account, root, tab, runtime, cwd, or session target changes. Selected tabs take priority. Unopened tabs acquire no agent socket, supervisor, or ACP process through prefetch.

On a tab's first visit, show its matching saved preview while the actual session prepares. Keep this display separate from authoritative events, reconnection cursors, session pointers, controls, and device transcript writes. Retain the existing read-only temporary-display restrictions and clear it on final synchronization or invalidation. Permit a valid IndexedDB result arriving after the 25ms gate to supply temporary display before synchronization; it neither delays the socket nor replaces synchronized history.

The [conversation storage contract](../development/conversation-storage.md#saved-previews-for-unopened-tabs) owns API behavior, scope, budgets, and fallback. The [feature contract](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#read-history-content-first) owns visible behavior, and the [work record](../work/agent-tab-history-previews.md) records actual verification and application limits.

## Alternatives and rationale

- Keep WS-only early display: preserves the first-click dependency on connection and tab mounting.
- Increase the IndexedDB startup wait: delays connections and does not help a new browser or absent cache.
- Start all runtime sessions: increases resource use and writer coordination for tabs the user may never open.
- Parse each runtime's history: adds provider-specific formats despite the existing unified SQLite display store. Runtime-only history missing from Mew still uses normal provider restoration.

The account-owned tab endpoint allows bounded read-only preparation while retaining server authority over which session the account may access.

## Consequences

Reopening a project adds bounded saved-history reads for inactive tabs and a temporary in-memory display cache. Valid recent text can appear before the tab's ACP preparation completes. Missing records, exceeded budgets, read failures, or visits before prefetch finishes keep normal restoration available; this change guarantees neither provider readiness nor an end-to-end first-click latency. Provider context and history remain authoritative, and external CLI changes appear after actual synchronization. No deployment or server lifecycle operation is authorized by this decision.
