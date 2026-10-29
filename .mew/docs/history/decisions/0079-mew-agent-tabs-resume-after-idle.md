---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew agent tabs automatically restore the last session even after idle shutdown. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0079 — mew agent tabs automatically restore the last session even after idle shutdown"
created: 2026-08-25
updated: 2026-09-11
---

- Date: 2026-08-25
- Status: Adopted
- Follow-up decision: [0087](0087-mew-agent-tabs-per-root-project.md) — storage scope for global tabs and the active tab
- Follow-up decision: [0093](0093-mew-account-synced-project-and-agent-tabs.md) — browser-only tab ledger
- Partially supersedes: 0046·0048 — the scope that tied tab conversation restoration solely to the memory lifetime of a running supervisor
- Decision maker: Song Sanghoon (directive)

## Background

[ADR 0048](0048-mew-agent-supervisor-process.md) allowed an ongoing turn to finish even after the browser or mew closed, and replayed events from supervisor memory if a window reattached
before 30 minutes elapsed without an attached window. However, after shutdown following 30 minutes
of inactivity, reopening the same tab created a new ACP session, leaving the tab list intact while only the
conversation disappeared. Tabs should persist like chat rooms, and idle cleanup should end only the process lifetime.

## Options

1. Never shut down the supervisor — restoration is simple, but ACP/CLI processes and memory remain indefinitely for every tab.
2. Render only the browser transcript cache — the display remains, but the new agent lacks the previous conversation context.
3. The tab remembers the last ACP session ID, and a new supervisor automatically performs `session/load`, restoring both the screen and agent
   context while cleaning up idle resources.

## Decision

Adopt option 3.

- Tabs in `mew:agent-tabs` store the last ACP session ID for each `runtime+cwd` combination so that conversations can continue when switching
  runtimes or cwd values and returning.
- The browser sends the stored session ID as a `resume` hint when connecting over WS. If a supervisor for the same `runtime+tab+cwd` is still running,
  it ignores the hint and uses the supervisor's current session.
- Only when no supervisor exists and a new one starts does it invoke `session/load` for the hinted session after the ACP handshake. It attaches the browser after transcript
  replay finishes so that an empty session created in the interim does not become the basis for the display.
- The running supervisor's in-memory replay and ACP `session/load` transcripts use different event formats. Automatic restoration replay sends a `restored`
  marker to replace the browser cache instead of merging with it. Otherwise, the same conversation is rendered twice.
- Explicitly closing a tab or starting a new session in the current tab clears both the stored pointer and the browser transcript cache.
  Automatic resume must not bring back the previous conversation when the user intended to start a new one.
- If the backend does not advertise the `session/load` capability, or the history cannot be loaded because it was deleted or corrupted, fall back to a new session
  instead of preventing the tab from opening.

## Rationale

The tab list already persists in the browser, and the ACP backend stores transcripts on disk. Reconnecting the two with a single session ID
gives conversations a chat-room-like lifetime without a separate server transcript database or indefinitely running supervisor processes. The
browser event cache only accelerates the initial display before the server starts; ACP `session/load` is the authoritative basis for restoration.

## Results

- The 30-minute idle timeout remains unchanged, so idle processes are cleaned up.
- A reopened tab incurs the cost of starting a new supervisor and ACP process and the time for `session/load` once.
- Because persistent tab information is local browser state, the tab list and session pointers are not automatically synchronized to other browsers or devices.
