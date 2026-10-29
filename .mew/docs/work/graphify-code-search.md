---
title: "Applying Graphify to local code exploration"
description: "2026-10-27 record of introducing, measuring, and retiring Graphify as a local supplementary search tool. Preserves comparison evidence and historical sources, and distinguishes removal and verification of the active CLI, guidance, virtual environment, and index from current product features."
created: "2026-10-27"
updated: "2026-10-27"
---

The integration has now been removed. The adoption and measurement results below are historical records and do not indicate the current installation or execution state.

## Purpose and results

Added a CLI for querying code calls, references, and change impacts while retaining existing
search and description-based document browsing. The commands and validation
source from that time are preserved in [history](../history/graphify/README.md). [Adoption Decision 0077](../decisions/0077-local-code-graph.md) is superseded by [Withdrawal Decision 0080](../decisions/0080-retire-graphify-search.md).

On 2026-10-27, installed `graphifyy==0.9.96` in a project-local virtual environment on Linux with Python 3.11.15 and ran the initial AST analysis on 899
Mew source files totaling approximately 6.55 MB. The raw graph contained 8,228 nodes
and 25,948 relationships, and the analysis phase measured by the CLI took 14,515 ms. This time excludes virtual environment
and package installation, source selection, and copy creation. Figures for
generations reindexed after subsequent code changes may differ.

## Verification

On the initial actual code, `query "searchCatalog getIndexedSearchCandidates"` returned `server/searchCatalog.ts` and related symbols including `exactSearchCandidates` and `openDatabase`. Some
nodes were truncated by the 1,500-token limit, confirming
the need to narrow queries to individual symbols. A
query for the nonexistent `getSearchIndexCandidates` returned exit code 4.

- The final generation contained 899 files, 8,229 nodes, and 25,952 relationships, with an analysis phase of
  12,417 ms. Confirmed `stale: false` in `status` and reuse of the same generation when reindexing the same files.
- Used `explain "exactSearchCandidates"` to check files, lines, calls, and references.
  `path "exactSearchCandidates" "server/searchCatalog.ts::openDatabase()"` returned one call step, and `affected "exactSearchCandidates"` returned impacts including `indexedSearchPaths` and
  `createApiApp`. Specifying only `openDatabase` returned two symbols with the same name and exit
  code 3, so paths were used to distinguish them.
- `query "exactSearchCandidates"` returned 58 nodes and 191 relationships. Confirmed that upstream's 1,500-token
  budget is not a strict upper limit and can be exceeded, with output estimated at approximately 7,617 tokens.
- `node --test tools/graphify.test.mjs`: 4 tests passed, with no failures or skips. In a temporary Git repository, checked code, data, and symbolic-link
  boundaries; hashes for modifications, additions, and deletions; actual Graphify
  indexing, query, explain, path, and affected operations; stale-graph rejection; no-match exit codes and
  error messages; preservation of the existing graph on failure; recovery from corrupted
  state; and overwriting of an external output path by the user's `GRAPHIFY_OUT`.
- `npx oxlint tools/graphify.mjs tools/graphify.test.mjs`, `node --check tools/graphify.mjs`, and `git diff --check`
  passed.
- `npm run check:docs`: 493 descriptions had 0 errors, but the check failed on 17 existing link errors. These were 16
  errors related to the deletion of `docs/features/MOC.md` and 1 deleted task link, all present before application and left unchanged within
  this scope. Separately checked descriptions and links in the 4 modified documents using the project's `readDescription` and `documentLinkErrors`, with no errors.

## Remaining conditions

The initial analysis parsed only part of the syntax in `capture-macos.h` and `virtual-display-lease.h`, and warned that 14 files had no symbols because
they contained re-exports, data declarations, or similar constructs. Graphify's resolution
of dynamic calls and external-library relationships is not considered complete.

The initial implementation did not compare 20–30 questions. Tool queries were later compared using the 24 tasks below, but actual agents'
total exploration time, cumulative tokens, and answer accuracy remain unverified. No app
build, server start, shutdown, restart, deployment, product search API use, or shared MCP connection was performed.

## Follow-up performance comparison

On 2026-10-27, added [fixed tasks](../history/graphify/graphify-benchmark-cases.json) and a [measurement tool](../history/graphify/graphify-benchmark.mjs). On an isolated source copy that did not alter current files or the production instance, ran `rg`, default `query`,
and type-specific dedicated queries for 24 tasks, 5 times each. The [measurement results](../research/graphify-search-benchmark.md)
own the figures, procedures, and limitations. No improvement in speed or output volume was confirmed for default `query`,
and a limitation was identified in which structural connections could be mistaken for call paths.

`node --test tools/graphify-benchmark.test.mjs tools/graphify.test.mjs` passed 10 tests. Checked medians, percentiles, prevention of path misinterpretation, top10 file inclusion rates, the actual `rg` search scope,
and call-edge classifications, and reran the existing regression checks for actual Graphify indexing, queries,
freshness, and failure recovery. Compared output and exit codes across all repetitions
to confirm identical results, and separately reviewed 8 raw path outputs against source evidence.

`npx oxlint tools/graphify-benchmark.mjs tools/graphify-benchmark.test.mjs`, `node --check` for both files, and `git diff --check` passed. `npm run check:docs` reported 0 errors in 498 descriptions but failed on 18
link errors from existing and concurrent work unrelated to this change. Descriptions and internal
links in the 3 modified documents were
checked separately using the existing validation functions.

## Retiring the search integration

On 2026-10-27, following [Decision 0080](../decisions/0080-retire-graphify-search.md), moved the 5 active `tools/graphify*` files to [historical source](../history/graphify/README.md) without changing their contents and removed
execution guidance from agent entry points. Search settings now describe only the removal status and measurement history. Separate
regression checks verify the absence of active tools and automatic guidance and the preservation of historical evidence.

Removed approximately 243 MB of virtual environment, active indexes, and derived source under `.data/graphify/` installed for this experiment.
Before removal, confirmed that no processes were using the virtual
environment. Preserved the raw measurement materials in `.data/benchmarks/graphify-20261027/` and cleaned up only the links within them that pointed to the removed virtual environment. Global installations,
settings, shared package caches, and other projects' environments were not changed.

Passed 24 tests across `server/search-guidance.test.ts`, `server/search.test.ts`, `server/document-descriptions.test.ts`, `server/document-links.test.ts`, and the historical `graphify-benchmark.test.mjs`. Lint for the modified tests
and `npx tsc -b` passed. `npm run check:docs` reported 0 errors in 504 descriptions but failed on 18
link errors outside this scope. Separate checks found no errors in descriptions or internal
links in the 7 modified documents. Checked only this change's paths with `git diff --check`,
separately from whitespace errors in concurrent work.

Potential uses for Git diff impact candidates, agent attachment suggestions,
and document concept relationships were recorded as unverified candidates in the [research record](../research/graphify-search-benchmark.md#other-potential-uses-to-consider). This withdrawal and review did not
implement product UI or new analysis features, or perform an app build, server restart, or deployment.
