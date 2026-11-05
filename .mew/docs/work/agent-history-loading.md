---
title: "Fast agent history lists and saved conversation previews"
description: "Records the November 5 history-loading change: local recent-list warming, partial source results, and bounded saved transcript prefetch before selection. Separates verification and remaining latency limits from application to the running server."
created: "2026-11-05"
updated: "2026-11-05"
---

## Purpose and resulting behavior

Extend the fast saved-tab display path to history. Previously, a recent list could wait for provider listing and transcript-index backfill, and selecting a row began reading its saved content only then. History now warms saved recent metadata before ACP readiness, publishes available sources before slower sources complete, and prepares recent conversation previews for immediate display on selection.

The current contracts are owned by [history search](../development/agent-sessions.md#history-search), [saved history-result previews](../development/conversation-storage.md#saved-previews-for-history-results), and the [conversation feature](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#history-search). [ADR 0144](../decisions/0144-agent-history-previews.md) records the protocol extension; the earlier [saved-tab work record](agent-tab-history-previews.md) covers first visits after reopening Mew.

Local list warming reads Mew's metadata without provider listing or external CLI indexing. Empty-query listing avoids full transcript backfill, while body search preserves index supplementation. Partial responses retain the request ID and query, and known rows remain available during refresh once occupancy and existing switching restrictions pass.

The browser prepares the first 6 listed saved transcripts, prioritizes hovered or keyboard-focused rows, and displays a matching preview when selected while normal provider restoration proceeds. Completed previews remain reusable across query changes within the connection's memory and entry budgets. Reads stay on the authenticated connection, use Mew's existing SQLite transcripts and shared preview scheduler, and do not call provider load or change conversation pointers. Temporary previews retain action restrictions until final synchronization.

## Verification

- The integrated 13-file regression run passed all 49 tests. It covers search-source ordering and partial results, metadata-only recent lists, authenticated pre-ACP browsing, request validation, bounded reads, revocation, display projection, existing WS restoration, desktop/mobile history opening and selection, saved-tab and late-cache restoration, relay recovery, and preview scheduling.
- `agent-history-browser-ws.test.ts` holds mock ACP initialization while retrieving recent metadata and saved previews, checks that no historical load is sent, and verifies scope, malformed requests, simultaneous-read limits, and permission revocation during I/O. `agent-session-search-service.test.ts` holds provider results to verify local partial publication and preserves deterministic local-first final merging even when the provider responds first.
- `agent-fast-history-ui.test.ts` passed at 1100px and 390px. It holds provider listing and session restoration, verifies prepared rows and text before their completion, protects pointers and drafts, blocks sending during temporary display, and checks final replacement. After searching and clearing the query, selecting another prepared recent conversation reuses its single preview request. Scheduler tests also verify query-change reuse, cancellation of obsolete reads, and the 128-entry bound.
- `npm run build` passed, including TypeScript checks, with Vite's existing large-chunk warning. `npm run lint` passed with existing React warnings.

- `git diff --check` passed for the changed documentation.
- `npm run check:docs` checked 729 descriptions with 0 errors, then failed on 42 existing link errors outside the six documents changed for this history-loading task. The reported paths include deleted documentation entry points and a task's absolute asset URL; they were left unchanged.
- Filtered the existing `documentLinkErrors` check to those six changed documents: 0 local link errors. Reviewed the new cross-links and their heading targets directly.

## Application and remaining limits

No deployment, launcher execution, or server start, stop, or restart was performed as part of this work. Applying server-side protocol changes to the running instance remains the user's operation.

Provider-only history without a Mew transcript still uses normal restoration. Preview misses, budgets, failed reads, or immediate selection before preparation finishes retain that fallback. Provider readiness, actual remote latency, and latency across all stored conversations are separate from saved-display preparation and have not been established by the contract alone.
