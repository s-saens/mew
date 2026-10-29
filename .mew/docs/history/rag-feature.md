---
id: "mew-projects-semantic-search"
parent: "mew-projects"
title: "Local semantic search and RAG"
status: "implemented"
created: "2026-09-18"
updated: "2026-09-28"
status_hash: "834df5b74f90a8f7d616052f4adefcaf6f580bb94d9a5703cbf2c39ef63a0fe1"
files: ["src/components/rag-panel.tsx", "server/rag/settings.ts", "server/rag/guidance.ts", "server/rag/cli.ts", "server/rag/index.ts", "server/rag/embeddings.ts", "server/rag/chunking.ts"]
commits: []
description: "Preserves the feature requirements, indexing, search, settings, implementation, and verification of local RAG removed on 2026-09-28. These are not current instructions for running it or downloading models again."
상위파일:
  - "../features/projects-files-search/MOC.md"
  - "../features/projects-files-search/_projects-files-search.md"
---

> 2026-09-28: Removed RAG in accordance with [ADR 0176](decisions/0176-mew-remove-local-rag.md). The following is a record from that time, not current operating instructions. Do not retry reintroduction, reindexing, or model downloads without a user request.


## Requirements

- Find document context using a local semantic index.

### Scope

- Display **Start Indexing** if there are no indexed chunks, or **Reindex** if there are.
- There is no separate scope selection.
- The RAG panel at the far right of the bottom dock provides server-wide usage and agent guidance settings, semantic search fixed to the current project's Docs, vector DB status, an indexed file list, and reindexing.

### Boundaries and limitations

- Shared settings do not merge project data.
- Agents receive guidance on actual local search commands; searches are not mandatory for every task.
- Model preparation, resources, permissions, and indexing policies follow the search settings.
- Does not replace exact search.

### Detailed contracts

- [Search settings and contract](../../../docs/configuration/search.md)

<!-- mew:implementation:start -->
## Implementation details

- The RAG panel at the far right of the bottom dock provides server-wide usage and agent guidance settings, semantic search fixed to the current project's Docs, vector DB status, an indexed file list, and reindexing.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Open RAG at the end of the dock and verify that shared setting changes are reflected in the next ACP guidance for other projects, and that per-project search, index lists, file opening, permissions, and error retries work.
- Measure document discovery time and token efficiency for RAG, MOC, and general file search on the same document snapshot using the [comparison run procedure](rag-operations.md#comparing-document-discovery-methods). Distinguish retrieval of correct document paths from the quality of the final explanation.

<!-- mew:validation:end -->
