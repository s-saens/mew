---
title: "Terminal backend selection"
description: "Records the addition of per-tab default shell, tmux, Zellij, and GNU Screen selection, local verification, and remaining runtime and deployment limits."
created: "2026-11-12"
updated: "2026-11-12"
---

## Purpose and result

Allow a project terminal tab to use the default shell or a selected multiplexer. The terminal panel's `+` opens a picker, unavailable executables are disabled, and the chosen type is retained with account tab metadata. Existing tmux tabs retain their session path. The [terminal contract](../features/terminals-agents-automation/tmux-shell-terminals.md) defines selection, session lifetimes, recovery, and input; [ADR 0170](../decisions/0170-terminal-backends.md) records the design choice.

## Local verification

- `node --test packages/tmux-term/src/server/direct-terminal.test.ts server/agentTerminal.test.ts`: 11 tests passed. The direct PTY tests exercise a real default shell, multiple connections, disconnect and replay, termination, and authorization. An installed GNU Screen is also exercised through session creation, input, and termination. Zellij was not installed and its execution remains unverified.
- `node --test server/terminal-picker-ui.test.ts server/terminal-keybar-ui.test.ts`: both browser tests passed, including backend availability, selection, and exited-session behavior.
- `node --test server/terminal-panel-picker-ui.test.ts`: passed with the dock's add button, backend selection, session requests, and restored tab types.
- `npm run build` passed, including TypeScript checking. `npm run lint` passed with existing warnings.
- `server/agent-new-tab-ui.test.ts` failed during an agent-tab transition before reaching the terminal checks; the same failure occurred with the pre-change panel source.
- `npm run check:docs`: 806 descriptions passed; link validation failed on 39 existing missing or invalid targets, including deleted MOC and decision index paths. The new links in this work were not reported as errors.

## Application boundary

No deployment, launcher, or server start, stop, or restart was performed. Direct-shell sessions end when the server stops; raw replay is bounded and may not reconstruct a truncated control sequence or alternate screen exactly. Physical-device behavior and real Zellij sessions remain to be verified.
