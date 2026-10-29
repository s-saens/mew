---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: remove mew local RAG and use regular file search. Preserves the choices, rationale, and subsequent changes from that time; consult Mew's owning documents for the current contract."
title: "0176 — Remove mew local RAG and use regular file search"
created: 2026-09-28
updated: 2026-09-28
---

- Date: 2026-09-28
- Status: Adopted
- Decision maker: User request
- Supersedes: [0071](0071-mew-embedded-lancedb-local-rag.md) · [0167](0167-mew-shared-rag-panel-and-agent-guidance.md)

## Decision

- Remove local RAG functionality. Also remove its dock entry, panel, settings, semantic search API, indexing, embeddings, CLI, automatic search guidance for agents, and RAG-specific evaluation tools.
- Remove the RAG-specific direct dependencies LanceDB and Transformers.js, along with transitive dependencies no longer in use. Retain dependencies used by other features such as collaboration and the editor.
- Use README files, MOCs, and regular file search with clear file and feature names to navigate documentation. Retain filename, content, and regular expression search and replacement.
- Ignore the RAG entry in the previous browser dock order and preserve the user's order for other entries. Stop reading or updating existing RAG settings and derived caches. Do not automatically delete data from running installations.
- Preserve previous decision, feature, and operations documents and comparative measurement results as history. Do not retry RAG reintroduction, reindexing, or model downloads without a user request.

## Rationale

We decided against the maintenance cost of a separate semantic index in the current documentation structure, which maintains clear file and feature names. In the small-scale measurements in [Document Discovery Comparison](../../research/document-discovery-benchmark.md), regular file search was the fastest and had the lowest token cost. Do not generalize these results into a ranking for all semantic search tasks.

## Verification

Run regression checks for dock order compatibility, panel switching, agent context, and existing search, along with type, lint, and documentation link checks. Follow separate execution procedures for service builds and restarts.
