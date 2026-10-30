---
title: "Database row titles rename linked documents"
description: "Records the 2026-10-30 implementation of immediate database page-title previews and confirmed filename changes, preservation and rollback checks, local verification, and remaining integration limitations."
created: "2026-10-30"
updated: "2026-10-30"
---

Page-type primary values previously updated frontmatter while preserving their original filenames. Added Task-style title previews for the explorer and open tabs and confirmed file renames within the page's current directory. The [database feature contract](../features/document-databases/document-databases-and-catalog.md), [document page contract](../development/document-pages.md#database-row-subpages), and [database guide](../../../docs/guides/database.md#opening-rows-as-subpages) own current behavior. [0093](../decisions/0093-database-row-title-renames.md) supersedes 0026's title-change path stability choice.

The server reuses document renaming with transaction rollback. It preserves row UUIDs, bodies, authored properties, supported links, parent representatives, descendants, and binary attachments; safe numbered names prevent collisions. Composed mutations map original paths directly to final destinations and update nested DB bindings. A separate filename-title baseline retains deferred work during row-page autosaves without changing the active save request's path. Background file watchers defer structural moves so they cannot consume a browser's pending path mutation.

The optional editor host preview hook uses the shared title store. Completion follows confirmed path remapping and protects newer input. The controller refreshes linked paths after primary title saves and row events while retaining local title drafts. Failed saves restore confirmed titles in both cells and open documents.

`node --test server/db/row-page-layout.test.ts server/document-pages.test.ts server/db/rowPages.test.ts src/utils/document-title-preview.test.ts src/utils/database-page-mutations.test.ts` passed 35 tests and skipped the Postgres suite because `MEW_DB_TEST_DATABASE_URL` was not configured. The filesystem checks use temporary projects and an in-memory query fixture. They cover legacy baseline compatibility, renaming in manually selected directories, safe collisions, body/link/UUID preservation, deferred autosaves and watcher refreshes, parent and child renames, nested DB owner paths, binary attachments, and full file rollback after a simulated DB failure. The Postgres suite contains a new service-level rename and deferred-save regression, but that integration case was not run.

`node --test server/database-page-title-ui.test.ts server/database-table-ui.test.ts server/editor-table-database-ui.test.ts server/database-layout-ui.test.ts` passed all 9 browser tests. The new fixture uses the actual table, explorer, editor pane, tab hook, and client with delayed mocked responses to check immediate titles, updated page buttons, failure rollback, tab identity, newer cell/body edits, and out-of-order path refreshes. Existing table keyboard navigation, options, compact layout, multiple views, and regular/collaborative conversion checks also passed. Eight existing Task save/deletion checks passed separately.

`npx tsc -b`, targeted `npx oxlint`, documentation checks, and scoped `git diff --check` passed. Lint retained two existing React hook warnings in `useDatabaseView.ts`; the existing browser fixtures emitted dependency `use client` warnings. The new browser fixtures check behavior without the app stylesheet and are not visual or physical-device validation.

The existing `server/document-title-sync-ui.test.ts` timed out at its Task body selection/scroll restoration assertion. A separate temporary fixture using the unchanged HEAD versions of the modified title store, tab hook, DB mutation helper, and client failed at the same assertion. That temporary fixture was removed; no passing result is claimed for this existing test.

No app build, deployment, server launch, or restart was performed. Browser fixtures use mocked file/DB responses; a live Postgres instance, physical mobile device, and cross-user tab path migration were not verified. The user builds and applies the changes to the running instance.
