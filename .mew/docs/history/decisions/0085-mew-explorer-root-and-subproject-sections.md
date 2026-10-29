---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: The explorer displays root contents and subprojects separately. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0085 — The explorer displays root contents and subprojects separately"
created: 2026-08-27
updated: 2026-09-17
---

- Date: 2026-08-27
- Status: Adopted
- Follow-up decision: [0180](0180-mew-explorer-documents-files-toggle.md) — Separate Documents and Files with a bottom toggle; retain the subproject tab boundary
- Follow-up decision: [0158](0158-mew-subprojects-open-root-tabs.md) — Open subprojects as project tabs instead of expanding them
- Follow-up decision: [0151](0151-mew-nested-subprojects.md) — Detect and create nested .mew folders; retain the existing immediate-child layout
- Supersedes: [0084](0084-mew-explorer-project-folder.md) — Remove its unique decisions or incorporate them into this ADR; see the body for shared boundaries that remain
- Decision maker: Song Sanghoon (directive)

## Background

The Project toggle adds another level around the actual root's ordinary files and folders, hiding them from immediate view in the explorer.
Immediate subfolders containing `.mew`, however, are execution units and need to appear first as independent exploration units like Documents.

## Options

1. Keep the Project toggle — It looks like Documents, but the root contents are one level deeper.
2. Show root contents directly and separate only subprojects into independent toggles — Execution units appear first, and the ordinary file structure stays flat.

## Decision

- Keep Documents as a large expandable entry at the top.
- Place each immediate `.mew` subproject of the current root after Documents as an independent large expandable entry. Each entry expands its own files and retains the existing command button.
- Remove the Project toggle without a path name.
- List the remaining root files and folders immediately afterward, without placing them inside any of the entries above.
- Retain the immediate-child `.mew` rule from 0083 for subproject detection.

## Rationale

Ordinary root contents have no artificial container, so their path depth matches the actual filesystem. Only subprojects with execution and configuration boundaries can be collapsed separately, making important work units easy to find alongside Documents.
