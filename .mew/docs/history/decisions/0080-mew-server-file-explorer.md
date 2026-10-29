---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: the mew server file explorer is a tool with shell permissions, separate from projects. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0080 — the mew server file explorer is a tool with shell permissions, separate from projects"
created: 2026-08-25
updated: 2026-09-11
---

- Date: 2026-08-25
- Status: Adopted
- Follow-up decision: [0150](0150-mew-account-feature-and-file-permissions.md) — replace fixed role gates with per-account feature permissions
- Follow-up decision: [0081](0081-mew-root-project-tabs-and-git-subprojects.md) — behavior that switched to the parent workspace when opening as a project
- Decision maker: Song Sanghoon (directive)

## Background

mew's sidebar and document tabs operate on paths relative to the active project. Under [ADR
0077](0077-mew-agent-tab-working-directory.md), agent tabs can select the server user's home directory and paths outside the workspace as working directories, but browsing or
briefly opening files at those paths required switching projects or workspaces. Switching projects affects
all open tabs, collaboration rooms, and the entire tree, making its cost disproportionate to checking
a single file.

## Options

1. Always open the selected folder as a new workspace — reuses the existing model, but restarts every screen even when checking a single file.
2. Mount external paths in the current project tree — blurs the sidebar's project-relative path contract and guest boundaries.
3. Provide a separate file explorer and temporary tabs available only to roles with shell permissions — preserves project state while making the permission scope explicit in the UI.

## Decision

Adopt option 3.

- Only `manager` and `owner` can open the server file explorer from the header menu. Both roles can already manipulate paths throughout the server
  through tmux and ACP with the same OS user permissions. Neither the API nor the UI is available to `member` or `guest`.
- The default path is the server user's home directory (`~`). Address entry and autocomplete use the same `~` expansion and absolute-path validation rules as
  the agent cwd input.
- Directories are read asynchronously one level at a time when expanded. The explorer does not recursively scan the entire home directory or `node_modules`, and it displays
  all files and folders the OS user can read, including hidden items, without filtering.
- Clicking a file opens it as a preview tab in the current project's editor pane without changing the project. External tabs use absolute paths
  as identifiers and support autosave, but do not participate in collaboration, comments, git history, or project rules, and are not retained in the
  localStorage tab restoration list.
- Right-clicking files or folders provides Rename, Copy, Cut, Paste into Folder, and Delete actions; files can also be downloaded. Operations cover
  the full scope of the server process's OS permissions.
- Only the owner can use a folder's `프로젝트로 열기` and `워크스페이스로 열기` actions. Open as Project changes the workspace to the selected folder's parent,
  then opens the selected folder as the active project. Open as Workspace opens the selected folder itself through
  the existing workspace-switching procedure. Both reload the UI on all clients.
- For new UI strings, update all four locale catalogs from [ADR 0078](0078-mew-client-ui-localization.md) together.

## Rationale

Keeping external paths out of the project tree avoids changes to existing relative-path APIs, guest rules, and collaboration room keys. Temporary
tabs minimize the state cost of checking a single file, and write permissions align exactly with roles that already have shell
access. Reading directories one level at a time exposes the entire server root while preventing slow mounts or massive dependency folders
from blocking the HTTP event loop and the popup's initial display.

## Results

- The server file explorer is not a sandbox. If a manager or owner account is compromised, the scope of damage is the same as with shell access.
- If external files require git commits or collaboration, their folder must be opened as a project or workspace.
- Names that cannot be opened as projects (hidden folders, the special `docs` name, etc.) are rejected under existing project naming rules.
