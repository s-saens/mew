---
title: "Search agent history with a local topic and body index"
description: "Records the rationale and scope for replacing direct session ID entry with unified topic, body, and ID search, and choosing SQLite FTS5 trigram, normalization, key-term synonyms, and incremental indexing on save instead of embeddings."
created: "2026-10-28"
updated: "2026-10-28"
---

Status: Adopted

## Background

Previously, history was loaded by selecting from recent sessions or entering a session ID directly. Users requested finding relevant conversations by topics such as `에이전트패널` without remembering IDs, and using the same search field when they do know the ID. Filtering list titles alone is insufficient to find answer content absent from titles and older conversations created in external CLIs.

## Decision

Provide unified topic, body, and session ID search across sessions in the current runtime and cwd. Index user questions and agent answers from Mew transcripts in the existing SQLite FTS5 trigram index, and update the index when transcripts are saved. Supplement existing transcripts during searches by checking revisions and event counts. Read Codex and Claude disk JSONL files line by line and merge them into the index, reusing indexed data when file modification times and sizes are unchanged. During searches, index supplementation, source reading, and body retrieval run in a reused Worker that receives the requesting account's context, separate from the server's main event loop.

Normalize differences in spacing, case, and symbols in queries and body text, and apply Korean-English synonyms for key Mew terms. Prioritize exact and partial session ID matches. Do not introduce external embedding APIs, vector databases, or model downloads. Search finds related topics through body matches and predefined synonyms; it does not guarantee arbitrary semantic inference.

Separate search from restoration. Typing and Enter only search; selecting a result uses the existing `load_session` path. Return the query and request ID in the response so late responses do not overwrite the latest results. Preserve switching restrictions caused by session occupancy, ongoing work, approvals, and queues.

## Alternatives and Rationale

| Alternative | Assessment |
| --- | --- |
| Embeddings and vector search | Better at finding related concepts that are not registered, but adds models, resources, index lifecycle management, and inference costs. Address the current request first through Korean spacing normalization and expansion of key feature terms. |
| Read all JSONL files in full for every search | Simple to implement, but repeatedly parses even old conversation sources on every input. Indexing on save and checking for file changes reduce repeated costs. |
| Filter only titles in the recent list | Requires little additional storage but misses body content, external CLI conversations, and conversations outside the most recent 50. Not used to establish search coverage. |
| Local FTS, normalization, and synonyms | Reuses existing SQLite to find body content and IDs without separate provider configuration. May miss semantic relationships outside the synonym dictionary. |

## Impact

The first search may take longer than subsequent searches because it prepares indexes for existing transcripts and CLI history. The index stores local copies of user questions and agent answers and does not replace the original transcripts. Thoughts, tool calls and results, system notices, and execution instructions attached to the source are excluded from search. The provider CLIs' existing OS account and history-sharing scope remain unchanged. If some sources cannot be read, retain successful results and report partial failures.

New conversation indexes are updated in the save path, while external CLI changes are checked during the next search. Semantic recall requiring embeddings will be reconsidered based on separate requirements and measurements. The [Session contract](../development/agent-sessions.md#history-search) owns the current protocol, index, and supported runtime standards; the [Feature documentation](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#history-search) owns the UI; and the [Work record](../work/agent-history-search.md) owns validation and whether changes are applied to production.
