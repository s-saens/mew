---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Agent memory limits and work suspension. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0164 — Agent memory limits and work suspension"
created: 2026-09-21
updated: 2026-09-21
---

- Date: 2026-09-21
- Status: Adopted
- Subsequent decision: [0205](0205-mew-dynamic-agent-memory.md) — dynamic budget of 90% of available memory and removal of MemoryHigh throttling
- Subsequent decision: [0192](0192-mew-agent-memory-auto-resume.md) — AI continuation and automatic queue resumption after memory recovers
- Partially supersedes: [0048](0048-mew-agent-supervisor-process.md) — no OS resource limits; independent supervisor lifetime remains
- Partially supersedes: [0153](0153-mew-agent-cli-shared-queue.md) — suspend automatic FIFO execution during memory protection
- Decision makers: Song Sanghun (directed OS memory management, work interruption, and error notifications), Codex (implementation)

## Background

mew and the host must be protected from growing memory usage by agents and child tasks such as builds. A complete WSL shutdown may leave no Linux OOM record, so distinguish confirmed causes from preventive measures.

## Decision

- In environments with a Linux systemd user manager, place ACP adapters and their descendants, along with shells for agent panel CLI commands, in separate scopes within the installed `mew-agents.slice`. All tabs share an aggregate limit. Keep the mew server and supervisor outside it.
- Use `MemoryHigh` to trigger reclamation and throttling, with `MemoryMax` and `MemorySwapMax` as the final lines of defense. Default installation values are 50%, 65%, and 25% of host RAM. This is not a security sandbox.
- The supervisor checks Linux `MemAvailable` and the shared slice's remaining capacity. If memory is insufficient, cancel active work, preserve and suspend the queue, display an error, and write supervisor logs. After recovery, resume only on an explicit new submission. Do not automatically rerun interrupted turns.
- Do not use SIGSTOP alone because it does not release memory. OS limits stop processes that ignore cancellation and sudden memory spikes.
- In environments without systemd, log that OS isolation is not applied and use available-memory protection. Required mode refuses execution if isolation cannot be prepared. Do not rerun without limits after execution in a configured scope fails.
- Regular terminals, the terminal runtime, separate external services, and Windows-side processes are outside this slice's scope. Do not indicate that their loads are also protected.

## Rationale

Putting the supervisor in the limited group would cause error reporting and the queue to disappear together when the kernel kills it. Group only work processes to retain the existing independent supervisor contract and enforce limits before a machine-wide OOM. The [Operations document](../../../../docs/operations/agent-memory.md) owns application, limitations, and recovery.
