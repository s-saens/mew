---
title: "Terminal browser requests"
description: "Records the terminal-to-host Browser bridge, local regression checks, and runtime and callback verification limits."
created: "2026-11-17"
updated: "2026-11-17"
---

## Purpose and result

Allow CLI browser requests, including login flows with a host localhost callback, to open the existing Mew Browser from a connected terminal. The [terminal contract](../features/terminals-agents-automation/tmux-shell-terminals.md) defines the session and permission boundaries; [ADR 0184](../decisions/0184-terminal-browser-requests.md) records the choice.

## Local verification

- The terminal helper, account and permission routing, URL validation, socket decoding, direct PTY, terminal session, and Git bootstrap tests passed: 18 tests across `server/terminal-browser-bridge.test.ts`, `packages/tmux-term/src/browserOpenMessage.test.ts`, `packages/tmux-term/src/server/direct-terminal.test.ts`, `packages/tmux-term/src/server/direct-terminal-exit.test.ts`, `server/agentTerminal.test.ts`, `server/terminal-git-bootstrap.test.ts`, and `src/components/deferred-agent-terminal.browser.test.ts`.
- `npm run build` passed, including TypeScript; Vite reported large-chunk warnings. `npm run lint` passed with warnings.
- `npm run check:docs` validated 848 descriptions and reported 39 existing missing or invalid links elsewhere in the repository, including existing links in the terminal guide's metadata.

## Application boundary

No deployment or server lifecycle operation was performed. A build changes the assets served from `dist/`, but the running server needs a separate restart to load the bridge. Open a new terminal afterward; refresh an older client after the server changes protocol. Real npm authentication and a live provider redirect were not exercised. Same-host localhost routing follows the native Browser's network; separate namespaces may require forwarding. Native Windows is unsupported. A tmux session that exits outside Mew does not immediately release its bridge; explicit tab termination or server exit cleans it up.
