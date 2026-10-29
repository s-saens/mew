---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Switching root projects does not terminate agent tasks. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0092 — Switching root projects does not terminate agent tasks"
created: 2026-08-27
updated: 2026-09-11
---

- Date: 2026-08-27
- Status: Adopted
- Follow-up decision: [0095](0095-mew-agent-sets-as-tab-presets.md) — Separate agent-set sessions removed; tab supervisors still survive switches
- Partially supersedes: [0086](0086-mew-root-project-spa-handoff-and-cache.md) — The scope that cleaned up agent sessions when switching roots
- Decision maker: Song Sanghoon (directive)
- Related: [0048](0048-mew-agent-supervisor-process.md) · [0087](0087-mew-agent-tabs-per-root-project.md) · [0091](0091-mew-agent-tab-scheduled-prompts.md)

## Background

When switching root projects, `switchWorkspace()` terminated agent supervisors and directly owned sessions for the previous working path. Opening another project in the UI interrupted ongoing tasks and scheduled sends, conflicting with the purpose of independent supervisors.

## Decision

- Switching root projects cleans up only tree watchers and collaboration rooms. It does not terminate agent supervisors or agent-set sessions.
- The agent tab UI remains separated by root project. After a switch, the UI connects only to the new root's tabs, but supervisors for the previous root continue processing background tasks and queues in their own fixed cwd.
- Shutting down the mew server does not terminate independent supervisors either. When the server restarts, it can reconnect to the same sockets, and scheduled sends read the data file and execute overdue items.
- Only `close_session`, which explicitly closes a tab, terminates that tab's supervisor.

## Rationale

Supervisors already run in a different process group from mew and fix their cwd at creation. Changing the active root therefore does not change a supervisor's file access. Disconnecting only the UI preserves the idle policy while ensuring task continuity.

## Results

When reopening a previous agent tab after switching projects, the ongoing or completed conversation continues through supervisor replay/session restoration. Old idle supervisors whose tabs have not been explicitly closed may terminate under the existing idle policy.
