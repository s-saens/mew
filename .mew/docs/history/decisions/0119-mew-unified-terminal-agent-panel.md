---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Terminals and agents use a single tab panel. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0119 — Terminals and agents use a single tab panel"
created: 2026-09-07
updated: 2026-09-07
---

- Date: 2026-09-07
- Status: Adopted
- Follow-up decision: [0134](0134-mew-dockable-workspace-panels.md) — Separate agent and regular terminal panels again with shared docking; retain per-tab session ownership
- Partially supersedes: [0034](0034-mew-agent-panel-acp-reintroduction.md) — The provision for separate auxiliary panels for the agent window and regular tmux terminals
- Partially supersedes: [0094](0094-mew-account-synced-workspace-ui-state.md) — Auxiliary panel state that stores `agentOpen` and `tmuxOpen` separately
- Partially supersedes: [0117](0117-mew-terminal-agent-tabs-for-claude-and-antigravity.md) — Extend the terminal interface of agent tabs beyond official agent TUIs to regular tmux shells
- Decision makers: Song Sanghun (direction), Codex (design and implementation)

## Background

Mew had separate panels for agents docked on the right and for regular tmux terminals. However, Claude Code and Antigravity
already use `TmuxTerminal` inside agent tabs, reducing the reason to maintain two sets of tabs, panels, resizing behavior,
and mobile foreground state. Users want to mix AI chats and shells in task-based tabs and switch between
them in one panel.

## Options

1. Keep both auxiliary panels and add only buttons to move between them — Persisted state, shortcuts, mobile stacks, and tab models remain separate.
2. Nest the regular terminal session list inside the agent panel — Creates two tab bars within the panel, and the meaning of a tab differs by interface.
3. Add regular tmux shells as a new tab runtime and remove the standalone terminal panel — All conversations, TUIs, and shells use the same tab lifecycle.

## Decision

Adopt option 3.

- The user-facing name is **Terminal•Agent Panel**. The header menu, floating handle, and accessible name for closing also use this name.
- Add `tmux 터미널` to the runtime list for new tabs. Selecting it creates a dedicated tmux session for the tab that opens a regular shell
  in the tab's cwd, then attaches through the existing `TmuxTerminal`.
- Each tab owns exactly one ACP session, official agent TUI, or regular tmux shell. Closing the panel leaves the session running; the corresponding
  ACP supervisor or dedicated tmux session is terminated only when the tab's `×` is clicked.
- Regular shells are also terminal surfaces, so they are not eligible for agent sets or unattended scheduled tasks. They provide no installation
  or authentication UI and use tmux and the login shell already required on the server.
- Remove the standalone `TmuxTerminalPanel` auxiliary panel, the separate terminal entries in the header and floating handle,
  and the `terminal` mobile panel state. Existing terminal shortcuts toggle the unified panel to preserve muscle memory.
- For one-time compatibility, an old `tmuxOpen=true` remaining in the account ledger or browser is treated as a signal to open the unified panel. Existing tmux sessions
  with generic names are neither automatically terminated nor speculatively migrated to new tabs.
- Consolidate the editor's `Ctrl+L` reference target into `agent` alone; when the active tab is tmux, that terminal receives the reference. Esc inside
  a terminal is passed to the TUI or shell and is not consumed to close the panel.

## Rationale

Reusing the already verified per-tab hidden tmux sessions and `TmuxTerminal` eliminates the need for a new terminal protocol or two layers of tab
UI. A single panel state lets desktop width, mobile foreground order, tab movement, closing, and reference forwarding share
the same rules. Existing sessions are not automatically migrated because there is no information to safely map ownership between
per-account agent tab ledgers and server-wide tmux names.

## Results

- Restoring the old standalone terminal panel as it was is not prohibited from being tried again. However, separating it again requires a new
  decision based on distinct lifecycle or simultaneous display requirements that unified tabs cannot address.
- Regularly named tmux sessions created in the standalone panel may remain on the server, but they do not appear in the unified tab list.
