---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: aggregate agent budget based on available memory. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning documents for the current contract."
title: "0205 — Aggregate agent budget based on available memory"
created: 2026-10-09
updated: 2026-10-09
---

- Status: Adopted
- Partially supersedes: the fixed proportion of installed memory and MemoryHigh throttling in [0164](0164-mew-agent-memory-protection.md)
- Decision makers: Song Sanghun (instructed a dynamic available-memory limit of 90% to account for WSL memory changes), Codex (implementation)

## Decision

Repeatedly measure Linux MemTotal and MemAvailable and the agent slice's unreclaimable usage. Add memory already used by agents to the available pool, cap it at the host total, and apply 90% as the aggregate MemoryMax. Set MemoryHigh to infinity to remove throttling that silently stalls initialization. Reflect load from other apps and changes in the WSL total in the next measurement.

Do not lower MemoryMax to or below current usage. Handle budget shortages by canceling or deferring existing work, and lower the OS limit after usage decreases. Retain [0192](0192-mew-agent-memory-auto-resume.md) for automatic continuation and queue resumption after recovery. Retain scope and supervision boundaries and swap limits. Keep the current contract and application procedures in the [operations document](../../../../docs/operations/agent-memory.md).
