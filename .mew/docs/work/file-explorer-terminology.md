---
title: "Standardizing file explorer terminology"
description: "Implementation record dated 2026-10-28 standardizing the on-screen name of the file and document navigation and search panel from Sidebar to File Explorer. Records UI and keyboard shortcut label changes in four languages, changes to current Korean documentation, verification results, and the scope not applied to production."
created: "2026-10-28"
updated: "2026-10-28"
---

## Purpose and results

To reduce the ambiguity of a name that only indicated location, the panel that includes Documents and Files browsing and filename and content search is called **File Explorer**. The dock panel name, accessibility names and tooltips for open and close buttons, empty editor guidance, and shortcut settings labels have been standardized. The English, Chinese, and Japanese UIs use names with the same meaning.

Terminology and related headings and anchors have been aligned across the current Korean usage, settings, development, and feature documentation. Historical decision, work, and research records and snapshots are preserved. The internal panel ID `sidebar`, storage keys, and default shortcut `Ctrl+B` remain unchanged. [File and Folder Browsing and Operations](../features/projects-files-search/file-folder-exploration-and-operations.md) owns the scope of the name.

## Verification and application

- `node --test packages/ui/src/i18n.test.ts src/i18n.test.ts server/file-explorer-labels-ui.test.ts`: 7 tests passed. Verified open and close translations and shortcuts in four languages, plus dock accessibility names, tooltips, language switching, and selection using the existing panel ID in isolated Chromium at 1100/390px.
- `npx tsc -b` and `npx oxlint` for the changed TypeScript files: passed. Lint has existing React-related warnings.
- The additional full Korean literal check in `src/ui-localization.test.ts` failed because of strings outside translation calls in the existing source. The Markdown and time translation checks in the same file passed. `server/i18n-ui.test.ts` failed while waiting for the agent input area to appear, so naming was verified in a separate dock fixture.
- `npm run check:docs`: the description check passed. The full link check failed because of 18 existing links to deleted feature MOC and task documents. Links to old headings in the changed documents were corrected or preserved with compatibility anchors.

No app build, deployment, or server start, stop, or restart was performed. The changes have not yet been applied to the running instance; the user must build and apply them.
