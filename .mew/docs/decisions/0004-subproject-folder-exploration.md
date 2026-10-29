---
title: "0004 — Browse Subprojects as Regular Folders Too"
description: "The decision to expand and browse subprojects in their actual hierarchy with normal sorting and open the working root through a separate arrow. Supersedes ADR 0158's prohibition on inline browsing; subsequent ADR 0019 replaces separate header tabs with a selector."
created: 2026-10-15
updated: 2026-10-19
---

- Status: Adopted
- Partially supersedes: [ADR 0158](../history/decisions/0158-mew-subprojects-open-root-tabs.md)'s separate entry point placement, switching on folder click, and prohibition on inline browsing and creation
- Subsequent decision: [ADR 0019](0019-project-selector.md) replaces separate header tabs with a project selector. This document's regular folder browsing, separate navigation arrow, and permission boundaries remain in effect.

## Background

The user requested the same regular folder browsing and separate navigation arrow used for document folders for subprojects as well. Remove the boundary that required switching project tabs every time users wanted to inspect folder contents.

## Decision

Display direct and nested subprojects under their actual parents in the same sort order as other folders. Clicking a folder expands or collapses it; support opening, creating, uploading, and moving internal files in the current tree, as well as restoring expansion and cache state. Display a project icon and an adjacent arrow, with only the arrow performing the existing project tab switch.

Continue identifying projects based on the actual `.mew` directory. Preserve the owner restriction on opening project tabs, source root validation, duplicate tab reuse, per-account state, and existing paths of running agents. Apply the current project's existing file permission, hiding, and blocking rules to file browsing and operations. Continue hiding the command menu on project rows and run commands from the corresponding project tab.

## Rationale and Impact

Assigning folder browsing to the folder row and working root selection to the arrow lets users inspect contents in the current context and move to an independent project when needed. Remove the blocks on expanding, lazy-loading, and creating files in subprojects, as well as the separate top section for direct subprojects. [File Browsing](../features/projects-files-search/file-folder-exploration-and-operations.md) and [UI Contract](../development/ui-contracts.md#하위-프로젝트-탭-진입) own the detailed contracts.
