---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Agent queued messages are locked against execution while being edited. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0118 — Agent queued messages are locked against execution while being edited"
created: 2026-09-07
updated: 2026-09-07
---

- Date: 2026-09-07
- Status: Adopted
- Partially supersedes: 0036 — Excludes items being edited from immediate queue execution after the preceding turn ends
- Decision maker: Song Sanghoon (directive)

## Background

Queued agent messages run from the front of the queue as soon as the running turn ends. If the preceding turn ended while the user was editing
a message, the original text could run before editing was complete. A single click or tap in the list expanded the full text, while a double
click or tap opened editing, creating unnecessary differences between mobile and desktop interactions.

## Options

1. Open the editor only on the client — Simple, but the original message executes if this races with the preceding turn ending.
2. Notify the server queue when editing starts and lock the item — Adds one command but prevents execution races.

## Decision

Adopt option 2.

- A single click on a message body in the queued or scheduled list starts inline editing immediately. There is no full-text expansion or double-click action.
- When editing a queued message starts, the server places an edit lock on the corresponding queue item whose original text matches.
- If any item is being edited, the entire queue stops in place even when the preceding turn ends. This prevents both races where queue indices shift during editing and overwrite another message, and later items overtaking earlier ones.
- Done saves the edited content and releases the lock; Cancel keeps the original text and releases the lock. In either case, queue execution then resumes if the session is idle.
- If the window that started editing disconnects, the locks held by that connection are released to prevent a permanent stall.
- The existing rule that a `/clear` queue boundary cannot be edited into a message remains in effect.
- The editing UI shows only `완료` and `취소`, arranged vertically. The item delete button is hidden during editing.

## Rationale

The server must own the edit lock to prevent the original text from running even when
browser rendering coincides with the end of an ACP turn. Pausing only one item while preserving queue order also preserves
the sequential execution contract in [ADR 0036](0036-mew-agent-session-controls-and-usage.md) and the session boundary in [ADR 0103](0103-mew-queued-clear-session-boundary.md).
