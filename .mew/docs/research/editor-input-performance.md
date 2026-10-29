---
title: "Hotview and Plain input performance measurements"
description: "Measures Hotview and Plain keystroke handling, full-document serialization, line number calculation, and layout costs in isolated Chromium using identical synthetic Markdown. This research informs optimization priorities before adopting Pretext and does not change app behavior."
created: 2026-10-18
updated: 2026-10-18
---

# Hotview and Plain input performance measurements

## Purpose and scope

To determine whether Pretext can make the editors faster, this study separates JavaScript processing in existing input paths from browser layout costs. The measurement tool is [editor-performance-benchmark.mjs](../../../server/editor-performance-benchmark.mjs). Without changing app code or dependencies, it opens synthetic documents using in-memory bundles and Playwright request interception, as existing UI tests do. It does not use or modify the running app server or `dist/`.

Measurements target the 2026-10-18 working tree. The main measurement bundle is based on `e79076b` and includes the previously staged view-switching fix in `Editor.tsx`. During the study, `51ba6cb` was committed by other ongoing work, so follow-up comparisons ran on that working tree. The guest local input paths and `Editor.tsx`, `lineFocus.ts`, and `CodePane.tsx` are the same in both experiments. The follow-up experiment excluding line numbers measured a new control using the same source. This research commit does not include the preexisting changes.

## Measurement conditions

- Linux x64, AMD Ryzen 5 9600X, 12 logical CPUs, Node.js 22.22.2, Chromium 153.0.8010.12.
- 1280×800, default dark theme, production React. Apply the app's default font settings and wait for local IBM Plex Sans KR and Mono to load.
- Uses the actual `EditorPane` and Hotview/Tiptap and Plain/CodeMirror. Editing is local as a guest; collaboration, networking, and file autosaving are mocked.
- Uses identical synthetic Markdown with 50, 500, and 5000 paragraphs. Each paragraph contains Korean, English, emphasis, inline code, and file links.
- In both editors, after 5 warm-up inputs at the start of the first body paragraph, `x` is entered 20 times using keyboard events. Frontmatter and headings are not input targets.
- The 50- and 500-paragraph cases are measured 3 times on fresh pages, and the costly 5000-paragraph case is measured 1 time. The execution order of Hotview and Plain alternates each round. No CPU throttling is applied.

Measurements are distinguished as follows.

| Value | Meaning and limitations |
| --- | --- |
| JavaScript, layout, and style time | Interval deltas from CDP `Performance.getMetrics` divided by the input count. Includes measurement code and polling executed in the renderer. |
| Post-input frame boundary | From keydown to the second `requestAnimationFrame`. This is neither the actual paint time nor INP, and includes frame wait time. |
| Function time | Call counts and inclusive time for `dispatch`, `viewUpdate`, `lineFocus`, `serialize`, `getMarkdown`, `update`, and others. Nested values must not be summed. |
| Initial display time | From the start of React mounting through editor display, font readiness, and two frame boundaries. This is neither total file-opening time nor network latency. |

## Measurement results

Times below are in ms. JavaScript and layout values are medians of per-round per-key averages; frame boundaries are nearest-rank p50 values across all input samples. For an even number of samples, the smaller of the two middle values is selected. The 5000-paragraph values are from one round. Document sizes are UTF-8 bytes, with KB and MB expressed in units of 1000.

| Paragraphs and size | Hotview JS/key | Plain JS/key | Hotview layout/key | Hotview frame boundary | Plain frame boundary |
| --- | ---: | ---: | ---: | ---: | ---: |
| 50 · 11.3KB | 5.4 | 2.1 | 1.2 | 31.9 | 32.1 |
| 500 · 113.0KB | 61.1 | 2.6 | 8.8 | 82.2 | 32.0 |
| 5000 · 1.13MB | 16047.9 | 6.4 | 97.0 | 15668.2 | 31.8 |

At every size, Hotview performed full-document serialization **4 times/key**, while `getMarkdown` and `lineFocus` each ran **2 times/key**. The median per-key average inclusive serialization times were 1.9, 39.6, and 15435.0ms. These correspond to approximately 36%, 65%, and 96% of the JavaScript interval. Since function time and CDP time are instrumented separately, interpret these ratios as approximate shares of the cost.

For 5000 paragraphs, Hotview maintained 30001 DOM descendants and Plain maintained 319. Initial display times were 10311.1ms and 135.0ms, respectively. Large documents therefore require separate optimization of initial display and offscreen DOM handling in addition to the input path.

### Comparison excluding line numbers

For a 113KB document, each condition was measured for 3 rounds × 20 keys using the same source and conditions. The line-number exclusion removes the plugin **after mounting**, so only input costs are compared.

| Condition | JS/key | Serialization/key | Serializations/key | Layout/key | Frame boundary |
| --- | ---: | ---: | ---: | ---: | ---: |
| Existing Hotview control | 59.4 | 38.4 | 4 | 8.6 | 80.6 |
| Line number plugin excluded | 36.0 | 22.0 | 2 | 7.5 | 53.1 |

The JavaScript interval decreased by approximately **39%**, and the post-input frame boundary by approximately **34%**. Because this experiment simply omitted line numbers, these reductions are not guaranteed for a change that preserves the feature. The results support reducing duplicate serialization and full-document recalculation of line numbers.

Hotview of the same size was also measured for 3 rounds × 20 keys without per-function wrappers. The median JavaScript interval was 59.2ms/key, similar to the wrapped control's 59.4ms/key. The instrumentation wrappers alone therefore cannot readily explain the tens of ms in costs observed at this size.

### CPU profile

