---
title: "Local code graph for agents"
description: "The decision to introduce Graphify as a local supplementary search tool, withdrawn by decision 0080. Preserves the code-only analysis, isolation, freshness checks, and existing search boundaries at the time, distinguishing them from current support status."
created: "2026-10-27"
updated: "2026-10-27"
---

## Status

Withdrawn. Superseded by [decision 0080](0080-retire-graphify-search.md). The original adoption decision follows.

## Background

Existing string search and description document navigation need to be retained while adding support for exploring function and module calls, references, and change impacts.
Graphify can build a local relationship graph from code ASTs. Introducing document semantic analysis, models, and shared services together would also change
the scope of existing RAG removal and the permissions and operations contracts, so this adoption is limited to code.

## Decision

- Install `graphifyy==0.9.96` in the repository's `.data/graphify/venv/` and run it through the project CLI. Do not use the upstream
  installer, global settings, Git hooks, or an MCP server.
- Select current content from the Git file list and the specified source paths and extensions to create a copy.
  Exclude tests, documents, hidden data, symbolic links, dependencies, and build artifacts.
  The copy preserves actual relative paths and package and tsconfig information to resolve relationships between files.
- Analyze with `extract --code-only --no-cluster` and two workers, and provide query, explain, path, and affected using the same local graph. Disable the LLM backend and question
  log storage. No external service calls are required except for installation.
- Record the package version and source hash in the CLI state to compensate for missing version information in the raw graph. Reject
  queries when there are changes, additions, or deletions, and require manual reindexing.
  Replace the current generation only after the new graph is complete; failed analysis must not overwrite the existing graph.
- Verify candidate paths and lines against the current source text. Retain the ownership contracts for document navigation and file
  search. Do not connect this to the shared search API or default guidance for other projects.

## Alternatives and Rationale

Using only the existing `rg` adds no dependencies, but requires reading and piecing together relationships between files each time. Do
not use Graphify's automatic upstream skill installation because it also changes existing instructions, runtime settings, and the answer storage flow. Replacing the entire product
search engine and introducing a document semantic graph will be reviewed separately after comparing actual quality and speed and designing multiuser permissions.

The [official 0.9.96 package](https://pypi.org/project/graphifyy/0.9.96/) and [upstream CLI implementation](https://github.com/Graphify-Labs/graphify/blob/v8/graphify/cli.py)
were checked. The installed 0.9.96 was checked for code-only skipping semantic analysis, raw graph query
support, and exit codes. Later changes on the upstream default branch
are not considered guarantees for the pinned version.

## Impact

This adds Python, uv, and storage for a local derived index. Full analysis is required after changes, and accuracy is not guaranteed for Korean questions, dynamic
calls, or parser errors. No improvements in search speed or token savings will be claimed before comparative experiments. Previous
successful generations remain until explicitly cleaned up. No production app build or restart is required, and product search behavior does not change.

The commands and validation sources from that time are preserved in [history](../history/graphify/README.md),
and execution results and withdrawal details are preserved in the [work record](../work/graphify-code-search.md).
