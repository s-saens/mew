---
title: "Relocating the Mew repository"
description: "Procedures for preserving execution paths, configuration, persistent data, and session keys when moving the source installation folder, and for applying and recovering from the move. Links to separate maintenance documentation for repository ownership and history replacement."
created: 2026-10-14
updated: "2026-10-29"
---

# Repository relocation

Mew source can be installed without a specific parent workspace. The current source location in this development environment is `~/dev/mew`. Before relocating a running installation again, meet the prerequisites below, then apply the move. Under the [independent project decision](../../.mew/docs/decisions/0001-independent-project.md), documentation, decisions, and validation are also managed within the repository.

Moving the folder does not change the Git remote URL or npm scope. Open project locations are independent of the source location and are determined by `MEW_WORKSPACE` and each account's active project.

For repository ownership transfer and Git history replacement, follow the [maintenance procedure](../../.mew/docs/operations/repository-maintenance.md).

## Before moving the source folder

- Confirm that no other folder exists at the destination. Preserve existing Git history, staged and unstaged changes, and untracked files.
- Back up `~/.config/mew/config.env`, the existing `.data/` or `MEW_DATA_DIR`, and local launchers. Do not replace the data folder with a new empty folder.
- Check the working paths of running servers, agents, and terminals, and systemd, launcher, and debugger settings that reference the old folder.

## Updating paths

Move the source installation while server writes are stopped. Coding agents stopping or restarting the server are subject to separate user authorization under the [execution and validation rules](../../.mew/docs/development/getting-started.md).

1. Move the entire folder. Preserve `.git/`, `.data/`, dependencies, and existing build files along with it.
2. Update only values pointing to the moved folder in the launcher's working directory, `MEW_WORKSPACE`, `MEW_DATA_DIR`, and service working paths. Leave other projects and external data folders unchanged.
3. Update paths in the saved project list, active projects, agent tabs, Documents, access policies, and debuggers. Also migrate keys and hashed filenames derived from absolute paths according to their storage formats. Do not rewrite historical paths in original conversations or execution logs.
4. Run documentation checks and the necessary type checks, tests, and lint checks at the new location. Moving the folder itself does not require an app build.
5. After starting the server at the new location, verify login, projects, Documents, conversations, and autosave. If a temporary link at the old path was used, remove it after executions referencing it finish.

Servers and agents retain their absolute paths from startup, so moving files alone does not change paths in running processes. When continuing an existing conversation at the new path, also check runtime-specific session locations and Mew's document links. Mew's Documents and agent settings require actual folders. Replacing a running project's root with a symbolic link causes document-link validation for existing sessions to fail, so do not use a link alone as a substitute for switching the server. Do not retain a link at the old location as a dependency of the new installation.

## Consistency of saved state

Restarting the server alone does not stop independent agent supervisors. Migrate stored state only after supervisors that remember this installation's source and data paths have also finished writing. Agents in other working folders also need to reconnect if they use this installation's data folder, but do not change those working folders' own paths. Do not determine installation ownership solely from a PID's working folder.

Project-specific task and feature files are located using the workspace's SHA-256 hash, debugger settings using the hash of the JSON string for `[account, root]`, and conversation/document links using the hash of the JSON string for `[runtime, cwd, sessionId]`. If you change only the JSON paths and leave the keys or filenames unchanged, the existing state cannot be found at the new location. If the destination key already exists, resolve the conflict before overwriting it.

In conversation transcripts, update `cwd` and lookup keys in SQLite `sessions`, and only link keys in `events`. Preserve event payloads, order, counts, and revisions. For older JSON transcripts, move only metadata and filenames as well. Use the SQLite backup API to create a consistent copy; do not copy only the live DB file. Raw session data owned separately by the runtime is not subject to blanket path-string replacement.

After applying the changes, verify that no active settings or keys for the old path remain, Git HEAD and the index are retained, and conversation counts and contents are preserved. If the operation fails, restore stored state, settings, and folder locations to the same backup point. Do not put recovery copies or verification logs in repository documentation.
