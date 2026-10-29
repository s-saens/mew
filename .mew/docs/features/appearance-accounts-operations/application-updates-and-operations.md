---
id: "mew-settings-updates"
parent: "mew-settings"
title: "App updates and operations access"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-20"
status_hash: "24b9ec9b4721cf44a384c60d727d8f59e62a1ffb0c0e48aad1304d2d19c99816"
files: ["server/mewUpdate.ts", "server/runMewUpdate.ts", "server/updates.ts", "server/updateSessions.ts", "server/runUpdates.ts", "server/updateProcess.ts", "src/components/updates-modal.tsx", "shared/updates.ts"]
commits: []
description: "Feature contract covering the update screen opened with Ctrl/Cmd+U; update checks, notifications, individual and batch execution for Mew, standalone agent CLIs, and system tools; and viewing output in preserved tmux sessions. Explains sequential execution, retries after failure, reopening sessions and refreshing the browser after restarting source-based Mew, and the boundary requiring relaunch of the prebuilt CLI."
상위파일:
  - "MOC.md"
  - "_appearance-accounts-operations.md"
---

## Requirements

- On each connection, check for updates to installed Mew-related dependencies and agent runtimes, and notify the user through Mewcat.
- Provide current and latest versions, per-item execution and session viewing, and batch updates under **Updates** in the hamburger menu.
- Users with `system` permission can also open the same screen with **Ctrl/Cmd+U**. The shortcut works even when an editor, input field, or terminal has focus, and does not reopen the screen on key repeat or during IME composition. Screens with dedicated keyboard input enabled, such as remote desktops, give that input priority.

### Scope

- Display Mew, installed standalone agent CLIs, and system tools in the unified update screen.
- Allow only individual updates for standalone agents, and block updates while they are running. Run system tool batch updates sequentially, and provide progress, failure reasons, and Retry buttons.
- For installation methods that cannot be updated automatically, display the reason and exclude them from batch updates.
- Run the Mew update last, after all dependency tasks succeed.

- Run Mew, agent, and tool updates in dedicated tmux sessions, and retain output and results in those sessions. Tasks continue when the update screen is closed; reopen a session using the item's terminal icon.
- Mew updates run pull, dependency installation, build, and restart in order. If the build fails, do not restart the server; provide failure status, logs, and a retry option.
- Even if an update fails after pull, retries are not blocked merely because the Git commit is up to date. Reopening the page restores the job state and access to the session.

### Boundaries and limitations

- App npm dependencies and bundled ACP adapters are excluded from latest-version checks, notifications, and individual and batch updates. Mew updates install the lockfile combination from the commit, and legacy `npm:*` API requests are also rejected.

- The deployment documentation is the detailed canonical source for execution, configuration, HTTPS, and backups.
- This feature documentation cleanup does not run updates, builds, or restarts.

### Detailed contracts

- [Updates, Deployment, and Backups](../../../../docs/deployment/native.md) · [Account and Appearance Settings](../../../../docs/configuration/appearance.md) · [Execution and Validation Invariants](../../development/getting-started.md)
- [Update Terminal Session Decision](../../decisions/0022-update-terminal-sessions.md)

### Execution and Session Viewing

- The update screen and update execution follow the existing `system` permission. Viewing sessions also requires the `terminal` permission; the terminal icon is hidden without this permission.
- Each item's Update button starts the job. The adjacent terminal icon becomes enabled when a session exists and provides the accessible name **Item name terminal session**. Live output and retained logs are available in the same terminal popup used by command buttons.
- Individual updates use a separate session for each item. System tool batch updates run sequentially in a single session, and each row in that queue opens the same session.
- Closing the terminal popup or update screen does not terminate the session. Update terminal popups do not have a Force Quit button. Running status and session existence are tracked separately, so sessions can be reopened after success or failure to inspect output and the exit result.
- Updating the same item again replaces its previous completed session. For system tool batch updates, the next batch run also replaces the previous batch session, so previous output remains available until a new run starts.
- When Mew restarts, the browser's terminal connection may disconnect. Update jobs and sessions continue outside the server process, and the same session can be opened after reconnecting to Mew.
- Once a Mew update is confirmed successful, a **Refresh** icon is provided in the update screen header and Mew terminal popup. The user clicks it to reload the browser; there is no automatic refresh. This button does not start another update job or server restart.

<!-- mew:implementation:start -->
## Implementation details

