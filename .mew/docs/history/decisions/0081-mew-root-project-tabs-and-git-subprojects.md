---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew uses root projects and Git subprojects instead of workspaces. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0081 — mew uses root projects and Git subprojects instead of workspaces"
created: 2026-08-26
updated: 2026-09-11
---

- Date: 2026-08-26
- Status: Adopted
- Follow-up decision: [0083](0083-mew-explorer-documents-and-mew-subprojects.md) — identifying Documents and direct child projects
- Follow-up decision: [0086](0086-mew-root-project-spa-handoff-and-cache.md) — full reload on root switching
- Follow-up decision: [0093](0093-mew-account-synced-project-and-agent-tabs.md) — browser-only storage of project tabs
- Follow-up decision: [0113](0113-mew-project-browser-and-git-workbench-tab.md) — UI for adding projects and entering Git
- Partially supersedes: 0018 — the project definition and tab-list scope that displayed all top-level workspace folders as project tabs
- Partially supersedes: 0041·0053 — the UI layout that placed docs in a fixed header tab
- Partially supersedes: 0042 — the scope that used the home tab as the workspace-scope entry point and the entry point for switching folders
- Partially supersedes: 0080 — the server file explorer's “Open as Project” behavior that opened the parent as a workspace
- Decision maker: Song Sanghoon (directive)

## Background

Previously, mew treated every immediate subfolder of the configured workspace as a project and listed them as header tabs.
This model made it difficult to open independent folders outside a single root and always promoted nested Git repositories, which
were actually folders, to global tabs. docs and Home were also fixed workspace-specific tabs, increasing the number of scopes users
had to understand.

## Options

1. Keep workspaces and add only external folder mounts — keeps the existing API small, but continues to blur the meaning of subfolders and independent projects.
2. Treat a single folder as a project and show only immediate subfolders that are Git repositories as subprojects — aligns the UI with the filesystem structure.
3. Organize nested Git repositories into a recursive project graph — the model is complete, but greatly expands navigation, state, and command scopes beyond current needs.

## Decision

Adopt option 2.

- In mew, a project is a single folder identified by an absolute path on the server. The `WORKSPACE_ROOT` and `MEW_WORKSPACE` names in configuration and server internals remain only as internal
  implementation terms for compatibility with existing path validation and restarts; they are not part of the user model.
- The header shows tabs only for root project paths that have been opened, and `+ 탭` and `Ctrl+O` open the same central path input. Path entry,
  autocomplete, and confirmation use the same server validation API as the agent cwd input.
- The list of opened paths is stored under `mew:open-project-paths` in the browser's `localStorage`. In the current server architecture, root switching reuses the existing switching
  procedure, which cleans up collaboration rooms, tree watchers, and agents, then reloads the UI.
- Immediate subfolders of the current project that contain `.git` appear in the sidebar as subprojects marked with
  `Git`. Their rows include the existing `.mew/cmd-button.json` command menu; detecting nested Git repositories is outside the scope of this decision.
- Move the project command play button from the header tabs to the top of the sidebar, next to the folder and search buttons.
- Move docs to a virtual `Documents` folder below the sidebar search field. Preserve the folder location, internal identifier `docs`, and import/export
  contracts, and open the existing settings dialog when the owner right-clicks it.
- Remove the fixed workspace Home tab and the project grid entry point that listed all subfolders. Do not retry the workspace Home tab
  with the same model. When exposing the task and calendar widgets again, decide their placement within the project scope separately.
- The server file explorer's `프로젝트로 열기` action also opens the selected folder itself as the root project. Do not provide a separate
  `워크스페이스로 열기` menu item.

## Rationale

If tabs contain only folders opened independently and the sidebar continues to handle the structure within each folder, users do not need to learn “folder”
and “project” as separate layers. Git status marks boundaries already present in the filesystem, so no new project configuration registry is needed. Retaining
the existing root-switching procedure as a compatibility layer allows the user model to change first without a large migration to immediately incorporate
absolute paths into collaboration room keys.

## Results

- The list of open project tabs is browser-specific, but the server's active root is currently process-wide. When one user changes the root,
  other clients also see the new root under the existing presence-switching contract.
- Hidden folders in the root project appear like other items in the owner and manager trees. `.git`, `node_modules`, and `.data` remain hidden under existing
  API blocking and performance rules.
