---
title: "Route terminal browser requests to the host Browser"
description: "Accepts account-scoped, ephemeral terminal browser requests through a private local bridge and the existing authorized host Browser, including callback and session limits."
created: "2026-11-17"
updated: "2026-11-17"
---

## Status

Accepted. Extends [ADR 0170](0170-terminal-backends.md) and uses the Browser in [ADR 0150](0150-shared-browser-login.md).

## Context

CLI sign-in commands often ask the operating system to open an authorization URL. A server-side shell may not have a desktop browser launcher, and a browser on the user's device cannot necessarily reach the shell's localhost callback.

## Decision

Supply newly created Linux/WSL account terminal sessions with a `BROWSER` helper and private session-local Unix socket. Forward validated HTTP(S) requests to one connected viewer for the same account with current Terminal and Browser permissions, then use the existing Browser navigation path. Separate request frames from PTY output so reconnect replay cannot reissue requests. Chrome runs on the host, so callbacks in the same network namespace remain local to the command. The [terminal contract](../features/terminals-agents-automation/tmux-shell-terminals.md) owns details.

## Alternatives and consequences

Parsing terminal output or escape sequences can replay old authorization URLs and does not work reliably through multiplexers. Opening on the viewer device changes the meaning of localhost. The local bridge requires a connected authorized viewer and a fresh session; retained multiplexer shells need replacement after a server restart. Remote and container network namespaces may need port forwarding. Browser navigation restrictions and provider behavior still apply.
