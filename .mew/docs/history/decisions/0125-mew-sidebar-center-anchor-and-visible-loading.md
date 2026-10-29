---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: The sidebar restores the center item and reads only open paths. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0125 — The sidebar restores the center item and reads only open paths"
created: 2026-09-08
updated: 2026-09-08
---

- Date: 2026-09-08
- Status: Adopted
- Decision maker: Song Sanghoon (directive)
- Partially supersedes: Preloading collapsed top-level folders in [0088](0088-mew-sidebar-tree-lazy-loading.md), pixel-based scroll restoration in [0094](0094-mew-account-synced-workspace-ui-state.md)

## Background

Restoring only the pixel position changes which item is visible depending on screen height and lazy loading. Preloading closed folders competes with requests needed for restoration.

## Decision

- Per-root account state stores expansion states for Docs, subprojects, and regular folders, along with the tree identifier, path, and relative position within the vertically centered item.
- Restoration prioritizes the center item, falling back to the existing scroll position for missing items or older saved values. The first active document does not override the restored position or expansion state.
- Display the root and the direct children of open paths first. Display saved child lists immediately, then refresh them. Read paths beneath closed ancestors and collapsed top-level folders when they are opened.
- Stop initial position correction when the user starts scrolling, clicking, or typing. Reuse child lists already received and requests in progress.

## Results

Do not reintroduce preloading of all top-level folders. Store navigation state in the existing account UI ledger without creating separate storage.
