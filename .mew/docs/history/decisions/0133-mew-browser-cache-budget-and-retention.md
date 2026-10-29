---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Preserves common size and retention limits for regenerable browser caches. Links the separate migration of agent transcripts to IndexedDB and the switch to asynchronous file-content caching in Mew ADR 0013 as follow-up decisions."
title: "0133 — Regenerable browser caches follow common size and retention limits"
created: 2026-09-11
updated: 2026-10-17
---

- Date: 2026-09-11
- Status: Adopted
- Follow-up decision: [0182](0182-mew-incremental-conversation-storage.md) — moves agent transcripts to a separate IndexedDB budget; retains other cache and draft protections
- Follow-up decision: [Mew 0013](../../decisions/0013-file-content-revalidation.md) — switches file content to a separate IndexedDB budget and conditional retrieval; retains other localStorage cache and draft protections
- Decision makers: User (requested automatic cleanup), Codex (implementation)

## Background

Agent transcripts, file content, folder listings, and sent input history collectively fill the storage space of the same browser origin even when each has its own limits. The issue where failure to save account state interrupted the screen has been fixed, but a common contract is needed to limit total cache accumulation.

## Decision

- Use an explicit allowlist to manage only content, transcripts, folder listings, and agent control caches that can be read again from the server, along with input history whose transmission is complete. Do not automatically delete settings, tab ledger fallbacks, drafts in progress, login information, or keys belonging to other apps. Do not use localStorage.clear().
- Limit total cache size, item size, and retention periods in the shared storage module. Free space immediately before saving; if a quota blocks saving important state, clean up only regenerable caches and retry once. Writes from other tabs follow the same budget.
- Clean up existing caches on first launch, then check periodically and when the page is hidden, restored, or closed. Because shutdown events are not guaranteed, checks at startup and on save are also required. When an agent tab is explicitly closed, remove all runtime caches for that tab.
- Old regenerable caches without dates may be removed during migration. Do not delete drafts based only on size or age. Automatic cleanup does not modify server sessions, files, or conversation transcripts.
- Preserve the server ledger ownership and local draft boundaries in [0093](0093-mew-account-synced-project-and-agent-tabs.md) and [0094](0094-mew-account-synced-workspace-ui-state.md), and the per-root cache isolation in [0086](0086-mew-root-project-spa-handoff-and-cache.md).

## Rationale

Clearing all browser storage also loses unsaved input and personal settings. Limiting only regenerable caches can preserve work state while preventing caches from monopolizing space. Keep specific budgets, lifetimes, and validation in the [mew storage contract](../../development/browser-storage.md).
