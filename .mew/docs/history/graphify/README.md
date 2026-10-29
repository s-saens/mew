---
title: "Retired Graphify experiment source"
description: "Archive location for the original Graphify local search wrapper, tests, comparison tools, and fixed tasks retired on 2026-10-27. These are historical reproduction materials requiring the file layout and isolated environment from that time, not current execution tools."
created: "2026-10-27"
updated: "2026-10-27"
---

## Status

This is experimental source code removed from the current search integration under [Decision 0080](../../decisions/0080-retire-graphify-search.md). Do not use it as active CLI, installation,
or agent guidance. The code contents have been preserved unchanged from before the move.

- [Wrapper from that time](graphify.mjs) and [verification code](graphify.test.mjs)
- [Measurement tool](graphify-benchmark.mjs) and [aggregation and evaluation tests](graphify-benchmark.test.mjs)
- [24 tasks defined in the source](graphify-benchmark-cases.json)

## Reproducing past experiments

The scripts were originally written for placement under `tools/` and for `.data/graphify/venv/` at the repository root. Running them directly from this location
does not reproduce the paths or installation environment from that time. Only
when revalidating the historical experiment, restore the original `tools/` layout from `a6fbb26` in a separate isolated checkout and prepare
the Python packages and tokenizer pinned at that time. Do not reverse the removal state or agent instructions in the current checkout.

The command used during verification was `node tools/graphify-benchmark.mjs .data/benchmarks/<새 실행명> 5`, and the source, hashes, stdout, stderr, and graphs from the original
run are preserved in the Git-excluded `.data/benchmarks/graphify-20261027/`. The Python virtual environment links in the preserved copy have been removed, so reproduction
requires a separate environment. Do not register the command that
indexes current files as the production default.

See the [measurement results](../../research/graphify-search-benchmark.md) and [adoption and withdrawal record](../../work/graphify-code-search.md).
