---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: The project browser and Git workbench share the file tab model. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0113 — The project browser and Git workbench share the file tab model"
created: 2026-09-04
updated: 2026-09-11
---

- Date: 2026-09-04
- Status: Adopted
- Follow-up decision: [0114](0114-mew-git-workbench-popup.md) — Git workbench file tab
- Follow-up decision: [0115](0115-mew-git-menu-and-repository-picker.md) — Git entry point in the sidebar; repository and API boundaries remain in place
- Partially supersedes: 0081 — The UI scope that limited adding projects to searching for and confirming paths
- Decision maker: Song Sanghoon (directive)

## Background

The `+` in the root project tabs can only find and open existing folders. Creating a new folder or cloning a remote Git repository
requires switching to a terminal, and there is no entry point for turning the current folder or a subfolder in the sidebar into a
Git repository. Commit history is available only in per-file modals, so repository-wide branch flows and changes in each commit
cannot be explored in one view.

## Options

1. Place Git features in a separate fixed panel — This creates a screen lifecycle separate from editor splits, tab restoration, and drag-to-move behavior.
2. Make the Git workbench a virtual tab equivalent to a file tab — This allows reuse of the existing tab, split, and restoration model.
3. Provide only terminal command presets — This cannot provide repository browsing and safe structured operations in the GUI.

## Decision

Adopt option 2.

- The project `+` opens a browser that navigates the server filesystem one directory at a time. It provides actions to create
  a folder in the current directory, clone a remote repository, initialize a Git repository, and open the current folder as a root project
  tab.
- The project browser API for browsing, creating, cloning, and initializing arbitrary absolute paths is restricted to owners.
- In the sidebar, managers and owners can initialize a selected folder within the project boundary as a Git repository. The server accepts
  only paths and structured arguments, without executing shell strings sent by the browser.
- The Git API operates on a repository only when the specified folder itself contains `.git`. It does not implicitly search upward for a parent
  repository, preventing operations on root projects and subprojects from targeting the wrong repository.
- The Git workbench is a file tab with the virtual path `mew:git:<저장소 상대경로>`. Like file tabs, it can be reordered, closed, moved between panes, included
  in split views, and restored per account. Virtual tabs are not subject to file reading, autosave, collaboration, or comments.
- If the root project itself is a Git repository, a Git button appears in the sidebar toolbar. For immediate child Git projects, a Git
  button appears to the left of the command button in that project's title bar.
- The workbench provides a topo-order commit list covering all refs, graph lanes on the left, commit metadata and changed
  files, and per-file patches. Right-click actions are limited to operations completed on the client, such as copying, and server-allowlisted
  operations such as branch, tag, checkout, cherry-pick, and revert.
- checkout, cherry-pick, and revert do not use force options that arbitrarily overwrite the working tree. If Git rejects an operation because of
  local changes, the operation fails as-is; reset, clean, and forced checkout are not provided in the GUI.

## Rationale

Virtual tabs let users place the Git view alongside documents or drag it to another pane without creating new global panel state. The
server boundary accepts only exact repository roots and structured operations, preventing discrepancies between the target the user clicked
and the actual Git command target without adding an arbitrary shell execution surface.

## Results

- Cloning may take a long time or fail depending on the network and remote authentication state; reload the list after completion.
- Load commit patches only on demand for the selected file to limit the initial response for large repositories.
