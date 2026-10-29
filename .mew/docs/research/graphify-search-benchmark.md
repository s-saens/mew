---
title: "Graphify vs. rg code navigation performance comparison"
description: "A 2026-10-27 comparison record of Graphify and rg across 900 source files and 24 tasks, retained after the search integration was withdrawn. Distinguishes latency, output tokens, file inclusion rates, call-path limitations, and historical reproduction sources from unverified candidates involving change impact, attachments, and document concept relationships."
created: "2026-10-27"
updated: "2026-10-27"
---

The search integration has now been removed under [Decision 0080](../decisions/0080-retire-graphify-search.md). This document records measurements from
that time, and the reproduction sources are preserved in [History](../history/graphify/README.md). This does not mean the historical
commands below are available in the current checkout.

## Results

Under these conditions, **Graphify's default `query` did not improve search speed or output volume.** Its median lookup time was 47.4 times slower
than `rg`, and output tokens increased by 631.9%. Both methods included all predefined answer files. We found no performance
evidence supporting replacement of code searches with known function names by the default `query`.

These are median and p95 query times for 24 tasks, each repeated 5 times, totaling 120 queries per method. Output token counts were identical across repetitions, so they were summed once per task.

| Method | Median query time | p95 | Total output tokens across 24 tasks | Known-file inclusion rate | Inclusion rate within the first 10 files |
| --- | ---: | ---: | ---: | ---: | ---: |
| `rg` | 11.9ms | 15.5ms | 12,062 | 100% | 93.75% |
| Graphify `query` | 563.1ms | 671.3ms | 88,276 | 100% | 100% |

Inclusion rate is the average proportion of designated files retrieved for each task. The first 10 are based on **unique files in order of first appearance in the output**.
Because `rg` outputs in path order, we do not interpret this 6.25 percentage-point difference as an improvement in relevance ranking or answer accuracy.
The answers consist of some known files; this did not evaluate completeness or precision across all relevant files.

## Differences in specialized queries

`explain`·`affected` produced less output than the default `query`. Across the 16 definition and impact tasks where file inclusion rates could be compared, output fell from
5,224 to 4,418 tokens, a 15.4% reduction, but median lookup time increased from 11.8 to 462.3ms, making it 39.2 times slower. In these
16 tasks, both methods included all known files, and every specialized lookup returned exit code 0.

| Task | `rg` median | Specialized query median | `rg` output tokens | Specialized query output tokens | Output change |
| --- | ---: | ---: | ---: | ---: | ---: |
| 8 definition tasks → `explain` | 11.7 ms | 500.3 ms | 4,126 | 2,739 | −33.6% |
| 8 call and impact candidate tasks → `affected` | 11.8 ms | 362.8 ms | 1,098 | 1,679 | +52.9% |

Thus, specialized lookups do not always reduce output costs either. The token reduction rate measures **the size of tool output text** counted with `o200k_base`; it is not
a reduction rate for model input, reasoning, answers, caching, repeat lookups, actual billing, or total agent tokens. No model sessions were run.

## Connection paths and call paths

The median `path` time for the 8 tasks asking about call paths
was 538.0ms. The command succeeded in 7 cases, but 6 of
these were structural connections using `contains`·`imports`·`imports_from`. For example, `updateCell ← contains — databaseService.ts — contains → coerceCellValue` does not show function call order.

Output consisting solely of call and indirect-call edges
occurred in 1 of 8 cases. `searchInProject → resolveProjectPath → assertNotServerDataPath` was connected through `calls` and `indirect_call [INFERRED]`. We confirmed evidence for the indirect relationship from function argument passing
in the source and the execution of `assertSafe(resolved)`, but this is not runtime execution verification. We do not describe this classification
as 12.5% execution-path accuracy.

In the remaining 1 case, `searchFileNames` existed on both the server and client, so the command returned exit code 3 and candidates for disambiguation. We did not revise the question
after measurement to make it succeed and include that result in the totals. Across all 360 measurements, the failures were the 5 specialized lookups for this task.
For every task and method, exit codes, output sizes, output tokens, and candidate file order were identical across 5 repetitions.

Because `path` output shows symbol names without file locations, we did not score its file inclusion rate. The 8 path tasks
also had no independently established intermediate answer files beyond the start and end files, so file inclusion rates from `rg` and the default `query` alone
cannot evaluate relationship exploration quality. We do not use token reductions that include the short `path` output as evidence of improved efficiency.

## Conditions and procedure

- 2026-10-27 Linux x64, AMD Ryzen 5 9600X, Node v22.22.2, Python 3.11.15,
  ripgrep 15.2.0, Graphify 0.9.96, tiktoken 0.13.0·`o200k_base`.
- We copied the 900 current source files, totaling 6,560,260 bytes, selected by `collectSources` in the [local code search tool](../history/graphify/graphify.mjs) into a separate
  Git repository and pinned them with SHA-256. Documents, tests, account data, and
  build artifacts were excluded. The copy's hash was unchanged at the end of measurement.
- The [24 fixed tasks](../history/graphify/graphify-benchmark-cases.json) comprise 8 cases each for definitions, call impact, and paths. They cover search, paths, permissions, sessions, collaboration,
  previews, DB, and drawing. A separate agent read the
  source and established the known files and evidence before seeing Graphify results. Questions were
  written in Korean, but both tools received predefined code identifiers as input.
