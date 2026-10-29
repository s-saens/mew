---
title: "0085 — Filename and content search within the explorer"
description: "Decision to consolidate search tabs and flat lists into a single search field, a content toggle, and the existing file/document tree, retain the existing two-button document/file toggle, and add root scope and bounded match context to the API."
created: "2026-10-29"
updated: "2026-10-29"
status: "accepted"
---

## Background

The filename and body search tabs and flat result lists obscured the folder and document hierarchy being browsed. Users must be able to use the same search field in the explorer, toggle only content search, and see matches in their original locations with surrounding context.

## Decision

- Remove the separate search tabs and make `SearchPanel` own the search field, requests, and replacement state. Pass results to the existing file or document view in `FileTree`.
- Build only matching items and their ancestors from the returned match paths. Keep search expansion and scrolling separate from normal browsing state, and do not fetch the full tree again.
- Retain the existing two-button toggle for selecting the document/file scope. Add the `root` scope to the API to select all of `.workspace` before applying limits and exclude separate Documents results. Preserve the existing unscoped unified queries and OR queries across docs/subproject scopes.
- Add an optional `context` array to body matches. Generate up to 3 lines above and below and approximately 10 words on either side from source text already read, limiting each line's length. Use the same generation function for JSON and SSE, preserving existing source columns and preview offsets.

## Alternatives and Rationale

Keeping search tabs and flat lists would not meet the requested hierarchical browsing behavior. Searching the full tree in the browser would lose the benefits of the existing catalog and lazy folder loading. Filtering by scope only after receiving results could let files from other scopes fill the limit first, so scope is selected on the server. Include bounded context in existing responses to avoid additional requests instead of rereading source text on every hover.

## Impact

Display a document's representative file as its page row, and preserve the actual path in the file view. Body search response sizes increase by the amount of context, but file, match, and line-length limits remain. Display older responses without context as single-line previews. Preserve search permissions, the regex engine, indexing, and scanner supplementation policies. The file explorer has no search tab to switch to through tab numbers, next/previous tab actions, or body swipes.

The current contract follows [Filename and content search and replacement](../features/projects-files-search/filename-content-search-and-replacement.md); validation and application scope follow the [Implementation record](../work/explorer-inline-search.md).

## 2026-10-29 scope toggle correction

The initial implementation incorrectly interpreted removing search tabs as also changing document/file scope switching and introduced a `SelectField` dropdown. Following user confirmation, scope switching was restored to the existing two-button toggle. The tabs to remove are browsing, filename search, and content search; the document/file toggle remains. The decisions on the search field, hierarchical results, and context API remain.
