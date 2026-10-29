---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: extend mew home to-dos with types and project links. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0059 — Extend mew home to-dos with types and project links"
created: 2026-08-20
updated: 2026-09-11
---

- Date: 2026-08-20
- Status: Adopted
- Subsequent decision: [0066](0066-mew-todo-single-completion-checkbox.md) — UI for selecting Done, Canceled, or Missed
- Subsequent decision: [0075](0075-mew-recurring-todos-reset-daily-always-visible.md) — daily reset and persistent visibility for recurring to-dos
- Decision maker: Song Sanghoon (directive)

## Background

[ADR 0056](0056-mew-user-owned-home-todos.md) moved home to-dos to a per-user `todos.json` ledger, but represented item types only through the presence or absence of a due date and a
single `done` field. The actual home screen needs to show “things to do today,” “things with deadlines,” and “things to
do regularly regardless of date range” together, and show which projects each item relates to.

For today's to-dos in particular, even after the day has passed, recording “done,” “canceled,” or “should have done it but couldn't” must take priority over a simple completion flag.

## Options

1. Classify only in widget-local state — leaves the storage schema unchanged, but classifications disappear on refresh or in another browser.
2. Distribute storage across per-project TODO files — project links are natural, but personal to-dos and recurring tasks become scattered across multiple repositories.
3. Extend per-user `todos.json` items — structure types, statuses, and project links while retaining the existing ledger location.

## Decision

Home to-do items remain stored in per-user `todos.json` files, with expanded
fields. Items have `id`, `text`, `type`, `status`, `done`, `due`, `projects`, `createdAt`, and `updatedAt`. `type` is
`today`, `dated`, or `recurring`; `status` is `open`, `done`, `canceled`, or `missed`. `projects` is an array of related
project names and supports multiple selections.

Existing items are migrated when read. Items with `due` are treated as `dated`; those without it are treated
as `today`. `done: true` is interpreted as `status: done`, and `done: false` as `status: open`. The `done` field is retained for API compatibility
and is computed as true only when `status === done`.

## Rationale

- Storing the three types as a field allows the home and calendar widgets to use the same ledger while creating the views each needs.
- Expanding `status` beyond `done` preserves retrospective statuses for today's to-dos.
- Using an array of project names for project links instead of file anchors allows quick categorization without choosing a document location,
  and allows project tab icon assets to be displayed as is.

## Results

- The calendar continues to display only items with `due`.
- Actual recurrence interval calculations for recurring tasks do not exist yet. Currently, `recurring` is a type for “items that must remain visible regardless of date.”
