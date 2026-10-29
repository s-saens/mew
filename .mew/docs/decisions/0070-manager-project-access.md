---
title: "0070 — Manager Project Access"
description: "Decision to allow owner and manager roles to select, add, and switch projects and perform folder and Git operations in the selection dialog, while retaining per-account root isolation and owner-only account and Documents management."
created: 2026-10-26
updated: 2026-10-26
---

- Status: Adopted
- Partially supersedes: the owner-only restriction on adding and switching projects in [0019](0019-project-selector.md).

## Background

Managers could access server OS files through agents, terminals, and the server file explorer, but could not open the project selector, blocking normal workspace switching.

## Decision

Allow owner and manager roles to access the header project list, add and switch projects, change icons, use shortcuts, open projects from the server file explorer, and switch subprojects and worktrees. Folder browsing, cloud listings, folder creation, Git clone/initialization in the selection dialog, and opening and creating projects through Mewpet follow the same roles. Retain per-account storage for the list, active root, and UI restoration.

Member and guest roles can only view the current project display. Account management, Mewlink management, Documents settings/import/export, and the existing `/project` creation, renaming, and deletion APIs remain owner-only. File and feature permissions and server data path blocking follow the existing contracts.

## Rationale and Impact

The manager project UI and server APIs operate in line with existing server operation permissions. This eliminates the mismatch where a dropdown opens but the API rejects the action, without changing another account's active root or the cwd of running sessions.

The current contract follows [Project Features](../features/projects-files-search/opening-projects-tabs-and-groups.md) and [Access Control](../development/access-control.md).
