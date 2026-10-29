---
title: "Document classification by role and path migration"
description: "Records the classification and migration of project knowledge, tasks, public guides, product resources, and authoring sources on 2026-10-29, preservation of existing content, verification of links, metadata, saving, and packaging, and the scope not applied to production."
created: "2026-10-29"
updated: "2026-10-29"
---

## Purpose and results

Following [Decision 0087](../decisions/0087-documentation-role-boundaries.md), classified project documentation, decisions, work, research, and history under `.mew/docs`, tasks under `.mew/tasks`, freeform work documents under `.mew/notes`, and built-in skills and tool help under `resources`. User, operator, and contributor guides and documentation images remain in the root `docs`. Added navigation metadata to business drafts.

Separated the API and storage contracts from public configuration documentation, dated deployment records for the central service, historical debugger extension research, repository history maintenance, and product search visibility materials into owning documents. Linked to the relevant canonical sources without duplicating current facts. Preserved existing document bodies, historical constraints, and original decision text, and adjusted relative links for the moves.

## Behavior and deployment boundaries

Updated Documents links, agent entry points, and the scope of description and link checks. Tasks are saved in the new location, while migration of reads and writes from the old location, concurrent editing protection, and change monitoring are retained. Product skills and help are read from resource paths and included in releases. Moved Mewpet authoring sources to `assets/mewpet/capybara/source`, leaving the manifest and final WebP files in the distribution folder.

Addressed test fixture inclusion and missing required native Rust sources found during product package checks through inclusion/exclusion rules and regression checks. Frozen historical demo outputs retain their paths from the original commits, and the generator was updated to support the new paths.

## Preservation

Documents modified before this work began and untracked materials are preserved in the new locations. The commit records only moves and contract changes, leaving existing body edits, task changes, freeform work documents, collaboration data, and other UI work separate. The existing image selection is moved to a permanent relative path and preserved in the working tree; the user image itself is not included in this commit. Per-installation account, conversation, and task metadata and existing server processes were not changed.

## Verification

- `npm run check:docs` in the working tree: 549 descriptions, 0 metadata errors, and 0 local link errors.
- A verification copy containing only the commit targets also showed 546 descriptions, 0 metadata errors, and 0 local link errors. Existing user document edits and untracked materials were excluded from this copy.
- Passed `npx tsc -b` and oxlint on the modified code.
- Passed 61 regression checks for documentation checks and demo generation/transfer/saving, 27 regression checks for the task server, migration, SSE, API, demos, and tab paths, and 1 task panel UI check.
- Passed 18 regression checks for skills, Mewpet help, commits, and releases, and 11 regression checks for the Mewpet asset registry and PC/mobile UI. Verified the original bytes of 18 moved PNG and atlas files.
- Passed 2 regression checks for current navigation and Graphify history preservation.
- 3 additional existing checks failed. The TOML preservation error in `agent-harness.test.ts` was also reproduced with the HEAD configuration module and identical input. `editor-diagram-ui.test.ts` failed before the browser stage because Rolldown does not support CSS bundling, and was also reproduced with HEAD test, documentation, and source inputs. `document-title-sync-ui.test.ts` failed with scrollTop fixed at 180, with the same result in the HEAD test and an isolated baseline using the old task paths. Product code and existing assertions for these three issues were not changed.
- These checks were performed locally, in temporary repositories, and in isolated browsers; they do not verify actual deployment, external account connections, or application to production.

## Application and limitations

The app was not built or deployed, and the server was not started, stopped, or restarted. Previously running servers may use the old task storage code, so avoid editing tasks until the user applies the new code. Check the Documents path changes after reopening the project, starting with new conversations. Frozen historical demo copies continue to use the existing document paths until the next official generation.
