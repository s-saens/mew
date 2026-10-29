---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Release the previous writer at the Codex /clear boundary. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0140 — Release the previous writer at the Codex /clear boundary"
created: 2026-09-14
updated: 2026-09-14
---

- Date: 2026-09-14
- Status: Adopted
- Partially supersedes: [0122](0122-mew-codex-history-load-restarts-writer.md) · [0103](0103-mew-queued-clear-session-boundary.md) — adapter process reuse for Codex `/clear`
- Decision maker: Codex (user instructed fixing the unreleased lock issue)

## Background

In Codex, calling only `session/new` within the same process leaves the previous conversation's writer active. Because the tab pointer points to the new conversation, even checking ownership in other tabs cannot account for or release the previous conversation's lock.

## Options

1. Replace the process only when loading history — the lock remains while another tab accesses the previous history.
2. Call `session/close` — the current adapter forwards it as `thread/unsubscribe` and does not guarantee immediate unloading.
3. Terminate the Codex adapter and child processes at the `/clear` queue boundary, then start a new connection.

## Decision

Adopt option 3. After completing preceding work, wait for process termination and adopt a new conversation from a new ACP connection. Retain the tab, supervision, queued messages, and editing ownership. Retain `/clear` for other runtimes and the Codex history switching rules.

If the new connection or conversation creation fails, preserve the existing transcript and pointer and stop the subsequent queue. Execute subsequent messages only after completing the boundary by retrying `/clear`. If the tab closes during termination, do not create a new process.

## Rationale

Process termination is a reliable boundary for releasing the writer. Unsubscribe in the [official app-server documentation](https://learn.chatgpt.com/docs/app-server#unsubscribe-from-a-loaded-thread) includes an idle grace period after unsubscribing, so do not use it to guarantee immediate reconnection.
