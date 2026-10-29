---
title: "mew built-in RAG operations"
created: 2026-08-21
updated: 2026-09-28
reviewed: 2026-08-21
review-after-days: 90
description: "Preserves the pre-removal RAG procedures for source and index storage locations, search boundaries, costs, recovery, embedding initialization, and document discovery comparisons."
---

> 2026-09-28: Removed RAG in accordance with [ADR 0176](decisions/0176-mew-remove-local-rag.md). The following is a record from that time, not current operating instructions. Do not retry reintroduction, reindexing, or model downloads without a user request.


mew semantic search operating reference. For implementation, environment variables, and API contracts, see [Search settings](../../../docs/configuration/search.md) and [Environment variables](../../../docs/configuration/environment.md); for the selection rationale, see [ADR 0071](decisions/0071-mew-embedded-lancedb-local-rag.md).

## SSoT and storage locations

- Source Markdown and code are the SSoT. LanceDB, manifests, and embedding models are all derived caches.
- Caches reside in `MEW_DATA_DIR/rag/` and therefore have the same lifecycle in native installations and Docker `/data` volumes.
- They are not backed up or tracked in Git. If corrupted or the model changes, discard the caches and regenerate them from the source.

## Search boundaries

- Only index text files exposed in the default tree of the currently selected project.
- Semantic search is available only to logged-in users. Guests use exact search only, even if they have approved paths.
- Filter query results again against the set of visible files at request time. Do not return old paths even if the index contains them.
- For docs, default to Current in the MOC, and search History/raw and retired/superseded ADRs only when explicitly included.

## Costs and recovery

- First search: download approximately 130 MB for the q8 model and embed all files. Afterward, update only changed files.
- There are no external DB, API key, or document transmission costs. Only CPU and local disk are used.
- Semantic search failures do not block exact/regex search or server startup.
- Check result quality regressions with an evaluation set that tests whether path and line citations include the correct documents. Assess this separately from generated answer accuracy.

## Shared settings and access

View settings and the current index through RAG in the dock. `DATA_DIR/rag-settings.json` contains user settings and is preserved, unlike derived caches. The CLI and server use the same workspace index lock, and locks from terminated processes are recovered on the next access. Search commands, permissions, and when changes take effect follow [Search settings](../../../docs/configuration/search.md).

## Server DOM and embedding initialization

If `self is not defined` appears only after collaborative editor initialization, check for missing browser-compatible globals. `server/collabAgent.ts` installs `self` from the same Window as `window`, and `server/rag/embeddings.ts` explicitly specifies Node CPU, file caching, and local model reads. Failed module imports can persist in the process, so the server must be restarted after applying the fix. Agents do not build or restart it themselves.

The regression check is `node --test server/rag/embeddings.test.ts`. It loads the library after actual collaborative DOM initialization. In an environment with a prepared cache, `MEW_RAG_TEST_MODEL_CACHE=<모델 캐시 절대 경로> node --test server/rag/embeddings.test.ts` also verifies actual embedding, indexing, search, and reindexing of temporary Docs without external downloads. It does not modify user documents or production indexes.

## Comparing document discovery methods

`python3 server/rag/benchmark-discovery.py --output .data/benchmarks/<새 실행명>` compares RAG, MOC, and general file search using a separate snapshot of the current documents. **It actually calls the model 9 times, consuming account usage.** Existing Codex CLI authentication and downloaded models in `.data/rag/models` are required. It does not build the app or restart the server.

- The defaults are GPT-6 Astra, medium, and standard; change them with `--model` and `--effort`. Each run is a new session with no conversation history, using the same question, output format, and document scope except for method-specific guidance.
- The general search condition provides file access and tools such as `rg`. It does not preload all documents into the model input. MOC map content and RAG use are excluded.
- Record initial index preparation time, total session elapsed time, input/cache/output tokens returned by the CLI, shell command count, and retrieval of expected document paths. Review answer explanation quality and adherence to the method separately using the source documents and execution records.
- Store snapshots, hashes, prompts, JSONL, answers, and results under the specified `.data`. Also record session temporary directories in metadata. Do not duplicate raw execution logs in documentation.
- This is an exploratory comparison with 1 run per model and question. Alternating execution order still does not fully control network conditions, host load, or provider caching. Distinguish token-based cost estimates from actual subscription charges.

Record the conditions, results, and limitations of the first run in [Document discovery comparison measurements](../research/document-discovery-benchmark.md). This is separate from the existing correct search path evaluation in `npm run rag:eval`.
