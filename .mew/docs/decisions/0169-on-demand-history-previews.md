---
title: "0169 — Read history-result previews when history opens"
description: "Supersedes eager history-result body prefetch with preparation in open history for visible agent tabs. Preserves early recent metadata, saved-tab restoration previews, completed caches, and provider authority."
created: "2026-11-11"
updated: "2026-11-11"
---

## Status

Accepted. Supersedes browser body-prefetch timing in [ADR 0144](0144-agent-history-previews.md). The preview protocol and saved-tab restoration path remain unchanged.

## Context

Every connected agent tab warmed recent history metadata and then prepared up to six saved conversations, even with history closed. Four visible project panels could therefore trigger 24 optional transcript reads alongside their current conversation restoration. Each server read can create a temporary SQLite Worker. Per-tab concurrency limits still allowed this work to multiply across projects.

A reported roughly one-minute startup delay was not reproduced end to end. Completed recent local provider initialization and restoration timings were much shorter. Removing avoidable startup work addresses an observed source of contention without claiming it explains the entire reported delay.

## Decision

Keep warming lightweight recent metadata on relay readiness. Start history-result body preparation only while history is open in a visible agent tab, retaining the six-result limit and existing scheduler budgets. Closing history or hiding its agent tab cancels unfinished client requests and removes queued reads. Keep completed previews for reopening and query changes. Ignore responses for cancelled requests; an accepted server read may still finish.

Connection replacement and account/runtime/cwd changes retain their existing invalidation rules. Saved account-tab previews, device-cache display, and early supervisor previews continue preparing the current restoration target independently of history controls. Provider session loading, pointer adoption, drafts, and temporary-display restrictions retain their existing contracts.

## Alternatives and rationale

- Keep eager preparation: maximizes cache hits before the first history click but multiplies optional body reads during multi-project startup.
- Delay reads by a fixed timer: reduces the initial burst without knowing whether the user needs history or whether restoration has finished.
- Remove saved previews: avoids background work but loses immediate display when a prepared history result is selected.

Opening history supplies a direct demand signal and preserves preview reuse during actual browsing.

## Consequences

Closed history contributes no history-result transcript reads to startup. The first immediate selection after opening may use normal restoration if its preview is not ready. Cached results can still display immediately on later selection. This change establishes neither a startup latency guarantee nor the root cause of every long load.

The [storage contract](../development/conversation-storage.md#saved-previews-for-history-results) owns scheduling and cache behavior. The [work record](../work/agent-history-loading.md) records checks and application limits.
