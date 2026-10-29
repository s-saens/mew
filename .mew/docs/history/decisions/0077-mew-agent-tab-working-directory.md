---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew agent tabs can select a working directory outside the workspace. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0077 — mew agent tabs can select a working directory outside the workspace"
created: 2026-08-24
updated: 2026-09-11
---

- Date: 2026-08-24
- Status: Adopted
- Subsequent decision: [0097](0097-mew-agent-panel-removes-cwd-bar.md) — cwd entry and change UI; session cwd keys retained
- Partially supersedes: 0043 — the portion fixing session cwd to the workspace
- Decision maker: Song Sanghoon (directive)

## Background

[ADR 0043](0043-mew-agent-workspace-scope-and-runtimes.md) moved the agent window from project scope to workspace scope and fixed every session's cwd to
`WORKSPACE_ROOT`. Later, [ADR 0044](0044-mew-agent-cli-tool-parity.md) removed the ACP file boundary for CLI tool parity, so agents can already read and write paths
outside the workspace that the server user has permission to access. However, the session's
base path and history scope remain tied to the workspace, and that path is not
shown on screen.

## Options

1. Only display the path — users can see the current state but cannot use a folder outside the workspace as the working directory.
2. Allow cwd selection per tab — users can move the tab's session, history, and relative path base to their chosen folder.
3. Track the last `cd` the agent ran in the shell. ACP does not send internal tool shell state through standard events, so this requires separate
   tracking for each runtime and also has a different meaning from the session cwd.

## Decision

Adopt option 2.

- Place an address-bar-style working directory input directly below the agent tab bar. Its value is the absolute cwd used to create
  and load sessions. Focusing it opens a dropdown; the unfinished final path segment filters the parent folder's subfolders
  by prefix. Clicking an item or pressing Enter enters that folder and displays its subfolders.
- The home button at the far left of the address bar reopens the current workspace's default path as the actual cwd. Apply the same lock during execution
  as for other path changes.
- New tabs and older saved values default to the current `WORKSPACE_ROOT`. Users can enter absolute paths, `~` paths, or paths relative
  to the current cwd.
- The server verifies that the directory actually exists and passes only the normalized absolute path to the session. Permissions are the same
  as for the agent window: `owner` and `manager`.
- Save cwd in the browser along with the tab state. After entering a folder through the dropdown, users must press Enter again or click `→` on
  the right side of the address bar to actually switch. Changing cwd in the same tab ends the existing session and opens a new session in the new cwd.
  Lock path changes during execution to avoid interrupting ongoing work.
- The agent WS key and supervisor process key are `runtime+tab+cwd`. Session lists, session loading, and usage are also queried for that
  cwd.
- This path is the base cwd for the agent process and ACP session. Do not track temporary `cd` commands run inside tools to
  change the address bar value.

## Rationale

File access permissions were already extended beyond the workspace in 0044. Keeping cwd fixed creates no security boundary while unnecessarily
tying relative paths, session history, and discovery of repository-specific agent instructions to the workspace. A cwd per tab fits the
existing model of "one tab is one work conversation," and using only server-validated paths also prevents invalid input from causing
repeated reconnections.

## Results

- Sessions started in a folder outside the workspace show only that folder's history.
- Changing the address bar starts a new session rather than running a shell `cd`. The existing conversation remains in that cwd's history.
- This change does not grant new file permissions. Actual access remains limited by the permissions of the OS user running the mew server, and the
  agent window's role gate also remains unchanged.
