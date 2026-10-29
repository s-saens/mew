---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Start a new conversation from the agent window's history. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0099 — Start a new conversation from the agent window's history"
created: 2026-08-31
updated: 2026-09-11
---

- Date: 2026-08-31
- Status: Adopted
- Follow-up decision: [0103](0103-mew-queued-clear-session-boundary.md) — Immediate switching with /clear in the input field; new conversations from history continue to switch immediately
- Partially supersedes: [0097](0097-mew-agent-panel-removes-cwd-bar.md) — Clear floating button placement and behavior
- Decision maker: Song Sanghoon (directive)

## Background

Clear and history each provided a way to switch sessions, so starting a new conversation and selecting a previous one were separate. While work was in progress, Clear also had separate rules for scheduling at the end of the queue and forcing termination with a double-click.

## Options

1. Keep Clear and history separate — preserves existing behavior but leaves two paths for selecting a session.
2. Add new conversations to history — select previous and new conversations from one menu, leaving a single rule for immediate switching.

## Decision

Adopt option 2.

- The button in the existing Clear position becomes `히스토리` and uses the past conversations icon.
- As before, the history list loads only when opened. If the current tab has activity, show `새 대화` at the top of the list; if it has no activity, as with a new session, do not show it.
- Clicking `새 대화` immediately closes the current session and starts a new session in the same tab, even if work is running and prompts are queued. There is no scheduling toggle or double-click force termination.
- Entering exactly `/clear` in the input field has the same effect as `새 대화`. Instead of passing it to the CLI, Mew clears both the session pointer and transcript
  cache and starts a new session, so previous messages disappear from the current screen and can be reopened only from history.
- Keep duplicate prevention and loading behavior for selecting past sessions unchanged.

## Rationale

The next session state is either a new conversation or a past conversation. Placing both choices in the same list aligns their meaning and location, and the click rules do not change with the work state.
