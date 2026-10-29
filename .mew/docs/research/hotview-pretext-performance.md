---
title: "Hotview performance after introducing block caching and Pretext"
description: "Compares input, initial display, and DOM counts in Hotview after applying per-block Markdown and line-number caching together with Pretext-based DOM virtualization against the same synthetic Markdown baseline, and records the scope of validation and remaining limitations."
created: 2026-10-19
updated: 2026-10-19
---

# Hotview performance after introducing block caching and Pretext

## Comparison scope

Reduced the full serialization, line-number calculation, and offscreen DOM costs identified in the [pre-adoption measurements](editor-input-performance.md). The current implementation contract is in [Hotview input and block rendering](../development/hotview-rendering.md), and the rationale is in the [adoption decision](../decisions/0016-hotview-pretext-windowing.md).

These results reflect the **combined effect** of per-block serialization, line-number and file-link decoration caches, skipping local body echo, Pretext height prediction, and omitting offscreen content DOM. Do not interpret them as an independent improvement rate from Pretext alone.

## Measurement conditions

The existing [measurement tool](../../../server/editor-performance-benchmark.mjs) was run unchanged on the final working tree on 2026-10-19. The baseline is the pre-adoption result recorded at `bfb25f7`.

- Linux x64, AMD Ryzen 5 9600X, 12 logical CPUs, Node.js 22.22.2, Chromium 153.0.8010.12.
- 1280×800, production React, dark theme, measured after local IBM Plex Sans KR and Mono finished loading. No CPU throttling.
- Uses the same synthetic Markdown in the actual EditorPane's guest-local Hotview and Plain editors. Collaboration, networking, and file autosave are mocked.
- After 5 warm-up inputs before the first body paragraph, ASCII `x` is typed 20 times. The 50- and 500-paragraph cases each run 3 times on fresh pages, and the 5000-paragraph case runs 1 time, alternating the execution order of the two editors. There are 14 results in total.
- Do not run concurrently with other browser checks. The app server and `dist/` are neither used nor modified.

```bash
MEW_BENCH_SAMPLES=20 MEW_BENCH_OUTPUT=/tmp/mew-editor-pretext.json node server/editor-performance-benchmark.mjs
```

## Results

Times are in ms. JavaScript and layout values are medians of per-round averages calculated by dividing CDP interval deltas by the number of keys. The frame boundary is the p50 of all samples from keydown to the second RAF, not paint timing or INP. Medians use nearest rank, selecting the smaller of the two middle values for even sample counts. The 5000-paragraph results are from one round.

| Paragraphs and size | Previous Hotview JS/key | Updated Hotview JS/key | Updated Plain JS/key | Updated Hotview layout/key |
| --- | ---: | ---: | ---: | ---: |
| 50 · 11.3KB | 5.4 | 3.4 | 2.1 | 1.1 |
| 500 · 113.0KB | 61.1 | 5.4 | 2.6 | 1.2 |
| 5000 · 1.13MB | 16047.9 | 38.0 | 6.2 | 2.5 |

JavaScript time decreased by about 91% for the 113 KB document and about 99.8% for the 1.13 MB document. Serialization calls for the large document decreased from 4/key to 2/key sharing a cache, and inclusive serialization time fell from 15435.0 ms/key to 1.9 ms/key. Function times overlap and are not added to CDP time.

| Paragraphs | Updated Hotview frame boundary | Updated Plain frame boundary | Updated Hotview initial display | Updated Hotview DOM descendants |
| --- | ---: | ---: | ---: | ---: |
| 50 | 32.0 | 32.1 | 197.3 | 301 |
| 500 | 32.0 | 31.9 | 297.9 | 726 |
| 5000 | 40.8 | 31.9 | 941.6 | 5226 |

Previously, the 1.13 MB document took 10311.1 ms to display initially and had 30001 DOM descendants. Initial display now takes about 1 second, with text, link, and cursor DOM limited to the viewport. One placeholder remains per top-level block, so the DOM count is not completely independent of document length.

## Validation and remaining scope

90 unit tests for serialization, line numbers, virtual blocks, file links, footnotes, Markdown behavior, and selected-line calculation, plus 8 related browser checks, passed. Browser checks cover desktop and mobile viewports, local and Yjs editing, input, undo, copy, table of contents, search, and view switching for hidden blocks, external source replacement, code, tables, images, and preserving DB title drafts while scrolling and saving on blur. Type and documentation checks also passed. Lint for the changed files still reports 1 existing React dependency warning in the collaboration seeding effect.

Browser checks were verified individually or sequentially. Intermittent failures in the existing gutter check were traced to CDP reading DOM references that had already been replaced; the check was updated to validate numbers and styles from a snapshot in a single callback. Some string-form wait expressions were not being executed as functions; these were fixed with explicit calls. The input paragraph at code-block EOF was confirmed to be source line 10 both before and after the change, correcting the existing test's expected value of 11. The new virtual-block check scrolls after mobile focus adjustment finishes and types after the model and browser selections match.

Waiting for actual input updates revealed input loss in the file-link cursor widget that also existed in the previous code. Ordinary non-composition input was changed to update the model instead of the widget DOM, and English and Korean input before and after links is checked for persistence in Markdown.

Input notifications remain synchronous. Costs proportional to document size remain, including generating and passing the full document string and updating document positions, so large documents do not converge to Plain's timing. The internals of a huge single list or table and long selections can create substantial DOM. The implementation contract limits native browser find and accessibility-tree residency for offscreen text, as well as temporary state for hidden media.

These figures are desktop ASCII input results for synthetic documents. Actual OS Korean IME composition, mobile device performance, and field INP require separate checks. No build or restart was performed to apply the changes to the running app.
