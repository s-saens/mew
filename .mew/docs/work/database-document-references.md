---
title: "Document database references and catalog access"
description: "Records the November 6 database Dock removal, persisted source references, line maintenance, and last-reference cleanup, plus the November 7 explorer toolbar placement. Separates local regression checks from unavailable Postgres integration and runtime application."
created: "2026-11-06"
updated: "2026-11-07"
---

Implemented source-location visibility in the database catalog and removed its Dock action. The [database feature contract](../features/document-databases/document-databases-and-catalog.md#persisted-document-references-and-database-lifetime) owns current behavior, the [guide](../../../docs/guides/database.md#finding-where-a-database-is-used) covers use, and [ADR 0148](../decisions/0148-database-document-references.md) records the changed lifetime decision.

Saved Markdown blocks register project/file/line occurrences in Postgres. Edits update lines; copies add references; structural moves remap paths before watcher cleanup; removing the final recorded reference deletes a managed table or detaches an external table. Missing legacy metadata is tolerated. Catalog reads use persisted metadata. Reference parsing excludes frontmatter, code examples, comments, inert HTML, and invalid IDs. Catalog UI displays repeated references, narrow-screen paths, and missing legacy metadata.

## Local verification

- `node --test server/db/documentReferences.test.ts server/db/documentReferences.integration.test.ts server/db/databaseService.test.ts server/db/routes.test.ts server/db/rowPages.test.ts`: 4 passed; 4 skipped because `MEW_DB_TEST_DATABASE_URL` was not configured. Added the opt-in isolated Postgres regression but did not claim a real database run.
- `DATABASE_URL='' node --test server/db/documentReferenceIntegration.test.ts`: 10 passed with injected adapters, covering successful saves, legacy removal, repeated path updates, changed/deleted subtrees, structural serialization, optional database failure, normalized paths, and excluded directories/symlinks.
- Dock/catalog browser regressions passed in test-owned Chromium at mobile and desktop widths and in light/Midnight themes. Fixtures use in-memory APIs. Captures are temporary test artifacts, not production screenshots or physical-device evidence.

- Combined regression run: `DATABASE_URL='' node --test server/db/documentReferences.test.ts server/db/documentReferences.integration.test.ts server/db/documentReferenceIntegration.test.ts server/db/databaseService.test.ts server/db/routes.test.ts server/db/rowPages.test.ts src/utils/mobile-dock.test.ts server/database-catalog-ui.test.ts server/database-entrypoints-ui.test.ts server/mobile-dock-ui.test.ts server/editor-table-database-ui.test.ts packages/editor/src/database/tableConversion.test.ts` passed 31 tests, with the 4 isolated Postgres checks skipped. This includes regular/Yjs conversion history and existing mobile Dock interactions.
- `npm run build` passed, including TypeScript and Vite. The first attempt was blocked by an unrelated concurrently added `server/deferred-dialog-ui.test.ts` type error; later runs also encountered active browser-capability refactoring, and the final primary-checkout build passed after those parallel edits were corrected. Build emitted the existing chunk-size warning and updated `dist/`; no server restart followed.
- Repeated the 35-test combined run in `.worktrees/db-document-references-verification`: 31 passed and 4 isolated Postgres checks skipped. This snapshot excludes unrelated browser changes; the pre-existing shared dialog and UI-message changes are verification prerequisites only and are not included in this task commit. The snapshot also passed `npm run build`. The final targeted reference/event rerun passed all 14 tests.
- `npm run lint` and the final targeted lint run passed with existing warnings. `git diff --check` passed.
- `DATABASE_URL='' node --test server/watcher.test.ts`: 3 passed, 2 failed because the active ignore configuration does not exclude `dist`. The same two failures were reproduced by running those tests against `HEAD:server/watcher.ts` with the current dependencies and environment. Reference integration does not change directory selection.
- `npm run check:docs` passed description validation. Link validation retained 39 unrelated missing-target errors, including `.mew/docs/MOC.md`, `.mew/docs/decisions/MOC.md`, and `.mew/docs/decisions/README.md`. Removed inherited missing parent metadata from the two updated public guides. No missing targets were introduced by the reference contract or decision links.

## Limits

No deployment, launcher execution, application server lifecycle operation, or production database test was performed. Server-side code requires the user's normal application procedure. Existing unrecorded documents are not backfilled by opening the catalog. Saved last-reference removal cannot be reversed by document undo; deleted Postgres data needs a database backup. Optional database failures can leave references stale until the affected file changes again.


## November 7: Explorer toolbar placement

Moved the explorer catalog action out of the file-list overlay to the fixed toolbar beside the Documents/Files toggle. In Documents it immediately follows New Document; in Files it follows the file/folder creation controls. It shares their 28px square size and remains available to accounts with database access when creation controls are hidden. The [feature contract](../features/document-databases/document-databases-and-catalog.md#scope) and [usage guide](../../../docs/guides/database.md#creating-and-editing-tables) own these current entry points.

Local verification:

- `node --test server/database-entrypoints-ui.test.ts` passed in the primary checkout and an isolated snapshot at 320px, 390px, and 1280px. It checks toolbar geometry, absence of the file-list overlay, scrolling, both scopes, keyboard activation, tooltips, and guest/permission visibility. Temporary browser captures were inspected; they use fixture data, not a physical device or production session.
- `node --test server/sidebar-create-ui.test.ts` passed, including the isolated snapshot rerun.
- `npm run build` passed in the primary checkout and in `.worktrees/explorer-database-toolbar-verification`, using HEAD plus this task's code and existing installed dependencies. The snapshot excludes concurrent workspace API refactoring. It emitted the existing chunk-size warning.
- `npm run lint` passed with existing warnings; targeted lint for the new button and updated regression passed without diagnostics.
- `npm run check:docs` validated all descriptions but retained 39 unrelated missing-target errors. Changed documents have no local-link errors. `git diff --check` passed for this task's changes.

The primary-checkout build initially encountered incomplete exports in concurrent API edits and later an unused type import in that refactor. The unused import was removed as a local build prerequisite; those unrelated refactor changes are excluded from this task's commit. No deployment, launcher, or application server lifecycle operation was performed.
