---
title: "Actual listening ports of command sessions and public device preview links"
description: "Records the decision to detect command button ports from descendant processes' LISTEN sockets and have the remote launcher pass the public device base to open /port-number in a new tab, along with boundaries for older versions and lookup failures."
created: "2026-10-27"
updated: "2026-10-27"
---

Status: Adopted

## Background

Even when a command button started a development server, the list only showed whether a session existed. The user requested showing actual open ports to the left of the run and terminal buttons on the same row and accessing them through `mew.run/<user>/<device>/<port>`. The entry and authentication paths in the existing [preview decision](0023-login-desktop-and-port-preview.md) can be reused, but the remote app runs inside a frame on a separate origin, so its current origin alone cannot produce a public device link.

## Decision

Add a `ports` array to the command list's runtime state. Associate the pane PID and descendant processes with their actual TCP LISTEN sockets; do not infer ports from commands or logs or save them in settings. Lookups retain existing terminal permissions and detect ports only when port preview permission is available. Treat detection failures as an empty array and continue providing command controls.

The remote parent generates the public `previewBaseUrl` using the central origin and current user and device. The launcher checks the origin and passes it to the app through the existing MessagePort context. The app appends the port to the validated base and opens a new tab; it displays an error on older central versions that provide no base. Direct access uses the current origin. The [preview contract](../development/port-preview.md) and [shell terminal feature contract](../features/terminals-agents-automation/tmux-shell-terminals.md) own detailed behavior.

## Alternatives and Rationale

- Parsing a command's `--port` or URLs in terminal output makes it difficult to distinguish defaults, automatic port changes, and logs from previous runs from the actual listening state. Associate ports based on OS sockets and their owning processes.
- Attaching all host ports to every command makes it impossible to identify which command opened an app. Restrict the scope to the pane's descendants.
- Using the remote app's current origin or a fixed `mew.run` domain produces incorrect URLs for app frames and custom central addresses. The parent that owns the public path passes only the base.

## Impact and application

Preserve port preview authentication, capability and origin isolation, and existing manually entered addresses. This depends on local OS lookup tools and the process hierarchy; automatic previews are not guaranteed for non-HTTP TCP services or reparented daemons. Validate macOS and Windows parsers in isolation, with testing on actual devices performed separately.

Changes to the host app and central launcher must each be applied. Because `mewlink/` in this checkout is excluded from Git, preserve central changes as a separate patch and do not force-add them to the public repository. Record verification results and production application limitations in the [work record](../work/command-port-previews.md).
