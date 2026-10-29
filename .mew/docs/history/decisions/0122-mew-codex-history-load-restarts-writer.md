---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Loading Codex history replaces the writer. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0122 — Loading Codex history replaces the writer"
created: 2026-09-07
updated: 2026-09-07
---

- Date: 2026-09-07
- Status: Adopted
- Follow-up decision: [0140](0140-mew-codex-clear-releases-writer.md) — Also replaces the process for Codex `/clear`; history switching rules remain unchanged
- Partially supersedes: [0036](0036-mew-agent-session-controls-and-usage.md) — Scope of Codex child process reuse for `session/load`
- Decision maker: Codex (at the user's direction to investigate and fix the cause)

## Background

When `/clear` is run in the same tab, Mew calls `session/new` on the same ACP connection to move to a new Codex
thread. Because the tab's saved pointer changes to the new thread, the previous thread can be
selected again from history.

However, the Codex app-server did not release the writer that the adapter process had acquired
for the previous thread, even after `session/new`. Calling `session/load` for the previous thread in the same process
was rejected with `thread ... already has an active writer`. Occupancy prevention that compares saved pointers in other tabs
cannot prevent this case, because the writer remains in the previous ACP
process of the same tab.

## Options

1. Lock the previous thread in history — avoids the error, but prevents returning to the conversation from before `/clear`.
2. Retry `session/load` in the same adapter — writer ownership remains, so the result does not change.
3. Terminate the adapter before switching Codex history and call `session/load` in a new process — adds initialization overhead to switching but reliably releases the writer.

## Decision

Adopt option 3.

- An exact `/clear` is handled as before with `session/new` at the queue boundary on the same connection.
- When a conversation is selected from Codex history, first check that there is no active turn, pending approval, or queued work.
- Terminate the current Codex ACP adapter process to release the writer, then start a new adapter under the same tab supervisor and call `session/load` with the selected ID.
- If loading the selected ID fails, reload the immediately preceding thread in the new adapter to restore the current conversation and show the original error.
- Other ACP runtimes continue to call `session/load` in the same process.

## Rationale

The tab ID is the lifecycle unit for Mew's supervisor, not for a vendor's thread writer. Since terminating
the app-server process is the reliable boundary at which Codex releases the writer, replacing only the adapter beneath
it while retaining the supervisor and browser tab is the narrowest solution.

## Results

- The thread from before `/clear` can be reopened in the same tab.
- Every Codex history switch incurs the time required for the ACP handshake and `session/load`.
- This path is covered by a regression test that restores the previous thread after replacing the adapter process.
