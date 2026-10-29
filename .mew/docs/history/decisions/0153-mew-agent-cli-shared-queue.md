---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: AI messages and CLI commands use the same tab execution queue. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0153 — AI messages and CLI commands use the same tab execution queue"
created: 2026-09-16
updated: 2026-09-21
---

- Status: Adopted
- Follow-up decision: [0186](0186-mew-cancel-active-continues-queue.md) — User cancellation cancels only the active job and continues running the pending queue
- Follow-up decision: [0164](0164-mew-agent-memory-protection.md) — Cancel jobs, hold the queue, and require explicit resumption when memory is low
- Decision maker: Song Sanghoon (directive)
- Partially supersedes: [0152](0152-mew-agent-cli-command-records.md) — Immediate CLI execution and exclusion from the ACP queue

## Decision

AI messages, CLI commands, and `/clear` in the same agent tab use a shared FIFO queue owned by the supervisor. If a job is already running, CLI commands wait too, and AI messages arriving during CLI execution also wait. Do not create tmux until the job's turn to run. Do not block jobs in other tabs.

Do not convert CLI commands into AI prompts. Preserve the command type and record ID in queue entries, and display, cancel, and reorder CLI commands in the existing on-screen queue. Unlike regular prompts, CLI source text cannot be edited. Stopping cancels both the active job and pending entries; closing the panel or browser preserves the queue.

Record commands after `/clear` in the new conversation created by the successful boundary transition. Finalize the conversation ID and display position when execution starts. Retain the completion recording, output compression, tmux termination, and permission boundaries from ADR 0152. Record detailed contracts and verification in the [session document](../../development/agent-sessions.md).

## Rationale

Match execution order to the on-screen input order and prevent AI and CLI from unintentionally making simultaneous changes in the same working folder. Use the independent supervisor's queue rather than browser memory to preserve execution order during reconnection.