A separate 20-key Hotview run at 113KB was profiled at a 1ms sampling interval. `atBlank`, `normalizeInline`, and `text` in the `tiptap-markdown` and `prosemirror-markdown` serialization paths appeared among the major JavaScript self samples; `getClientRects` and GC were also observed. The profile's name-based `parse` and `render` aggregates may overlap with serialization functions, so they are not added as separate bottleneck percentages.

## Optimization assessment

These measurements suggest first validating **deduplication of the 4 full-document serializations per key and incremental line number calculation** before adopting Pretext. The cost of reconstructing the document model as a Markdown string remains even if text height and wrapping calculations are replaced. Later, when reducing the DOM display range for long documents, consider an experiment using Pretext to predict block heights.

This assessment is an inference based on the cost distribution of the synthetic inputs above. Neither Pretext's actual improvement nor performance after implementing virtualization was measured.

## Verified input paths

During normal controlled input, the following four paths invoke full-document serialization.

1. `serializer.serialize(state.doc)` in `LineFocus.decorations` to display the input transaction.
2. `getMarkdown()` in `Editor.onUpdate`.
3. `getMarkdown()` in the non-collaborative synchronization effect that checks React's body prop.
4. `LineFocus.decorations`, which updates the line-number cache in an empty transaction dispatched after the body prop changes.

The owning code is in [Editor.tsx](../../../packages/editor/src/Editor.tsx) and [lineFocus.ts](../../../packages/editor/src/editor/lineFocus.ts). `getMarkdown()` in `tiptap-markdown` converts the entire ProseMirror document into a Markdown string. In this synthetic document, serialization of ordinary paragraphs does not measure text dimensions in the on-screen DOM.

`lineFocus` time includes serialization and separate MarkdownIt parsing and decoration generation. `getMarkdown` also includes serialization time. `parseMarkdown` wraps only `editor.storage.markdown.parser.parse`, so an absence of samples does not mean that line-number calculation involves no MarkdownIt parsing.

## Reproduction

Run from the repository root. No app build or server startup is required. Results and optional CPU profiles are saved to `/tmp`.

```bash
MEW_BENCH_SAMPLES=20 node server/editor-performance-benchmark.mjs
```

The comparison without line numbers and CPU profiling were run under the following conditions. Run the control by omitting `MEW_BENCH_NO_LINE_FOCUS=1` from the first command.

```bash
MEW_BENCH_SIZES=500 MEW_BENCH_ROUNDS=3 MEW_BENCH_SAMPLES=20 MEW_BENCH_MODES=hotview MEW_BENCH_NO_LINE_FOCUS=1 MEW_BENCH_OUTPUT=/tmp/mew-editor-no-line-focus.json node server/editor-performance-benchmark.mjs
MEW_BENCH_SIZES=500 MEW_BENCH_ROUNDS=3 MEW_BENCH_SAMPLES=20 MEW_BENCH_MODES=hotview MEW_BENCH_INSTRUMENT=0 MEW_BENCH_OUTPUT=/tmp/mew-editor-uninstrumented.json node server/editor-performance-benchmark.mjs
MEW_BENCH_SIZES=500 MEW_BENCH_ROUNDS=1 MEW_BENCH_SAMPLES=20 MEW_BENCH_MODES=hotview MEW_BENCH_PROFILE=/tmp/mew-editor-profile.cpuprofile MEW_BENCH_OUTPUT=/tmp/mew-editor-profile.json node server/editor-performance-benchmark.mjs
```

Use `MEW_BENCH_SIZES`, `MEW_BENCH_ROUNDS`, `MEW_BENCH_LARGE_ROUNDS`, `MEW_BENCH_SAMPLES`, `MEW_BENCH_MODES`, and `MEW_BENCH_OUTPUT` to specify paragraph counts, repetitions, and output locations. The default number of repetitions for documents with 5000 or more paragraphs is 1.

`MEW_BENCH_NO_LINE_FOCUS=1` excludes the line-number plugin only on that isolated page. `MEW_BENCH_INSTRUMENT=0` omits per-function wrappers. Specifying `MEW_BENCH_PROFILE` and `MEW_BENCH_BUNDLE` saves a CPU profile and an in-memory bundle, respectively, for the largest Hotview case in the first round.

The current tool reads four core source files at startup, uses the same contents in the bundle, and saves their SHA-256 hashes in the results. Even if the working tree changes during measurement, the bundled contents and hashes of these files remain consistent. The initial tool used for this measurement read the disk when recording results, so the `EditorPane.tsx` hash in that JSON may differ from the version at bundling startup. The hash of that file in this measurement's bundle is `36e51faa0f52de82a3f49b2afeab2b39ddae92f08fc0dfd83ed255c34e57ec0c`; in the follow-up comparison, it is `595935b1046398bcea695f33790d3b9f4c67f8b778dc22da91585925b0ca8b3a`.

## Limitations of interpretation

These results come from inserting one ASCII character into the first paragraph of synthetic Markdown. Korean IME composition, long single paragraphs, tables, images, bulk pasting, continuous scrolling, mobile devices, collaboration, and actual save latency were not measured. These results should not be generalized to field INP for the full running app or performance on users' devices. No before-and-after comparison of adopting Pretext itself was performed either.

Progress during large-document measurements was checked in Node Inspector using loop variables and call stacks between inputs. Chromium's input processing was not stopped while the Node measurement tool was paused. CDP intervals may include additional waits and background processing, but the wait between keystrokes itself is excluded from function times and the time from keydown to the frame boundary. Large documents were measured in a single repetition, with too few samples to estimate tail latency precisely.
