---
title: "Isolated Measurements of Search Index and File Catalog Optimizations"
description: "Records medians and reproduction commands from comparisons of project-scoped FTS v2, wildcard candidate extraction, and batch catalog visibility evaluation using synthetic files on 2026-10-24. Separately identifies initial indexing costs, common-term conditions for small projects, and the unmeasured production UI and network scope."
created: "2026-10-24"
updated: "2026-10-24"
---

# Isolated Measurements of Search Index and File Catalog Optimizations

Before replacing the DB engine or
adding Redis, repeated work in existing SQLite queries and the in-memory catalog was reduced. The [search
contract](../features/projects-files-search/filename-content-search-and-replacement.md) and [file browsing contract](../features/projects-files-search/file-folder-exploration-and-operations.md) own the current behavior, and [Decision 0058](../decisions/0058-search-query-and-catalog-batches.md)
owns the rationale.

## Conditions and Reproduction

Measurements were taken on 2026-10-24 on Linux with Node v22.22.2 and SQLite 3.51.2. Both scripts create only temporary files and DBs and clean them up on exit.
They block loading host configuration files and do not use the actual app server, production DB, account data, or `dist/`. Run them
from the repository root.

```bash
node server/search-performance-benchmark.mjs
node server/catalog-performance-benchmark.ts 5000 7
```

The search script's scale can be adjusted with `MEW_SEARCH_BENCH_FILES` (default 4,000, maximum 4,000), `MEW_SEARCH_BENCH_ROUNDS` (default 5, maximum 20), and `MEW_SEARCH_BENCH_OTHER_FILES` (default 30,000,
maximum 100,000). The catalog script's two arguments are the file count (maximum 20,000) and repetition count (maximum 15). The
comparison order alternates between runs, and the median duration across runs is used. Validation checks result equivalence
and candidate counts; tests do not impose an absolute time limit.

## Search

Created 4,000 plain-text files with 12 lines of body text each and placed `unique value workspace phrase` only in the last file. For the `unique*workspace phrase` search, FTS
candidates were retrieved with `workspace phrase`, then the source text was checked using the original wildcard. The comparison ran 5 times with
the index ready; both the FTS candidates and final results consisted of one file.

| Stage | Comparison method | Median |
| --- | --- | ---: |
| Candidate query | Existing project-first JOIN on the v2 DB | 307.546ms |
| Candidate query | FTS-first CROSS JOIN without a project posting condition | 0.114ms |
| Candidate query | FTS-first CROSS JOIN including project postings | 2.949ms |
| Source text search | Asynchronous scanner over all 4,000 files | 1,374.353ms |
| Candidate query and source text search | Project-scoped FTS and scanner over one candidate | 4.080ms |

The initial v2 index build took 2,590.429 ms. The JOIN comparison for candidate retrieval was an experiment that varied execution order and MATCH conditions on **the same v2 DB**.
These are not measurements taken directly from the v1 DB of an existing deployment. The wildcard source-text search comparison excludes the actual API's
catalog processing, permission filtering, serialization, network, and browser rendering time.

### Common Terms in a Small Project and Other Projects

Querying the shared FTS first could introduce a regression that reads all matches from other projects, so a separate condition
was checked. An in-memory DB contained one file from the target project and 30,000 files from other projects, all containing the same `shared common phrase`. In all 5
runs, the final candidate was the single file from the target project.

| Candidate query method | Median |
| --- | ---: |
| Existing project-first JOIN | 0.103ms |
| CROSS JOIN without a project posting condition | 10.304ms |
| CROSS JOIN including project postings | 0.379ms |

Intersecting the project hash and body postings within MATCH avoided traversing metadata for global matches. Comparing the full hash has a cost, leaving
constant overhead relative to the existing JOIN for small projects. Checks that apply permission and project conditions to results
are not omitted for performance.

## Catalog Visibility Evaluation

For 5,000 `.ts` files in the same ready snapshot, preparing roots and policies for each item was compared with preparing them once per
listing over 7 runs. Both methods checked each file's real path.

| Display condition | Preparation per item | Preparation per list |
| --- | ---: | ---: |
| Show All (`showAll=true`) | 152.981ms | 55.705ms |
| Default extension and hidden-file policies | 182.367ms | 55.405ms |

The new regression checks verify that preparing root and server-data base paths does not scale with the number of files, that a missing hidden-file configuration file is
read once per listing, and that real-path checks remain for each target. They also check hidden-file configuration changes between listings, switching to Show All, replacing
a symbolic link to point to server data, and different roots per account. These timings exclude initial tree construction, icon lookup, and per-account permission filtering.

## Verification

Passed 58 tests across 13 test files covering search, catalogs, trees, file reads, server-data boundaries, access control, hidden-file
lists, and platform behavior. The 2 tests specific to Windows ACLs and command wrappers were skipped on Linux. This run also included the 10,000-file
fixture check. The `tsc -b` type check and full lint passed; modified files have no new lint warnings, while existing warnings in other files remain.

## Scope of interpretation

These results compare specific processing stages using synthetic data and local I/O on the same host. They do not represent average or p95 search times
or overall loading improvement rates in actual installations. Values vary with query selectivity, file size, project count, disk, and host load.

For an actual installation, after the operator builds and applies the changes, `catalog.visibility`, `search.scope`, `search-index.query`, `search.scan`,
and `file.read` from `MEW_PERF_LOG=1` can be compared alongside the browser's existing file-opening Performance measure. This work did not include an
app build, server restart, production login, HTTP/P2P transmission, or browser trace.
