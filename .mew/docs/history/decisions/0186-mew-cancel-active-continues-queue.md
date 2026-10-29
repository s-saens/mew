---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: continue running the pending queue after stopping a task. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0186 — Continue running the pending queue after stopping a task"
created: 2026-10-01
updated: 2026-10-01
---

- Date: 2026-10-01
- Status: Adopted
- Partially supersedes: [0153](0153-mew-agent-cli-shared-queue.md) — The scope that also cancels the pending queue when stopping a task
- Decision maker: Codex implementation at the user's request

## Background

The user requested a change to the behavior that also cancels the pending queue when they cancel the active task in the agent panel.

## Options

1. Cancel both the active task and the pending queue.
2. Cancel only the active task and continue running the pending queue in FIFO order after confirming termination.

## Decision

Stop Task in the panel cancels only the active AI or CLI task and its approval requests. Preserve pending items and run them from the top after termination handling for the active task completes. Preserve queue editing locks, memory protection, and existing holds for authentication and usage errors. Deleting an individual queue item cancels only that item, while closing a tab or switching conversations also clears pending tasks.

## Rationale

Stopping the current task preserves the user's queued tasks and their order. The next task does not start until termination is confirmed, preventing AI and CLI tasks from running simultaneously in the same tab.
