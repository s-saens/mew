---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Remove the working directory input bar from the mew agent window. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0097 — Remove the working directory input bar from the mew agent window"
created: 2026-08-31
updated: 2026-09-11
---

- Date: 2026-08-31
- Status: Adopted
- Follow-up decision: [0099](0099-mew-agent-history-new-conversation.md) — Clear button placement and behavior
- Partially supersedes: [0077](0077-mew-agent-tab-working-directory.md) — The UI for entering and changing the working directory below the tab bar
- Decision maker: Song Sanghoon (directive)

## Background

The cwd input bar below the tab bar put path controls ahead of the agent conversation and mixed frequently used conversation controls such as Clear and session information into the same row.

## Options

1. Keep the path input bar — cwd can be changed within the tab, but the top of the conversation screen is crowded.
2. Remove the input bar and use the default cwd for new tabs — disable path switching and separate session controls into a compact area.

## Decision

Adopt option 2.

- New agent tabs start with the current workspace root as cwd as before, and the runtime, tab, and cwd session keys and history storage boundaries remain unchanged.
- Hide the cwd address bar, autocomplete, Home, and path switching controls in the agent window.
- Place the existing Clear and Session Info buttons horizontally as small, round floating buttons at the upper left below the header. Session
  Info opens in a standalone popup that does not shift the conversation area and closes on an outside click or Esc.

## Rationale

The default working directory when starting a conversation is sufficiently predictable. Separating frequently used session controls from the path bar gives the conversation body more space.
