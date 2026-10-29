---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Open Git by choosing a repository from the header menu. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0115 — Open Git by choosing a repository from the header menu"
created: 2026-09-04
updated: 2026-09-12
---

- Date: 2026-09-04
- Status: Adopted
- Follow-up decision: [0160](0160-mew-git-current-project-only.md) — Open the current project root directly; remove the unified picker and nested discovery
- Follow-up decision: [0135](0135-mew-git-workspace-panel.md) — Preserve tabs when reopening the panel and select a repository on first entry or in a new tab; retain menus, shortcuts, and discovery scope
- Partially supersedes: 0114 — The sidebar Git button and the entry flow that directly opens the repository specified by the button
- Decision maker: Song Sanghoon (directive)

## Background

Scattering per-repository Git buttons across the sidebar and folder rows makes nested repositories difficult to find at a glance and makes it difficult
to select Documents through the same entry point. A flow that first asks which repository to view each time the Git popup opens
is clearer.

## Options

1. Keep per-repository buttons in the sidebar — Fast, but nested repositories and Documents are hard to discover.
2. Open a unified picker from the header menu and shortcut — Select any repository from a single list.

## Decision

Adopt option 2.

- Managers and owners open the popup through Git in the header hamburger menu or with `Alt+G`. No Git open buttons are provided in the sidebar
  or folder rows.
- The popup's first screen is a selection list containing the root project, Documents, and all nested Git repositories in each area. Documents is discovered
  separately within its own project scope, without duplication in workspace discovery.
- Selecting a repository opens the existing graph, details, and diff hierarchy, with no title text in the graph view. The back button
  at the top left of the graph returns to the repository selection list.
- The server does not descend into `.git`, `node_modules`, or `.data` and returns only actual Git roots in the list. Subsequent repository APIs
  also accept only the selected project scope and relative path.

## Rationale

A single entry point and list eliminate the need to remember repository locations and provide the same Git flow throughout the workspace,
including Documents. Server-side discovery with structured paths produces a complete list regardless of which parts of the client's
file tree are collapsed.
