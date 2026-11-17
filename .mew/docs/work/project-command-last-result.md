---
title: "Last result for project command buttons"
description: "Records the November 17 retention of one-shot project command output and exit codes, local verification, and runtime application limits."
created: "2026-11-17"
updated: "2026-11-17"
---

One-shot project buttons closed their tmux sessions as soon as commands finished, making success and failure output unavailable. They now use the existing PTY command runner to preserve the latest output and exit code per project and button. The popup follows a running command into its saved result and provides a compressed full-output download. The [command button contract](../features/terminals-agents-automation/project-command-buttons.md) owns the scope and retention behavior; the [user guide](../../../docs/guides/commands.md) explains how to view it.

Local verification:

- The project command server and store tests passed (14 tests), including isolated tmux success and failure, short and large output, TTY availability and Git identity, project isolation, replacement, concurrent starts, and recovery from a failed start.
- Four browser tests passed for the result popup and existing command menus, covering live completion, reopening, fast execution, retries, delayed responses, keyboard use, and inactive project scope.
- The existing agent-command runner suite passed (5 tests) on a separate rerun. A combined run initially encountered a transient tmux server shutdown while listing sessions; the new integration test now keeps its isolated test server alive between short commands.
- `npm run build` passed, with Vite's large-chunk warning. `npm run lint` passed with existing repository warnings; focused lint on the changed feature files passed without warnings.
- `npm run check:docs` validated all descriptions but reported 39 existing link errors elsewhere in the working tree, including missing MOC and decision index paths.

The build refreshed `dist/`, which an existing Mew process may serve; the server process was not restarted and its source changes are not yet loaded there. No deployment or launcher operation was performed. Native Windows execution and physical-device interaction were not tested. Output from commands that finished before this change cannot be recovered.