- Display Mew, installed standalone agent CLIs, and system tools in the unified update screen.
- Allow only individual updates for standalone agents, and block updates while they are running. Run system tool batch updates sequentially, and provide progress, failure reasons, and Retry buttons.
- For installation methods that cannot be updated automatically, display the reason and exclude them from batch updates.
- Run the Mew update last, after all dependency tasks succeed.

- A dedicated tmux job starts directly without a login shell, and its output opens in the existing session terminal popup. The session is retained after the job finishes so its output can be inspected.
- Agent and tool queues and per-item session associations are saved in `dependency-update-job.json` and executed by a separate worker. State is restored after the Mew server stops or restarts; if a previously running worker has disappeared, remaining queued and running items are marked as failed.
- Startup failures and job interruptions are recorded as failures, and the screen provides error logs and retries. Jobs that fail after pull can also rerun the entire update.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that update notifications appear on connection and that they navigate to the unified screen.
  - Verify that individual and batch updates display versions, job progress, and failure reasons.
  - Verify that items that cannot be updated automatically display a disabled button and the reason.
- 2026-09-30: Isolated tests verified version comparison, ID validation, sequential execution failure handling, individual and batch execution in desktop and mobile UIs, state retention after closing the window, deferring Mew on failure, and running it last on success. No actual update commands, builds, or server restarts were run.

- 2026-09-30: Passed 5 update tests covering rejection of legacy ID requests for app dependencies and bundled ACP, allowance of standalone CLIs, and exclusion from desktop and mobile batch updates, along with `npx tsc -b` and oxlint checks on changed update files. No actual installation, build, or restart was run.

- 2026-10-01: Passed 8 server tests and 1 desktop and mobile UI tests covering queries to Prime's official distribution channel, detection of an installed actual executable, exclusion from agent batch updates, API blocking, and running-process identification. Type checking, oxlint on changed files, and the UI detector also passed. No actual update, build, or restart was run.

- 2026-10-03: Isolated tests with actual commands replaced verified the update order and that subsequent steps stop when pull, installation, build, or restart fails. Passed 16 update-related server tests, 1 desktop and mobile UI tests, type checking, oxlint on changed update files, the UI detector, and shell syntax checks. Verified retries with Git up to date after a build failure and mobile display of long logs. No actual installation, build, or restart was run. Documentation link checks passed, while documentation boundary checks failed due to an existing missing `todo/docs` registration.

- 2026-10-19: Passed 22 update-related server tests. In isolated tmux sessions using harmless commands, verified independent worker execution after the launching process exited, success of the next batch item after the first item failed, session log retention, restoration of disk state by a new process, `0600` permissions on the state file, and dead-worker detection.

- 2026-10-19: Passed 1 isolated Chromium tests using mock update state and terminals at 1100px and 390px. Verified per-item session access and output, reopening after closing, hidden session buttons for users without `terminal` permission, absence of a Force Quit button, explicit refresh and session retention after Mew succeeds, failure retries, and horizontal overflow. Type checking, global lint, the targeted UI detector, 3 translation dictionary tests, and `npm run check:docs` also passed. Global lint has existing warnings, and the global UI text check failed due to 361 existing missing translations; this update screen had 0 new missing translations. No actual update installation, build, or server restart was run.

<!-- mew:validation:end -->

### Node Runtime and Notification Dismissal (2026-10-06)

Update jobs use the server's `process.execPath` and run scripts with Bash. The same runtime is also prepended to PATH for installation and builds and passed through `MEW_NODE` for restarts, avoiding effects from a different Node version in tmux or script execution permissions. The user runs the actual update.

The X, Clear All, and Open Updates actions in Mewcat update notifications store the displayed app remote hash and latest tool versions in the browser. The same versions do not trigger notifications on reconnect, while newly discovered versions that have not been dismissed trigger notifications again. A shorter list resulting from updating some items is not treated as a new update. The update screen remains accessible from the menu.

Validation (2026-10-06): Ran related server and isolated Chromium tests, TypeScript, and targeted lint. No actual update installation, build, or server restart was performed.

### Operational Boundaries for the Prebuilt CLI (2026-10-14)

Under `MEW_DISTRIBUTION=release`, Mew status queries do not read or modify Git or source update job files. The server rejects app build, restart, and pull jobs and individual updates of bundled tmux, and instructs users to exit the CLI and rerun `npx @liiiiv/mew-cli@latest`. External standalone agents retain the existing individual-update rules and blocking rules while running. Follows the [CLI Distribution Contract](../../development/cli-distribution.md). Isolated API and update validation confirmed that source commands are not called; no actual update, build, or restart was run.
