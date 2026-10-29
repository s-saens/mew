---
title: "Retire the Graphify local search experiment"
description: "The decision to remove Graphify's Mew source search integration, automatic guidance, local installation, and active indexes after a comparison across 24 tasks. Preserve measurements and source history, and leave change impact, attachment suggestions, and concept relationships as separate unverified candidates."
created: "2026-10-27"
updated: "2026-10-27"
---

## Status

Adopted. Withdraws the introduction of supplementary Mew source search in [decision 0077](0077-local-code-graph.md).

## Background

In the [comparison of 24 tasks](../research/graphify-search-benchmark.md), the default `query` was 47.4 times slower than `rg` and produced 631.9% more output tokens. The inclusion rate for known correct files
was the same. Output benefits from specialized queries also varied by task, and a
risk of interpreting structural connections from `path` as call paths was confirmed. For current search needs, there is insufficient
justification for retaining the burden of a separate Python environment, index, and freshness management.

## Decision

- Remove the active `tools/graphify*` and agents' Graphify exploration guidance. Retain general code navigation and description-based document navigation.
- Clean up the virtual environment, derived sources, and index installed under `.data/graphify/` for the experiment, along with the virtual environment symbolic links in the measurement
  copies. Do not change the app server, the running `dist/`, other development tools, or global settings.
- Preserve the wrapper, tests, measurement tools, and tasks as [historical sources](../history/graphify/README.md). Retain the comparison report and
  raw measurement data excluded from Git. Do not automatically run new indexing or installation.
- Do not generalize these results as a rejection of all Graphify use cases. Change impact candidates, agent attachment
  suggestions, and relationships between document concepts will remain subjects for separate evaluation and will not be introduced as current features.

## Alternatives and Rationale

Retaining only specialized queries could reduce some output, but time and accuracy benefits for complete agent tasks have not yet been measured. Remove
the maintenance burden and validate again on tasks with clear value instead of retaining the current integration and extending it
to the product UI. Use TypeScript/LSP as the comparison baseline for reference navigation in current TypeScript code, and the existing Documents graph for explicit document links.

## Impact

The current repository no longer provides the Graphify CLI. The historical experiment can be examined through historical sources and fixed copies, but rerunning it requires
restoring the original layout in a separate isolated environment. If impact candidates from
Git diffs are evaluated in the future, first compare reductions in omissions, total review time, top candidate hits, and indexing costs across 5–10 past changes. If reintroduced, background
execution, product permissions, and update contracts will be defined in a separate decision.
