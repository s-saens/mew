---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: The explorer displays Documents and the root contents in one tree. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0083 — The explorer displays Documents and the root contents in one tree"
created: 2026-08-26
updated: 2026-09-11
---

- Date: 2026-08-26
- Status: Adopted
- Follow-up decision: [0151](0151-mew-nested-subprojects.md) — Detect and create nested .mew folders; retain the existing immediate-child layout
- Follow-up decision: [0085](0085-mew-explorer-root-and-subproject-sections.md) — Placement of the current root and subprojects; retain immediate-child .mew detection
- Partially supersedes: 0081 — Documents/root virtual folder placement and Git-based subproject detection
- Decision maker: Song Sanghoon (directive)

## Background

The sidebar in 0081 displayed Documents and the current root as virtual folders that changed the active project when clicked. Viewing
the root's contents therefore required entering the project name one more time, and Documents did not feel like a folder that
could be expanded like other filesystem folders. Subprojects were also identified by whether they were Git repositories, but
in this workspace, project boundaries are defined by the `.mew` folder containing commands and configuration.

## Decision

- Place a collapsible **Documents** folder at the top of the explorer. Expanding it shows the contents of its actual folder
  directly below.
- Place the current root's actual items directly after Documents without wrapping them in the project name. Documents
  therefore sits above other folders, while the root's project folders appear below it in the same list as ordinary
  folders.
- If an immediate subfolder of the root contains `.mew`, mark it as a subproject and attach that folder's command menu.
  The presence of `.git` is not used for this UI classification. Detecting nested `.mew` remains out of scope.
- Preserve the internal project identifiers (`docs`, `.workspace`) used for editor tabs, saving, and collaboration. The unified tree is only a layout
  of the explorer UI; switch the editing scope to the corresponding identifier only when opening a Documents item.

## Results

Documents and the root can both be browsed like folders without displaying the document location or root contents twice. Projects
that have not yet initialized Git also appear as projects in the same way as long as they contain `.mew`.
