---
title: "Unified explorer search box and hierarchical results"
description: "Records the explorer's unified search box, hierarchical results, context tooltips, restored Documents/Files toggle, right-side close button, and the 2026-10-30 corrections for literal filename queries and a borderless 36px search header aligned with panel tab bars. Distinguishes local verification and earlier documentation errors from application to the running instance."
created: "2026-10-29"
updated: "2026-10-30"
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

## Literal filename matching

On 2026-10-30, reproduced `Agents.md` returning `agent-sessions.md`, `0031-agent-display-events.md`, and `agents-sdk/SKILLS.md`. The host scorer accepted characters in order anywhere in a path; the demo inserted `.*` between query characters. Replaced both implicit subsequence matchers with contiguous literal matching. The host retains basename-first ranking, partial names and paths, case sensitivity, explicit wildcard and regex modes, permissions, scopes, and the 50-result limit. The current behavior is owned by the [feature contract](../features/projects-files-search/filename-content-search-and-replacement.md); [ADR 0090](../decisions/0090-literal-filename-search.md) records the contract change.

Verification:

- Confirmed four new or updated regression scenarios failed before the implementation change, including both catalog-backed host search and demo HTTP search.
- Passed 54 tests across `server/fileNameSearch.test.ts`, `server/search-pattern.test.ts`, `server/search.test.ts`, `server/searchApi.test.ts`, `server/perf.test.ts`, `src/demo/lazy-files.test.ts`, and `src/demo/transport.test.ts`. These cover literal matching, case sensitivity, Unicode and punctuation, partial names and paths, explicit patterns, scopes and permissions, 50-result limits, 10,000 catalog entries, content search and replacement, and demo filename lookup without loading bodies.
- `npx tsc -b` and targeted oxlint for the four changed source and test files passed.
- `npm run check:docs` passed with 556 descriptions and no description or local-link errors.

No app build, deployment, launcher execution, or runtime server changes were performed. The running instance still requires the user to apply the source changes. No live-browser or physical-device verification was performed for this matching-only correction.

## Compact search header

On 2026-10-30, removed the search field's rounded border, inset background, and stacked outer padding. The search row now matches the panel tab bars at 36px including its bottom divider. The input retains a visible keyboard-focus outline, and option and close buttons retain their 24px interaction areas. Scope tags and expanded replacement controls keep their own spacing below the fixed-height row. The [feature contract](../features/projects-files-search/filename-content-search-and-replacement.md) and [shared UI contract](../development/ui-contracts.md#search-within-the-file-explorer) own the current behavior.

Verification:

- Added a regression assertion against the actual editor `TabBar`; it failed before the source change because the search row had a different height.
- `node --test server/search-panel-ui.test.ts` passed. Its four Files/Documents × desktop midnight/mobile rose combinations check matching header heights, absence of a decorated field container, visible keyboard focus, control dimensions and non-overlap in a 240px panel, and alignment with empty, filename, and content queries. Existing search, clear, close, option, preview, navigation, and late-response checks also passed.
- Reviewed isolated desktop and mobile screenshots. These use mocked responses and do not verify the running server or physical devices.
- `npx tsc -b`, targeted oxlint, and the layout detector passed. Oxlint reported five warnings in existing search logic; the detector reported no findings.
- `npm run check:docs` passed with 561 descriptions and no description or local-link errors. `git diff --check` passed.

No app build, deployment, launcher execution, or runtime server changes were performed. The user must build and apply the changes to update the running instance.
