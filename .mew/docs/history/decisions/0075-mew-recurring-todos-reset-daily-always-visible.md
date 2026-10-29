---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Recurring to-dos reset daily and remain visible at all times. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0075 — Recurring to-dos reset daily and remain visible at all times"
created: 2026-08-24
updated: 2026-08-24
---

- Date: 2026-08-24
- Status: Adopted
- Decision maker: Song Sanghoon (directive)

## Background

The `recurring` type in [ADR 0059](0059-mew-typed-project-linked-home-todos.md) was recurring in name only and behaved like the other types. Once checked, it remained complete the next
day and was no longer a "task for today." Unless "Show Completed Tasks" from [ADR 0066](0066-mew-todo-single-completion-checkbox.md) was enabled, it disappeared, making it impossible even to
check what was done yesterday. Users expect recurring tasks to reset daily and completed tasks to remain
visible at all times.

## Options

1. Reset on every client connection — when viewing the server from multiple screens, each makes a different determination, and the ledger (status) and display diverge.
2. Server resets at midnight using a timer — requires an active timer in a continuously running process, and handling days when it is not running is ambiguous.
3. Reset on read: in `listTodos()`, return completions from a previous day to open and save them. Without a separate timer, every read path produces
   the same result.

## Decision

Recurring (`recurring`) to-dos **record the completion date and revert to open after that day ends.**

- Add `doneDate` (YYYY-MM-DD or null) to `TodoItem`. When status changes to `done` in `updateTodo`, stamp it with today's date in the server's
  local time.
- While reading, `listTodos()` resets recurring items that are `canceled`, `missed`, or "done with a doneDate other than today" to `open` (doneDate
  null), and writes back to the ledger if anything changed. This is a reset on read without timers or cron.
- Today and dated (`today` and `dated`) items are not reset — their completion history is the record.
- In the widget, **always display** recurring items regardless of the "Show Completed Tasks" checkbox. Daily resets are their intended behavior, so there is no reason
  to hide them; the row's checkmark indicates whether they have already been done today.

## Rationale

- The unit for "recurring tasks" is the day — the state represents "done today," rather than completion in general.
- Resetting on read is accurate without timers in an architecture like mew's that reads the ledger on every request, and even if the server is off for several days, the next
  first read handles everything at once.
- Keeping items visible without changing the widget filter puts reflection ("What did I do yesterday?") and today's progress in the same list.

## Results

- `todos.json` gains a `doneDate` field. Older data without it is read as null during normalization, and old recurring items in the done state reset automatically
  on the next read.
- `doneDate` is added to `TodoItem` in API responses (as an additional field, it does not break existing consumers).
- A recurring item's `updatedAt` is updated on reset — because the value actually changes, not because a completion retention period has been introduced.
