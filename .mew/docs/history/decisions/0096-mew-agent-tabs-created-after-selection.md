---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew agent tabs are created after selection is complete. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0096 — mew agent tabs are created after selection is complete"
created: 2026-08-31
updated: 2026-08-31
---

- Date: 2026-08-31
- Status: Adopted
- Partially supersedes: [0062](0062-mew-agent-tab-runtime-gate-and-install.md) — The behavior where `+` first creates a tab with no runtime selected
- Decision maker: Song Sanghoon (directive)

## Background

In 0062, `+` creates a `새 대화` tab before a runtime is selected and renders the selector inside that tab. The empty tab before selection remains as though it were a work unit, and its name is temporary text rather than the selected agent.

## Options

1. Keep tabs with no selection — the selector can remain inside the tab, but a temporary tab is visible.
2. Keep the selector in a pre-creation state — create a named tab only after selection is complete.

## Decision

Adopt option 2.

- `+` and the `새 탭` button shown when there are 0 tabs open the runtime | agent set selector. No tab, WS, or ACP session is created at this point.
- Selecting a runtime creates a tab named after that runtime; selecting an agent set creates a tab named after that set. The selected name is not automatically replaced by the first prompt, and users can rename the tab manually.
- Do not restore `새 대화` tabs saved under 0062 with no runtime selected. Older tabs with the same name that already have a runtime selected are renamed to the runtime name in a one-time upgrade.
- Retain the gate in 0062 that starts a session only after a runtime or set is selected, and the boundary in 0095 that defines sets as tab startup presets.

## Rationale

The selector is an input step for a new conversation, not the conversation itself. Showing tabs only with actual agent or set names makes the tab bar directly represent currently open work.