- We used `rg --no-config --sort path -n -H -F -w -e <식별자> ... -- <동일 파일 목록>` as the baseline. The file list was sorted by path in advance. We also checked
  that `rg --sort` does not reorder explicitly supplied file arguments.
- Default Graphify passed the same identifiers to `query`. The specialized method used `explain`·`affected`·`path` according to task type. Because `affected` includes multiple relationships
  beyond direct calls and impacts to a depth of 2, we evaluated only retrieval of a subset of the answers.
- After one warmup per method and task, we ran 5 sequential repetitions. We rotated the order of the three methods for
  each task and repetition. Each command started a new process, and timing continued until it exited. Graphify included the Mew wrapper's Node/Python
  startup, package version check, freshness check of all sources, and graph loading. We did not add an unnecessary freshness check to `rg`.
- We retained stdout·stderr from the first repetition and timing, exit codes, candidates, and tokens from all repetitions.
  Token counting was performed after timing ended. Candidate parsing and answer evaluation were also excluded from command
  execution time. The default `query` token budget of 1,500 was not a strict upper limit because of upstream's connection output policy.
- A separate agent checked the raw output and call relationship classifications against the source. This was not user acceptance or an evaluation of actual work performance.

## Indexing cost

**Creating a new graph** in the isolated repository took 14,081.6ms for the entire wrapper, of which 13,922ms was spent running `extract` and checking the resulting
graph. Package installation time was excluded. The graph contained 8,243 nodes and 25,987 relationships, with 8,275,496 bytes
of JSON. Running `index` with no changes took 105.5ms. Because the OS file cache was not cleared, this does not represent disk cold-cache performance.

Because lookups themselves were slower than `rg`, these measurements have no break-even lookup count at which indexing costs are recovered. This
compares lookup latency only; we did not measure the time a person spends reading and combining relationships.

## Reproduction and raw data

After restoring the [source layout and installation environment from that time](../history/graphify/README.md) in a separate isolated checkout, you need
`python3` with access to `uv`, Graphify, `rg`, and `tiktoken`. To use a different Python, specify it with `MEW_GRAPHIFY_TOKENIZER_PYTHON`. Use a new output folder
to avoid overwriting existing materials.

```bash
node tools/graphify-benchmark.mjs .data/benchmarks/<새 실행명> 5
node --test tools/graphify-benchmark.test.mjs tools/graphify.test.mjs
```

The [measurement script](../history/graphify/graphify-benchmark.mjs) does not use the app server, production DB, or `dist/`. The command above from the original layout pins the
source again from the checkout where it runs, so results under changed code represent different
conditions. The raw materials from this run were stored in the Git-excluded `.data/benchmarks/graphify-20261027/`. They include
source copies, a hash list, fixed tasks, the wrapper and measurement script used at execution time, graphs, raw output,
`results.json`, derived aggregates in `analysis.json`, and call-edge classifications in `path-analysis.json`.

The source fingerprint is `efd2cf63f3398a3df4534fb82a1d514b30c2fc61cad0b5ebf965be13fae5fa07`. The raw report's `revision` is HEAD `2d6305333d604e49553ca73fb37a03ffecbf1081` at the end of execution; because commits
from other work were made during the run, the source reference is the pinned copies and file hashes, not this
commit. The final measurement script preserved in history records the
starting and ending HEAD separately and also outputs call-edge classifications.

Ran 10 `node --test` tests and lint and syntax checks for the modified tools. Documentation
check results are recorded under follow-up measurements in the [work record](../work/graphify-code-search.md).

## Scope of interpretation

These results compare local candidate searches across 900 source files with identifiers already
known. They did not measure the time to check source text after reading relationship descriptions, Korean natural-language search, answer accuracy, actual agents' total
resolution time, tokens, or fees, or the app's SQLite FTS search, browser rendering, or remote transmission.
With few tasks and repetitions and no control over other host load or the OS cache, no statistical significance or improvement rates for other repositories are claimed.
The results support keeping the existing `rg` as the baseline for general search and selectively using dedicated queries when relationships are needed.

## Other potential uses to consider

The search comparison alone does not rule out all uses of Graphify. The following ideas have not yet been implemented or evaluated.

| Candidate | Mew integration point | Value to validate |
| --- | --- | --- |
| Change impact candidates | Git changed files and diff | Does it reduce files missed in review among callers and import dependencies outside the diff? |
| Agent attachment suggestions | Selected files and conversation attachments | Do related file candidates that users can select improve accuracy and total time for actual work? |
| Document concept relationships | Separate relationship display in the Documents graph | Are concept connections beyond explicit Markdown links useful? |

The first candidate is impact guidance for Git diffs. For 5–10 past changes, first identify the required callers, tests, and documents, then
compare top-candidate hits, missing required files, total review time, and index update costs against `rg` and TypeScript Find References. Whether Graphify
can also connect tests and documents, which were excluded from the current experiment, requires separate verification. Display
code calls, imports, containment, and inferred relationships distinctly, and do not interpret results as proof of failures or conflicts.

The existing parser currently handles the explicit link graph in Documents. Experiments that use a model to extract document concepts add cost, permission,
and freshness requirements, so they are not considered simple replacement candidates for the existing link engine. These
candidates do not constitute approval or verification of reinstallation, background analysis, or product UI implementation.
