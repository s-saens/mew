---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Mew uses a single checkbox to complete a to-do. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0066 — Mew uses a single checkbox to complete a to-do"
created: 2026-08-21
updated: 2026-08-21
---

- Date: 2026-08-21
- Status: Adopted
- Decision maker: Song Sanghoon (directive)

## Background

[ADR 0059](0059-mew-typed-project-linked-home-todos.md) added an icon for selecting among three states for today's to-dos: `done`, `canceled`, and `missed`. Changing a single completion indicator required
first interpreting three states, which did not fit a to-do widget intended for quick checking. Dated and recurring
to-dos already used a single completion checkbox, so interactions also differed by type.

## Options

1. Keep the three status buttons only for today's tasks — retrospective information is retained, but marking tasks complete is complicated and the UI differs by type.
2. Use a completion checkbox for all types — canceled and missed can no longer be recorded, but transitions between open and done are immediately visible.

## Decision

All types in the to-do widget use a single checkbox to change completion status. Checking it saves `status: done`; unchecking
it saves `status: open`. Remove the Canceled and Missed buttons from today's to-dos.

The `canceled` and `missed` values and API types are not removed immediately, to preserve compatibility with existing stored data and external calls. In the widget, they
are grouped with finished items and displayed as checked, and cannot be newly selected. If the user unchecks an item, it changes to `open`.

This decision replaces ADR 0059's rule that “today's to-dos record Done, Canceled, and Missed states” and the corresponding state selection UI. To-do
types, project links, and the per-user `todos.json` ledger remain in place.

## Rationale

- A single checkbox is the most familiar and fastest way to mark a task complete in a to-do list.
- Using the same action in the same location for all three types eliminates the need to learn the meanings of separate status icons.
- Keeping stored values for now allows the UI to be simplified first without breaking existing data or API consumers.

## Results

- The new UI cannot record canceled or missed statuses.
- Existing `canceled` and `missed` items remain checked under “Show finished tasks too,” and unchecking them changes their status to `open`.
