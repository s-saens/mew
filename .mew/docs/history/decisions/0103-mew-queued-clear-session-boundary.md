---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: /clear is a session boundary in the prompt queue. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0103 — /clear is a session boundary in the prompt queue"
created: 2026-09-01
updated: 2026-09-01
---

- Date: 2026-09-01
- Status: Adopted
- Subsequent decision: [0140](0140-mew-codex-clear-releases-writer.md) — use a new process at Codex queue boundaries; retain the queue ordering contract
- Partially supersedes: [0099](0099-mew-agent-history-new-conversation.md) — the scope of immediate session switching for `/clear` in the input
- Decision maker: Song Sanghoon (directive)

## Background

Input entered during work remained in the server prompt queue, but entering exactly `/clear` immediately closed the session on the client. This discarded the ongoing work and messages already queued behind it without warning, and ordering could not express which session would execute messages entered after `/clear`.

## Options

1. Keep `/clear` immediate — simple, but conflicts with queue ordering.
2. Make `/clear` a queue item — switch to a new session after preceding work finishes, separating the context of subsequent work.

## Decision

Adopt option 2.

- Entering exactly `/clear` in the input inserts a session boundary into the server prompt queue. Preceding running and queued messages complete as usual.
- When the boundary reaches the front of the queue, Mew calls ACP `session/new` on the same agent connection and changes the transcript and session pointer through a `reset` event.
- Prompts queued after `/clear` are sent only to the new ACP session.
- The immediate session switching behavior of `새 대화` in history and closing a tab is outside the scope of this change.

## Rationale

The queue is a contract that preserves the user's input order. Commands that change sessions must follow the same ordering so that previous work can finish while the context of subsequent work is clearly separated.
