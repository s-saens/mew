---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: The explorer presents the current root as a Project folder without a path name. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0084 — The explorer presents the current root as a Project folder without a path name"
created: 2026-08-26
updated: 2026-09-11
---

- Date: 2026-08-26
- Status: Superseded by: 0085
- Supersession confirmed: 2026-09-11 — [0085](0085-mew-explorer-root-and-subproject-sections.md). Removed the Project container. The follow-up decision also explicitly states that Documents and immediate-child .mew detection are retained.
- Partially supersedes: 0083 — The scope that listed the current root contents directly below Documents
- Decision maker: Song Sanghoon (directive)

## Background

Documents is a collapsible folder, but the current root's contents immediately after it sit at the same depth without any boundary. Repeating
the current project's path name, such as `liiiiv`, is redundant, but an indication that it is an exploration unit like Documents and a collapse
action are needed.

## Decision

- Keep Documents as a regular expandable folder at the top.
- Directly below it, place an expandable folder with the generic name **Project** rather than a path name. Opening Project immediately shows the
  current root's files and folders. Do not add another wrapper using the current root name, such as `liiiiv`.
- Project sits below Documents and above the other entries in the current root.
- Retain the `.mew/`-based detection of immediate subproject markers and command buttons from 0083.

## Rationale

Using the same folder presentation for Documents and Project keeps the navigation hierarchy consistent while eliminating repeated path names.
