---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Automatically resume agents after memory recovery. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0192 — Automatically resume agents after memory recovery"
created: 2026-10-03
updated: 2026-10-03
---

- Date: 2026-10-03
- Status: Adopted
- Partially supersedes: [0164](0164-mew-agent-memory-protection.md) — Resume only on explicit submission; prohibit automatic AI continuation
- Decision makers: User (instructed automatic resumption after memory cleanup), Codex (implementation)

## Decision

The supervisor monitors memory even during a protection hold. Once the existing recovery headroom requirement is met and cancellation completes, place a message to continue the AI task in the same session at the front of the queue and run it automatically. Instruct it to check completed changes and perform only the remaining work, retaining the original model, effort, and permissions. A user stop removes automatic continuation. Retain queue editing, authentication holds, and usage holds.

Do not rerun CLI commands, to avoid duplicate side effects; automatically resume from the next queued task. Recovery when the OS forcibly terminates the adapter or supervisor is out of scope. Wait for OS reclamation or user memory cleanup to free headroom without forcibly clearing caches or terminating other processes.

The [operations document](../../../../docs/operations/agent-memory.md) owns the current contract.
