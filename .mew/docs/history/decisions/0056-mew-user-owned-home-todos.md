---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew home to-dos are user-added items, not file markers. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0056 — mew home to-dos are user-added items, not file markers"
created: 2026-08-19
updated: 2026-09-11
---

- Date: 2026-08-19
- Status: Adopted
- Subsequent decision: [0059](0059-mew-typed-project-linked-home-todos.md) — Schema for to-do types, statuses, and project links
- Decision maker: Song Sanghoon (directive)

## Background

[ADR 0042](0042-mew-home-tab-and-workspace-switch.md) designated markers in workspace files as the home tab's to-do ledger. Keeping code and TODOs together had the advantage of preventing
a separate DB from becoming stale, but the marker approach did not fit quickly adding personal to-dos from
the home screen. The user requested "to-dos registered by the user instead of scraping TODOs from documents."

## Options

1. Keep file markers and provide a UI for inserting them from home — code and TODOs stay together, but creating a new to-do requires choosing a project, file, and line first.
   It is difficult to accommodate personal schedules or tasks unrelated to documents.
2. Maintain one global team TODO file — this reduces file scanning, but mixes multiple users' items and leaves guest/member boundaries and read scope
   unclear.
3. A TODO state file for each logged-in user — separate from documents, it allows quick entry and immediate placement on the calendar when a due date exists. However,
   it does not automatically synchronize with markers in code.

## Decision

The home to-do ledger is `todos.json` in the mew server data folder, rather than file markers. Items are separated by logged-in
user email and store `id`, `text`, `done`, `due`, `createdAt`, and `updatedAt`. Only items with `due` appear in the calendar widget.

This decision replaces the portion of [ADR 0042](0042-mew-home-tab-and-workspace-switch.md) stating that "the to-do ledger is the markers themselves inside files." The decisions on the home tab, widget
registry, and workspace switching remain in effect.

## Rationale

- For home screen to-dos, the user workflow matters more than the location of project files. Typing into an input field and choosing a due date fits the mobile
  home tab better.
- Removing file scanning eliminates scan-specific rules such as build artifact exclusion lists, excluding backtick examples, and rechecking line numbers and labels.
- Per-user storage allows personal to-dos to be managed independently of team chat and document permissions, and prevents workspace file paths from leaking to
  guests.

## Results

- Existing markers in files no longer automatically appear in the home to-do list.
- If document-linked TODOs are needed, redesign them as a separate feature. This decision does not prohibit "task management with document anchors"
  itself.
