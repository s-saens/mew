---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Scheduled sends from agent tabs return to the original session. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0091 — Scheduled sends from agent tabs return to the original session"
created: 2026-08-27
updated: 2026-08-27
---

- Date: 2026-08-27
- Status: Adopted
- Decision maker: Song Sanghoon (directive)
- Related: [0036](0036-mew-agent-session-controls-and-usage.md) · [0048](0048-mew-agent-supervisor-process.md) · [0079](0079-mew-agent-tabs-resume-after-idle.md)

## Background

Messages in the agent window could only be sent immediately or queued in an ongoing session. A feature is needed to send a message once at a future time while preserving a specific tab's conversation context. The browser and supervisor process may close before then.

## Decision

- Store scheduled items in `<DATA_DIR>/agent-scheduled-prompts.json` on the server. Do not store them in browser localStorage or a running supervisor's memory.
- Each item contains the runtime, tab ID, cwd, the tab's ACP session ID, prompt, selected skill, and execution time.
- At the scheduled time, the server attaches to that tab's supervisor or starts a new one. It gives a new supervisor the saved session ID as a resume hint and sends the prompt after ACP `session/load`.
- Use the existing `AgentSession.prompt()` contract unchanged. If the session is in progress, the scheduled message goes at the end of the server queue; if idle shutdown has occurred, restore the session first.
- For a transient error immediately before execution, retain the item and retry after 1 minute. Remove an item from the list only after its one-time send succeeds.
- The registration API requires the same owner/manager permissions as agents and terminals.

## Rationale

An independent cron job starts a new session and a new tmux execution, so it cannot share the tab's conversation context and queue. Reusing the supervisor's existing resume path allows safe follow-up sends to the same session without a separate transcript store or long-running resident process.

## Results

Scheduled items are processed while the mew process is running. Items due while the server was down run immediately after the next startup; no external scheduler guaranteeing an exact wall-clock time is introduced.
