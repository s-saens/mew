---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Open subprojects in project tabs. ADR 0004 superseded the prohibition on inline navigation; this record preserves the choices, rationale, and subsequent changes from that time. Consult the Mew owning document for the current contract."
title: "0158 — Open subprojects in project tabs"
created: 2026-09-17
updated: 2026-09-17
---

- Date: 2026-09-17
- Status: Adopted
- Partially supersedes: [0085](0085-mew-explorer-root-and-subproject-sections.md), [0151](0151-mew-nested-subprojects.md) — Inline expansion and command buttons for subprojects
- Decision maker: User direction, Codex implementation

## Background

Expanding subprojects like ordinary folders keeps editing within the parent project's working context. The user requested opening subprojects in independent project tabs and working within them.

## Decision

- Display immediate subprojects as project entry points after Documents. Clicking, touching, or activating one with the keyboard opens and activates that folder as a root project tab. Reuse the existing tab for a path that is already open.
- Nested projects inside ordinary folders behave the same way. Navigate project contents in that project's tab; do not expand or lazily load their contents in the current tree. Previously saved expansion states must not cross this boundary either.
- Retain 0151 for `.mew` detection, folder designation, and the actual hierarchy. Do not promote nested projects outside immediate projects to the top level.
- Remove command buttons from project rows. Use the open project's existing root tools to execute commands and create or edit files. Retain ordinary folder operations and Documents expansion.
- Project switching follows the existing owner-only API, SPA transitions, and per-account tab persistence. Disable opening projects for anyone other than the owner. Permission expansion and per-user server root isolation are outside this change.
- Validate relative paths against both the requested tree's scope and the current root. Reject requests from a previous root so they do not open a same-named folder in the new root. Do not remember failed paths as new tabs.
- Keep the parent project tab so users can return to it. When switching, running agents in the previous project follow the existing lifetime contract.

## Rationale

Project rows select the working context, while ordinary folders navigate files in the current project. Reusing the existing project-tab flow aligns Documents, editing state, and new agents' working paths with the selected project.

This decision discontinues existing inline project navigation. Reintroducing the same behavior requires a follow-up ADR.


## Follow-up decision

- 2026-10-15: [ADR 0004](../../decisions/0004-subproject-folder-exploration.md) supersedes the separate entry-point placement, switching on folder click, and prohibitions on inline navigation and creation. Retain switching to project tabs via a separate arrow and the existing permission and account boundaries.
