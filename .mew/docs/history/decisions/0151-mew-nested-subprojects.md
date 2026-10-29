---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Nested subprojects that retain their folder locations. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0151 — Nested subprojects that retain their folder locations"
created: 2026-09-16
updated: 2026-09-17
---

- Date: 2026-09-16
- Status: Adopted
- Subsequent decision: [0158](0158-mew-subprojects-open-root-tabs.md) — Open projects at every depth in tabs; retain .mew detection and designation
- Partially supersedes: [0083](0083-mew-explorer-documents-and-mew-subprojects.md), [0085](0085-mew-explorer-root-and-subproject-sections.md) — The restriction that recognized only immediate child folders as subprojects
- Decision makers: User direction, Codex design and implementation

## Background

Users must be able to designate existing folders as subprojects in the sidebar and place projects within subprojects.

## Decision

- A folder containing an actual `.mew` directory is a subproject regardless of depth. Recognize it even when nested through ordinary folders. A `.mew` file or symbolic link is not a marker.
- Offer **Make Subproject** in the right-click and mobile item menus for writable folders. Create only an empty `.mew` inside the folder; do not overwrite existing settings. Do not offer the creation menu for the root, already designated projects, or inside `.mew` settings.
- Immediate child projects retain the existing large expandable entries after Documents. Deeper projects have a project marker and command buttons inside their actual parent folders. Do not promote them to the top or automatically create markers in intermediate folders.
- Pass paths as the project identifier from the current tree and a relative path. Command files, working directories, and sessions distinguish folders by their full paths. Retain the document and collaboration identifiers `docs` and `.workspace`.
- Retain one-level-at-a-time lazy loading and file access permissions. Do not recursively traverse all folders on the initial screen. Keep the existing Documents and immediate projects as the top-level search scope choices, and include nested folders beneath them in those scopes.

## Rationale

Use the user-requested `.mew` marker as the canonical source without a separate registration ledger. Preserving the actual folder hierarchy naturally makes the same folder appear as an immediate or nested project depending on the selected root.
