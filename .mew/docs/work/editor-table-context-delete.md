---
title: "Delete table rows and columns from the context menu"
description: "Records the 2026-10-28 table context-menu row and column deletion, table removal when deleting the last row or column, read-only controls, isolated browser, type, and lint check results, and the scope not applied to production."
created: "2026-10-28"
updated: "2026-10-28"
---

Added `행 삭제` and `열 삭제` to allow deleting table rows and columns from the context menu. Current behavior is owned by the [table feature contract](../features/document-code-media-editing/markdown-table-editing-and-copying.md), and user actions are owned by the [table editing guide](../../../docs/guides/editor.md#editing-and-copying-tables).

Made insertion and deletion both use the right-clicked cell's current document position. In read-only mode, deletion items are hidden, and edit permissions are also checked at execution. Existing editor commands reject deletion of the last row or column, so the table deletion command runs when only one remains.

`node --test server/editor-table-menu-ui.test.ts` passed. In isolated Chromium at 1100px and 390px, checked that only the right-clicked row or column was deleted even when the cursor was in another table, as well as header deletion, keyboard activation, menu dismissal, read-only behavior, table removal for the last row or column, and preservation of surrounding body text. Existing row and column insertion and Esc cancellation checks also passed, and menu captures at both screen widths were reviewed. After the first check showed that deleting the last column had no effect, table deletion handling was updated.

`npx tsc -b` passed. `npx oxlint` for the changed code and tests completed without errors, while existing React warnings in `Editor.tsx` remained. The browser test bundle retained the `use client` warning from an existing dependency.

All 509 descriptions passed `npm run check:docs` without errors. Link validation failed with 18 existing links pointing to `docs/features/MOC.md` and task documents that had already been deleted before this work. There were no link errors in the documents changed this time. `git diff --check` also passed for the work scope.

No app build, deployment, server launch, or restart was performed. The user applies the changes to the actual instance.
