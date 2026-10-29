---
title: "Unified explorer search box and hierarchical results"
description: "Records the 2026-10-29 consolidation of search tabs into a single search box and content toggle, and implementation of file/document hierarchical results and tooltips with context around matches. Distinguishes isolated validation, existing documentation errors, and the scope not applied to production from restoration of the document/file toggle and correction of the close button position to the right of the search box."
created: "2026-10-29"
updated: "2026-10-29"
---

## Purpose and results

Removed the navigation, filename search, and content search tabs so users can see the original file and document locations while searching. A top search box and content search toggle are shared, and the document/file scope is selected with the existing two-button toggle. Results show only matching items and their ancestors in the existing tree, and clearing search restores the previous expansion and scroll state.

Hover and keyboard-focus tooltips for body-content results show the matching line and up to 3 lines each above and below it. Context is limited to approximately 10 words on either side and a line-length cap, with matches highlighted. Navigation among multiple matches, opening the matching location, and per-file and global replacement are preserved. Added `root` filtering before the scope limit and optional `context` to the API.

The current contract is owned by the [feature document](../features/projects-files-search/filename-content-search-and-replacement.md) and [search guide](../../../docs/configuration/search.md); the decision rationale is owned by [ADR 0085](../decisions/0085-explorer-inline-search.md).

## Verification and application

- Ran 11 test files together for search, patterns, filenames, APIs, tree construction, explorer performance, creation, terminology, actual app switching, and startup UI with isolated `MEW_DATA_DIR` and `MEW_WORKSPACE`; 44 tests passed. Verified JSON/SSE context consistency, long lines, Unicode, original-text offsets, document/file scopes, and filtering for the 50-item limit.
- In the isolated UI, checked hierarchy, match highlighting, restoration after clearing search, options, the content toggle, 7-line tooltips, and opening original-text locations across Files/Documents × 1100px midnight/390px rose combinations. Also checked restoration of the previous collapsed state and 140px scroll position after opening a search result and clearing search; cancellation of late responses on clear, mode, or scope changes; opening the second match; and prevention of delayed parent-document lookups overwriting the selection. Responses were mocked with sample data; this was not actual-server or physical-device validation.
- `npx tsc -b` and oxlint checks for the changed code passed. Lint warnings remain.
- `npm run check:docs` failed because frontmatter was missing from the existing `docs/지원서.md`. That file contained user changes predating this work and was left unchanged. `node server/document-links.ts --all` also failed with 19 existing link errors involving absolute paths in the README and references to deleted documents and tasks. Descriptions and local links in the 6 changed documents passed a separate check using the same validation functions.
- The impeccable detector passed with no findings in the changed UI. Desktop and mobile views of the isolated component were reviewed.
- No app build, deployment, launcher execution, or server restart was performed. Application to the running instance must be checked after the user builds and applies the changes.

## Restore the document/file toggle

Corrected a scope overreach that changed document/file switching to a dropdown when only the search tabs were meant to be removed. Restored the existing two buttons' appearance, selected state, click and touch behavior, left/right arrow and Home/End switching, and document context-menu settings. The single search box, content search toggle, tree results, and context tooltips are preserved. Updated the actual App regression test to verify that scope selection has no combobox and that the document and file buttons switch directly.

Validation: 8 App switching and unified-search regression tests and 3 startup UI regression tests passed. `npx tsc -b`, oxlint for the changed code, the UI detector, and description and local-link checks for the 6 changed documents also passed. Full documentation validation failed due to the existing frontmatter error recorded above. Desktop and mobile toggle displays were checked in isolated views; no app build or application to the server was performed.

## Close button to the right of the search box

Moved the file explorer close X from the document/file scope row to the same line, outside and to the right of the search box. It reuses the shared `PanelCloseButton` and is always displayed even when the search query is empty. The document/file toggle, clear search, and search options are preserved.

Validation: Within 1 unified-search UI test, checked the X display with an empty search box, right-side placement, vertical alignment, 240px panel boundaries, and close callback across 4 file/document × desktop/mobile combinations. `npx tsc -b`, oxlint for the changed code (with warnings), the UI detector, and description and local-link checks for the 3 changed documents passed. Full documentation validation failed due to the existing frontmatter error. No app build or application to the server was performed.
