---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Top explorer toggle and document folder entry points. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0190 — Top explorer toggle and document folder entry points"
created: 2026-10-02
updated: 2026-10-02
---

- Date: 2026-10-02
- Status: Adopted
- Partially supersedes: [0180](0180-mew-explorer-documents-files-toggle.md) — Position and layout of the bottom floating toggle
- Decision makers: User (requested a full-width top toggle and a docs entry point in Files view), Codex (implementation)

## Decision

- Place the Documents/Files toggle in a separate full-width row at the very top of the explorer. Keep it outside list scrolling.
- In Files view, display an entry point named after the linked document folder. Clicking it switches to Documents view without expanding the folder or opening the project. `.mew/docs` provides an entry point in the same way.
- Retain the separation of document API scopes and file listings, per-view expansion and scrolling, editor tab preservation, keyboard switching, guest scope, and the document settings entry point.

## Rationale

Make the navigation scope immediately discoverable and document folders accessible from Files view as well. Actual usage instructions reside in the [project guide](../../../../docs/guides/projects.md#사이드바의-프로젝트--하위-프로젝트--documents).
