---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew RAG uses embedded LanceDB and local multilingual embeddings. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0071 — mew RAG uses embedded LanceDB and local multilingual embeddings"
created: 2026-08-21
updated: 2026-09-29
---

- Date: 2026-08-21
- Status: Superseded by: 0176
- Subsequent decision: [0176](0176-mew-remove-local-rag.md) — Remove all local RAG functionality
- Subsequent decision: [0111](0111-mew-native-deployment-and-supervisor.md) — Assumes Docker volume deployment; retains the local derived index contract
- Decision maker: User (draft: Codex)

## Background

The docs have grown to approximately 410,000 tokens, and MOCs alone provide insufficient discoverability when questions are phrased differently from document titles. However, Markdown must remain the SSoT, and mew defaults to native installation, with Docker and Postgres optional ([ADR 0023](0023-mew-selfhost-packaging-repo.md)). Requiring a separate Qdrant or pgvector instance would break the contract of deploying mew as a single package.

RAG must also be prevented from presenting outdated drafts or superseded ADRs as current answers, or allowing guests to read documents outside their approved scope through the index.

## Options

1. External Qdrant — feature-rich, but requires a separate service, backups, and deployment.
2. Existing optional Postgres + pgvector — reuses operational infrastructure, but makes the default native installation dependent on a database.
3. SQLite BLOB + exhaustive cosine similarity — few dependencies, but requires building vector database indexing and management features ourselves.
4. LanceDB embedded in mew + local embeddings — persists to files within the process and works without external keys.

## Decision

Adopt option 4.

- Add `@lancedb/lancedb` as a mew runtime dependency. Store the database, manifest, and model cache only under `<MEW_DATA_DIR>/rag/`. They are also persisted in Docker's existing `/data` volume.
- The default embedding model is `Xenova/multilingual-e5-small` q8 ONNX (384 dimensions) via `@huggingface/transformers`. Search Korean and English in the same space, using the `passage:` prefix for documents and `query:` for questions.
- Download the model during the first indexing run and cache it in the data dir. If neither network access nor a cache is available, existing exact search continues normally, and only semantic search responds with `unavailable`.
- Markdown and code files are the SSoT. LanceDB is a derived cache that can be fully deleted and regenerated, and is excluded from backups.
- The scope is the current mew project. Index only text files searchable in the default tree, and attach the file path, line range, title, and heading to results.
- Only logged-in users can use semantic search. Index queries must not bypass guest path approvals. Filter results again against the set of visible files at request time.
- For docs, reflect the MOC link categories `Current` and `History / raw` and ADR status in index tiers. Include only current by default, and include history only when users explicitly request it ([ADR 0070](0070-docs-hot-cold-context-layers.md)).
- Use file fingerprints to re-embed only changed content. Automatically regenerate the workspace index when the model or chunk schema changes.
- Search uses a hybrid approach that rescores vector similarity with local keyword overlap. External LLMs that generate answers are outside this scope; the RAG boundary is a retrieval API that returns bundles of relevant context suitable for citation.

## Rationale

- The LanceDB JavaScript SDK provides native packages for Linux, macOS, and Windows and connects to a local path. mew can retain its single Node process and Docker image structure.
- The local ONNX model requires no API key and sends no documents externally; the 118MB q8 model is cached once and reused.
- At a scale of 400K tokens, an embedded store offers greater deployment and operating cost savings than an external distributed DB. If growth makes an external DB necessary, a new ADR can replace only the storage layer while preserving `EmbeddingProvider` and the retrieval API contract.
- Providing search results and citations before generated answers avoids making hallucinations and permission boundaries separate problems. Agents can use the returned paths and lines directly as evidence.

## Results

- Semantic search is available with the mew distribution alone. No Postgres, Qdrant, or OpenAI key is required.
- First use is slow due to model downloading and full indexing, and uses approximately 130MB for the model cache plus space for the vector index. After that, only changed files are processed.
- The model runtime's image processing dependencies are not invoked in the RAG path. Supply chain vulnerabilities remain subject to regular `npm audit` checks, and only text input is passed to the model.
