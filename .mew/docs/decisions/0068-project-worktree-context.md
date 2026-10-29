---
title: "0068 — Switch Worktrees While Preserving the Project UI"
description: "When opening an existing worktree through Git branch selection, separate the logical project root from the actual file working root to preserve layouts, tabs, and existing sessions. Define storage and lookup boundaries and explain why physical folder swapping was not adopted."
created: "2026-10-26"
updated: "2026-10-26"
---

## Status

Accepted. Retains the general project selection and restoration contract in [Decision 0019](0019-project-selector.md) while distinguishing worktree selection within the same repository as a separate working root switch. Retains the worktree placement in [Decision 0054](0054-internal-worktrees.md).

## Background

If a branch is in use in another worktree, opening that folder avoids Git's duplicate checkout restriction. Using the same path as ordinary project opening changes the project name, panel layout, editor tabs, and agent tabs to another project's state, interrupting the workflow of a user who only selected a branch.

Swapping the names of the current folder and target worktree folder could preserve UI paths, but would also require handling Git's registered paths, the cwd of open processes, watchers, and absolute path references. With the `.worktrees` layout inside the main checkout, moving the parent folder also changes the paths of linked working folders.

## Decision

Selecting a worktree within the same project preserves the logical project root and changes only the actual file working root. Do not rename or move folders or copy their contents. Preserve the project name, per-account UI, editor panes and tabs, and agent and terminal tabs. Reload files and Git from the selected worktree and preserve the cwd of existing sessions. New sessions start at the selected working root.

Allow switching only to registered worktrees that use the same Git common directory, and check the owner, source root, and concurrent switches. Complete file saves before switching and prevent late saves and responses from mixing into the new working root. Ordinary switches through the project selector and Add Project also change the logical root to the target, preserving existing UI restoration behavior.

The [Worktree Switching UI Contract](../development/ui-contracts.md#switching-worktrees-within-the-same-project) owns the specific API, storage, cache, and error criteria. The [Git Panel](../features/git-history/project-git-work-panel.md) and [Project Switching](../features/projects-files-search/opening-projects-tabs-and-groups.md) own user actions.

## Rationale and Impact

Users can continue branch work without rebuilding the UI or moving all worktree files. File contents, permissions, and navigation results must be separated by actual path, and files absent from the target must be shown in a state that prevents editing or saving their previous contents. The current UI and running sessions may use different working roots, so do not arbitrarily change session cwd values.

Overall switching speed is also affected by target file lookups and permission validation. Do not guarantee numerical latency figures for the actual production environment before measurement.
