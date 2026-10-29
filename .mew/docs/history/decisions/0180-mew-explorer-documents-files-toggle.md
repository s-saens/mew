---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: bottom Documents/Files toggle in the explorer. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0180 — Bottom Documents/Files toggle in the explorer"
created: 2026-09-29
updated: 2026-09-29
---

- Date: 2026-09-29
- Status: Adopted
- Subsequent decision: [0190](0190-mew-explorer-top-toggle-and-docs-entry.md) — Full-width top toggle and document folder entry point in the file view
- Partially supersedes: [0085](0085-mew-explorer-root-and-subproject-sections.md) — Placing the expandable Documents item at the top alongside regular files
- Decision makers: user (requested a floating Documents/Files toggle at the bottom), Codex (implementation)

## Decision

- The sidebar file explorer displays only the list selected with the floating Documents/Files toggle at the bottom. The expandable Documents row at the top is removed.
- Expansion and scroll states are preserved separately for documents and regular files, and the selected view is saved per account and root project. The previous Documents expansion state is migrated to the document view selection. If no saved value exists, the explorer starts in the file view.
- Revealing a location from a file tab or creating a new file switches to the corresponding list. Switching explorer views does not change open editor tabs or panel layouts. Subprojects in Files open in separate project tabs as before.
- The toggle stays at the bottom of the explorer regardless of scrolling and is hidden on search and command screens. Guests retain the existing document scope. Documents settings remain accessible by right-clicking the document toggle and through the existing settings entry point.

## Rationale

The two file areas are kept out of a single mixed list to clarify the navigation scope of the current task. Existing API scopes, permissions, and editor integration are preserved. Current usage is documented in the [project guide](../../../../docs/guides/projects.md#사이드바의-프로젝트--하위-프로젝트--documents).
