---
title: "Fix for highlighting matches in search results"
description: "2026-10-28 Record of the fix for search terms being hidden in long lines and narrow sidebars. Documents match-centered previews and highlighting, regression and isolated UI verification results, and the scope not applied to production."
created: "2026-10-28"
updated: "2026-10-28"
---

## Purpose and results

Make it possible to locate search terms in content search results. Previously, the server sent only the first 400 characters of long lines, leaving highlight ranges empty for later matches, while the browser displayed leading context first, hiding search terms in narrow rows.

Updated JSON and SSE search to generate previews around each match and separate preview-relative highlight ranges from original column positions. Result rows limit the width of leading context and display matches with a background color and bold text. [Filename and content search and replacement](../features/projects-files-search/filename-content-search-and-replacement.md) owns the detailed contract.

## Verification and application

- The 2 new regression tests failed against the existing implementation, reproducing empty highlight ranges in long lines.
- `node --test server/search.test.ts server/search-panel-ui.test.ts`: 14 passed after the fix. Verified long context containing Korean and emoji, 500-character indentation, multiple matches on one line, original column positions, and consistency between JSON and SSE.
- `MEW_UI_SCREENSHOTS=/tmp/mew-search-highlighting-check node --test server/search-panel-ui.test.ts server/search-pattern.test.ts server/searchApi.test.ts server/searchCatalog.test.ts`: 12 passed. In isolated Chromium with a 1100px midnight theme and a 390px light theme, checked that highlight ranges in the 240px search panel remained visible within rows and that clicking preserved original position information. Screenshots of both screens were also reviewed. Search responses used fixtures.
- `npx tsc -b` and `npx oxlint` on 5 changed TypeScript files: passed.
- `npm run check:docs`: The description check passed. The full link check failed because of 18 links to feature MOCs and task documents that had already been deleted before this work. The documents changed in this work have none of these errors.

No app builds, deployments, or server starts, stops, or restarts were performed. The user must build and apply the changes to the running instance; actual devices and live service screens were not verified.
