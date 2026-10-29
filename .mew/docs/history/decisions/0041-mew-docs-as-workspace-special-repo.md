---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: docs is a special workspace repository, not a project (`<워크스페이스>/.mew/docs`). Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0041 — docs is a special workspace repository, not a project (`<워크스페이스>/.mew/docs`)"
created: 2026-08-10
updated: 2026-09-11
---

- Date: 2026-08-10
- Status: Adopted
- Subsequent decision: [0053](0053-mew-docs-folder-chosen-in-workspace-root.md) — Fixed .mew/docs location for central docs
- Subsequent decision: [0081](0081-mew-root-project-tabs-and-git-subprojects.md) — Fixed header tabs; retains the special identifier docs
- Decision maker: Song Sanghoon (directive)

## Background

mew treats each top-level workspace folder as a project and puts all of them in project tabs. docs was one of them — only
its name, `DEFAULT_PROJECT`, was special; it appeared alongside the others in the list and grid popup and was subject to renaming and deletion.

But docs differs from other repos. There is only one per workspace, it is the SSoT for the entire workspace rather
than a product, and it must come along in full when moving to another workspace. Mixing it into the project list makes
it look like "one of several projects," obscuring this role.

## Decision

Remove docs from projects and make it a special repository unique to each workspace. Its location is `<워크스페이스>/.mew/docs`.

- `listProjects()` filters out docs, and `isValidProjectName('docs')` is false — a project with the same name cannot be created (if created, the name collision
  would hide it). `.mew`, which starts with a dot, already fails the project naming rules
- Keep the internal identifier `docs` unchanged. Redirect only the path from `projectRoot('docs')` to `.mew/docs`. Documents, trees, search,
  collaboration room keys (`프로젝트:경로`), git, command buttons, and `.data/` keys all operate on project names, so renaming
  it would throw all open rooms and saved state out of alignment
- If the folder does not exist, the server creates an empty one (`ensureDocsRoot`) — a new workspace starts with empty docs
- The tab is a single fixed tab at the far left of the project tab row. It cannot be closed or reordered, has
  no name (fixed icon `i:notes`), and does not appear in the project grid popup
- Only whole-folder import/export is available (owner only). Import deletes all existing content, so it requires an additional warning
  confirmation. Export copies to `docs` under the destination folder and refuses if that name already exists
- The folder picker is a component populated with server-provided listings, not
  a native dialog (`GET /api/fs/dirs`, owner only — it directly exposes locations outside the workspace boundary)
- Each repository's `AGENTS.md` points to `../.mew/docs`; at the workspace root, it points to `.mew/docs`

## Rationale

- Treating a singleton as one of many leaves operations that should not exist (rename, delete, create two) exposed in the API. Removing it
  from projects eliminates that API surface itself
- Placing it under `.mew` leaves only product repos at the workspace root, so the directory listing becomes the project
  list. When switching workspaces, looking at `.mew` alone also gives you all of that workspace's mew state
- Giving only the path special treatment, rather than the name, is the cheapest choice to reverse — changing the internal identifier would
  require touching collaboration rooms, saved tabs, and git handling all at once

## Results

- The old `<워크스페이스>/docs` was moved on disk to `.mew/docs` (with git history intact)
- Links to `../docs/...` in repository documentation were updated in bulk to `../.mew/docs/...`
- Guests always see the docs tab, but as before, the path rules in `guestAccess.ts` determine what appears inside (an empty tree
  if there are no rules)
