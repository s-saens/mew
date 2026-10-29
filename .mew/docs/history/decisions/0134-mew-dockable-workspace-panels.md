---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Separate workspace panels and move them to a shared split layout. Preserves the choices, rationale, and subsequent changes from that time; consult Mew's owning documents for the current contract."
title: "0134 — Separate workspace panels and move them to a shared split layout"
created: 2026-09-11
updated: 2026-09-12
---

- Date: 2026-09-11
- Status: Adopted
- Follow-up decision: [0197](0197-mew-device-local-workspace-layout.md) — remembers workspace panel layouts per device; preserves execution session and mobile foreground contracts
- Follow-up decision: [0135](0135-mew-git-workspace-panel.md) — adds Git repository tabs to shared workspace panels
- Partially supersedes: [0119](0119-mew-unified-terminal-agent-panel.md) — integration of agent and regular shell panels and toggles; preserves per-tab session ownership
- Partially supersedes: [0094](0094-mew-account-synced-workspace-ui-state.md) — terminal open state separate from workspace panel layout
- Decision makers: User (requested panel separation and drag placement), Codex (implementation design)

## Background

The editor uses a split layout, agents use a fixed right panel, and the web browser uses a separate window. Separate panels are needed to work while viewing an agent and a regular shell simultaneously. The user requested dragging these panels to dock them in other areas using the same method.

## Decision

- Manage the editor, agents, regular terminals, and web browser in a split layout within a shared workspace. Dragging a header moves the panel; dragging a tab moves that tab or detaches it into a separate panel.
- Show layout previews at the left, right, top, and bottom edges. Dropping a tab in the center of a panel of the same type merges it; with a panel of another type, place it alongside that panel.
- Allow the web browser to dock only on the left or right. Do not create layouts that flatten it inside a top/bottom split. Do not allow this restriction to be bypassed by docking other panels above or below the browser.
- Moving tabs or collapsing panels must not terminate ACP sessions or tmux processes. All agent tabs continue to use the single existing account ledger. Classify regular shell tabs under terminal panels and preserve their IDs, cwd, and session connections. Agent TUIs such as Claude and Antigravity remain in agent panels.
- Save the layout and tab-to-panel assignments in workspace UI state per account and root project. Incorporate existing editor splits and agent tabs into the initial layout, and distinguish the new format with a separate version field.
- On mobile, preserve the contracts for bringing panels to the foreground and back navigation. Desktop docking layouts must not force multiple small panes on mobile.
- Do not change login, subscriptions, browser networking, or shell permissions. Do not add copy explaining execution information because of panel placement.

## Rationale

Separating split layouts from tab lifecycles ensures that repositioning panels does not affect running work. Manage layout, drop detection, and resizing jointly instead of adding separate panel implementations that differ only in position.

Manage implementation and validation contracts in the [UI contracts](../../development/ui-contracts.md).
