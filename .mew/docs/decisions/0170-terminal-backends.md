---
title: "0170 — Select terminal backends per tab"
description: "Accepts a terminal picker for the default shell, tmux, Zellij, and GNU Screen, retaining existing tmux sessions and recording backend-specific lifetime and recovery trade-offs."
created: "2026-11-12"
updated: "2026-11-12"
---

- Status: Accepted

## Context

Regular terminal tabs required tmux even when a user only needed a shell or preferred another multiplexer. The terminal panel also created a tmux tab immediately, leaving no place to choose a backend. Existing account tabs and tmux sessions must remain usable.

## Decision

Let each terminal tab select the default shell, tmux, Zellij, or GNU Screen from a picker in the terminal panel. Detect executable availability on the server and disable unavailable choices. Store the selected runtime with the existing account tab metadata; retain the existing tmux route and session identity for older tabs.

Run the default shell in a server-owned PTY. Use the same PTY connection for Zellij and Screen, attaching to named multiplexer sessions so they can survive a server restart. Replay bounded recent output after a browser reconnect. Closing a tab terminates its session; closing a panel or disconnecting a browser leaves it running. The [terminal contract](../features/terminals-agents-automation/tmux-shell-terminals.md) owns the concrete behavior and limits.

## Alternatives and rationale

Requiring tmux for all terminals preserves one session manager but excludes users who want a direct shell or another multiplexer. Making the multiplexer a global setting prevents using different kinds in the same project. A per-tab choice supports both without migrating existing tmux sessions. A direct shell avoids a multiplexer dependency at the cost of losing that session when the server stops.

## Consequences

Users can mix terminal types and recover their selections across devices. Zellij and Screen require separate installations. Default-shell sessions cannot survive a server restart; multiplexer recovery depends on the named session still existing. Replay is bounded, and a reconnect is not a full terminal history. Command execution and permissions remain those of the server account.
