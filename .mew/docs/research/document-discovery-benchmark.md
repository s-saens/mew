---
title: "Comparing document discovery costs of RAG, MOC, and general file search"
created: 2026-09-28
updated: 2026-09-28
description: "Preserves the 2026-09-28 comparison of actual AI discovery time, tokens, and accuracy for RAG, MOC, and general file search. The removed RAG cannot be rerun in the current app."
상위파일: "../MOC.md"
---

[Execution procedure at the time](../history/rag-operations.md#comparing-document-discovery-methods)

> Subsequent decision: RAG was removed under [ADR 0176](../history/decisions/0176-mew-remove-local-rag.md). The measurement results remain preserved as recorded. The execution script was removed from the app and preserved at `.data/benchmarks/doc-discovery-20260928/benchmark-discovery.py` in this installation's raw results folder. The historical RAG measurements cannot be rerun unchanged in the current app.

## Conclusion

Across 9 total searches covering 122 mew documents and 3 questions on 2026-09-28, **regular file search found the same required evidence with the least time, input tokens, and API-equivalent cost.** RAG used slightly fewer input tokens and had a slightly lower equivalent cost than MOC, but took longer. This is an initial comparison on a small document set with relatively clear feature names and symptoms; it does not establish superiority across all search problems.

Time, tokens, and cost are averages per question; document retrieval counts are totals across the three questions. Input tokens include cached input and are cumulative across all model calls. They are not simply token counts of the source files.

| Method | Completion time | Input tokens | Cached input subset | Output tokens | API-equivalent cost | Required documents retrieved |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Regular file search | 38.2 seconds | 70,396 | 50,347 | 742 | $0.2879 | 9/9 |
| MOC | 40.7 seconds | 109,711 | 83,456 | 728 | $0.3824 | 9/9 |
| RAG | 50.0 seconds | 101,276 | 77,568 | 791 | $0.3542 | 9/9 |

- RAG vs regular search: time **+31.1%**, input tokens **+43.9%**, equivalent cost **+23.0%**.
- RAG vs MOC: time **+22.9%**, input tokens **-7.7%**, equivalent cost **-7.4%**.
- Converting the same token volumes to costs assuming no cache at all gives the same ranking: general search $0.7410, MOC $1.1335, and RAG $1.0523. These are not results from separate uncached runs.

## Comparison conditions

- Model: `gpt-6-astra`, reasoning `medium`, service tier `default` (standard). CLI `codex-cli 0.154.0`. Each run used a new `--ephemeral` session with automatic injection of user settings and project instructions disabled and the same shared prompt. No prior conversation or correct answers were passed in.
- Scope: **122 current Markdown files, 905,770 bytes** in the working tree at the time. `history`, `archives`, and hidden files were excluded. Central ADRs, code files, and the external web were out of scope for all three methods. This report was created after the experiment and is also excluded from reruns to prevent answer leakage.
- The same snapshot was fixed in `/tmp`. The model was not given the full file contents in advance, and all before-and-after SHA-256 checks matched. Provider prompt caching was recorded from the actual returned values.
- RAG first searched using the actual mew CLI and `Xenova/multilingual-e5-small:q8:mean-normalized`, then read the source texts and related links from the results. Regular full-text `rg` search and MOC navigation were prohibited. Answers were not based solely on search summaries.
- MOC started at `docs/MOC.md` and followed maps and document links. Full file listings, content searches, and RAG were prohibited. Searching within files already found was allowed.
- Regular search provided file access, `rg --files`, content search, and source reading. MOC contents and RAG use were excluded. All three methods required the same JSON answer with at most 5 documents and 3–5 facts.
- The execution order was RAG→MOC→regular for the first question, MOC→regular→RAG for the second, and regular→RAG→MOC for the third. Runs were sequential to avoid resource contention from parallel execution. There was 1 run per method per question, with no retries, failures, or timeouts.
- Time is actual elapsed time from CLI process startup through answer and usage return and process exit. It includes model waiting, generation, and tool execution. It excludes experiment preparation, design/grading costs in the current conversation, and app implementation/testing time.
- **Building an empty index and performing the first search using existing embedding weights took 71.4 seconds**. The RAG times in the table are measured after this preparation. Initial model download time and the monetary costs of CPU, memory, and disk were not measured. Allocating preparation across the 3 RAG runs in this experiment gives 73.8 seconds per question.

Session usage was read from `turn.completed.usage` in [Codex non-interactive JSON events](https://learn.chatgpt.com/docs/non-interactive-mode). Costs are **API-equivalent amounts, not actual subscription charges**, calculated using [GPT-6 Astra Standard rates verified on 2026-09-28](https://developers.openai.com/api/docs/models/gpt-6-astra). Rates per 1,000,000 tokens were $10 for uncached input, $1 for cached input, and $50 for output. Cache writes were 0 in all runs.

`환산 비용 = ((입력 - 캐시 입력) × 10 + 캐시 입력 × 1 + 출력 × 50) / 1,000,000`

Long-context rates are not applied by mistaking cumulative input for the context size of each request. Each request's input is smaller than the cumulative total, and even the cumulative input totals for all runs in this experiment are below the long-context pricing threshold.

## Questions and quality

| Question | Required documents to find | Fact-checking criteria |
| --- | --- | --- |
| List line numbers and internal links | [Link features](../features/document-code-media-editing/links-file-references-and-attachments.md), [Package contract](../development/packages.md), [Usage](../../../docs/guides/editor.md) | Nested gutters and 24px alignment, inline wrapping and height, Markdown preservation on save |
| PDF save conflicts | [PDF features](../features/document-code-media-editing/pdf-reading-annotation-and-saving.md), [PDF contract](../development/pdf-viewer.md), [Usage](../../../docs/guides/editor.md) | Conflicts and draft preservation, explicit version-checked saves, encryption, digital signature, and certification restrictions |
| /clear, queue, and reconnection | [Conversation features](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md), [Session contract](../development/agent-sessions.md), [Usage](../../../docs/guides/terminal-agents.md) | FIFO session boundaries, waiting for Codex to exit and preservation on failure, browser reconnection |

The expected document list was fixed before execution. Path retrieval was tallied automatically, while answers, cited line ranges, and command histories were reviewed separately. **All 9 answers met the requirements for 3 required documents and 3 key facts, and their cited paths and line ranges were valid.** There were no search-method violations or document modifications. Multiple cited ranges from the same document count as one document. This was not a quality assessment by an independent evaluator or through user approval.

## Individual runs

| Question | Method | Time (seconds) | Input | Cached input | Output | Shell commands | Tool output characters | Equivalent USD |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| List line numbers and internal links | RAG | 42.38 | 72,055 | 51,072 | 842 | 4 | 16,892 | 0.303002 |
| List line numbers and internal links | MOC | 39.42 | 125,682 | 90,880 | 759 | 9 | 34,185 | 0.476850 |
| List line numbers and internal links | Regular file search | 39.72 | 70,847 | 45,440 | 742 | 3 | 23,974 | 0.336610 |
| PDF save conflicts | MOC | 39.47 | 69,909 | 50,944 | 652 | 7 | 30,297 | 0.273194 |
| PDF save conflicts | Regular file search | 39.07 | 66,907 | 54,144 | 715 | 3 | 17,266 | 0.217524 |
| PDF save conflicts | RAG | 46.89 | 103,837 | 82,560 | 717 | 4 | 26,107 | 0.331180 |
| /clear, queue, and reconnection | Regular file search | 35.71 | 73,434 | 51,456 | 768 | 3 | 26,105 | 0.309636 |
| /clear, queue, and reconnection | RAG | 60.83 | 127,936 | 99,072 | 813 | 4 | 52,749 | 0.428362 |
| /clear, queue, and reconnection | MOC | 43.28 | 133,541 | 108,544 | 773 | 9 | 47,295 | 0.397164 |

Shell command counts are execution units reported by the CLI. A single command may read multiple files, so they are not file-read counts. Tool output characters are a supplementary metric and were not converted to tokens. The 9 sessions totaled 386.8 seconds and $3.0735 in API-equivalent cost. A short preliminary call to check connectivity and the experiment design conversation were excluded from these totals.

## Interpretation and limitations

- RAG performed one additional search each for the PDF and agent questions to find feature documents. Because it reads source texts after receiving search result summaries, it does not inherently always save tokens. It substantially reduced input compared with MOC for the list question, but the reverse was true for the PDF question.
- MOC read 4 maps first for all three questions. It reliably found links to owning documents, but additional round trips and reading large usage files increased cumulative input.
- Regular search completed all three questions in 3 shell executions: file listing→keyword search→reading required sections. It benefited from clear file and feature names and an existing meaningful folder structure. This did not test a disorganized repository without document maps.
- The questions contain clear features and terminology for the editor, PDF, and agents. Results may differ with ambiguous wording, problems described using different terminology, missing answers, or larger document sets.
- Each method covered only 3 distinct questions, with no repeated samples of the same question. No claims of significance or confidence intervals are made. Times include provider waiting and host load, and provider caching was not fully controlled.
- Real work can combine RAG, MOC, and keyword search. This experiment restricted search paths to isolate their effects. It does not demonstrate **what percentage faster all prior work became because of RAG**.
- Based on the current evidence, a reasonable hypothesis is to start with regular search for clear file/feature names and use semantic search when wording is ambiguous or search fails, rather than requiring RAG for every task. This mixed strategy itself was not measured in this experiment, and product defaults were not changed.

## Reproduction and raw data

- Command: `python3 server/rag/benchmark-discovery.py --output .data/benchmarks/<새 실행명>`.
- This run: `.data/benchmarks/doc-discovery-20260928/`. Preserved artifacts include `metadata.json`, `snapshot-manifest.json`, `snapshot.tar.gz`, prompts, JSONL, and answers for each condition, `results.json`, `summary.json`, and `quality-review.json`.
- Document snapshot bundle hash: `646ac608c68be9526dd2248d19eb4d406a99995919cc4c04ba6ebf267d57f54a`. The snapshot did not change during execution.
- Snapshots and raw execution logs are stored in Git-excluded `.data`. This document owns only the experiment conditions, aggregates, and limitations.
- The existing `server/rag/evaluate.ts` is a separate evaluation that checks whether expected paths appear in the top 5 results. Previous central document paths from the existing question set were not reused as correct answers for this comparison.
