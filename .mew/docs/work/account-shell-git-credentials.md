---
title: "Mew account Git credentials in terminals and agents"
description: "Records the per-account GitHub credential change for Mew terminal and agent Git commands, local verification, and application limits."
created: "2026-11-17"
updated: "2026-11-17"
---

Git commands in a Mew terminal or agent inherited the server user's GitHub credentials, so a push could use a different account from the Git panel. [Decision 0181](../decisions/0181-account-shell-git-credentials.md) extends the Mew account connection to those commands. The [Git connection contract](../development/git-connections.md#agent-execution-and-os-boundaries) owns the current execution boundary.

Local verification:

- `node --test --test-concurrency=1 server/account-git-credentials.test.ts server/agent-git-identity.test.ts server/agent-commands.test.ts server/agentTerminal.test.ts server/terminal-git-bootstrap.test.ts packages/tmux-term/src/server/direct-terminal.test.ts server/command-button-results.test.ts`: 26 tests passed. An initial parallel run encountered a tmux test-server collision.
- `node --test server/release-runtime.test.ts server/git-connections.test.ts server/github-auth.test.ts`: 26 tests passed, including runtime source staging and existing Git connection checks.
- `npm run build` passed with a Vite chunk-size warning. Targeted `npm run lint --` passed for the credential helper, agent and terminal execution files, and their related tests.
- `npm run check:docs` accepted all 842 descriptions but reported 39 link errors outside the files changed for this task, including missing existing MOC and decision README paths.

The running Mew server was not restarted and the changes were not deployed. Existing terminal, multiplexer, and agent sessions must be recreated after the server-side change is applied. Windows shell bootstrap and actual GitHub transfers were not verified by these local checks.
