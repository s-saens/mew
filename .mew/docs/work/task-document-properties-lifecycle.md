---
title: "Fixed Tag Display and Creation/Deletion Synchronization for Task Documents"
description: "Record for 2026-10-29 of improvements to multiselect display for tags and assignees without type annotations and synchronization of open tabs on task creation, moves, and deletion. Records preservation of unsaved content, prevention of deleted file recreation, regression and isolated UI checks, existing documentation errors, and changes not applied to production."
created: "2026-10-29"
updated: "2026-10-29"
---

## Purpose and results

When YAML arrays saved by tasks lacked type annotations, document properties displayed `tags` and `assignees` as array strings. Changed the default type of both fields to multiselect and made the picker use the same interpretation. Reads existing YAML arrays and legacy array strings while preserving explicit user types and text editing for malformed values. Merely opening a document does not modify the file. The current contract is owned by [Shared packages](../development/packages.md).

Propagate deletions from task responses to open editors, along with creations and changes. Close deleted tabs with saved content and clear their caches, navigation history, and scheduled saves, while retaining unsaved content in read-only error tabs. Before fetching, wait only for saves already in progress without forcing unsaved documents to save. The server rejects task requests with a save baseline using 409 if the path has been deleted or moved. The current save and lifecycle contract follows the [Task contract](../development/task-list.md#client-lifecycle-and-errors).

## Verification and application

- Passed 55 regression tests covering frontmatter, property merging, Markdown saving, assignees, Done moves, APIs, document synchronization, and sessions. Also aligned the post-completion path in the existing assignee test with the current `Done/` contract.
- Passed 9 isolated Chromium checks in `server/task-frontmatter-ui.test.ts` and `server/task-document-save-ui.test.ts`. Verified tag display and removal, switching to new documents, and read-only behavior on desktop and mobile; removal of saved tabs and caches on deletion; preservation of unsaved content; races between in-progress and pending saves; and renames with the same ID. UI responses used fixtures.
- Passed `npx tsc -b` and oxlint on changed TypeScript files. Existing warnings remain in oxlint for ref access in a hook and effect state updates in the picker. The design check for the changed picker returned an empty list.
- The full documentation check failed because the existing `docs/지원서.md` was missing frontmatter. A separately run link check also failed due to 19 existing issues, including an API image path in the README and references to deleted feature MOC and task documents. Separately verified descriptions and local links in the documents changed in this work.

No app build, deployment, or server start, stop, or restart was performed. Applying the changes to the running instance and checking on physical devices remain pending after the user's build.
