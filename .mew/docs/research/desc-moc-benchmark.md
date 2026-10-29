---
title: "Comparing document discovery costs of desc catalogs and MOCs"
created: "2026-10-06"
updated: "2026-10-20"
description: "Records token, time, and quality results from comparing actual AI document discovery using desc catalogs and MOCs on 2026-10-06, including identical input conditions, questions, per-run metrics, reproduction methods, and limitations."
상위파일: "../MOC.md"
---

[Previous RAG, MOC, and general search experiment](document-discovery-benchmark.md)

## Final results

In actual AI discovery with 3 questions repeated twice, **the full desc catalog reduced cumulative input tokens by 7.1%, but time was nearly identical.** Document discovery worked, and key facts were found. There is insufficient evidence to claim that removing MOCs substantially speeds up discovery or dramatically reduces tokens.

Values are averages per question; input is cumulative across all model calls.

| Method | Completion time | Input tokens (including cached) | Cached input portion | Uncached input | Output tokens | Shell commands | Key facts satisfied |
| --- | --- | --- | --- | --- | --- | --- | --- |
| MOC | 36.5 seconds | 153,610 | 119,531 | 34,079 | 946 | 9.3 | 6/6 |
| Full desc catalog | 35.4 seconds | 142,666 | 111,147 | 31,520 | 965 | 6.7 | 6/6 |

- desc vs MOC: cumulative input **-7.1%**, uncached input **-7.5%**, average time **-2.8%**. The average time difference is 1.01 seconds.
- Median time is 36.3 seconds for MOC and 35.7 seconds for desc. The small sample and provider wait times prevent treating this difference as a consistent speed improvement.
- Expected-path retrieval was 17/18 for MOC and 18/18 for desc. For one MOC listing question, it selected a Hotview feature document stating the same requirement instead of the predetermined link feature document. Because the key facts were covered, the path mismatch was not classified as a factual omission.
- All 12 runs completed and passed line-range checks. There were no failed shell commands or whole-file searches. desc read the full catalog exactly once each time, and in two runs of the agent question, it queried parts of the catalog twice more each. All source copy SHA-256 hashes were also preserved.

### Averages by question

| Question | MOC time | desc time | MOC input | desc input | desc input change |
| --- | --- | --- | --- | --- | --- |
| List line numbers and links | 39.5 seconds | 35.7 seconds | 159,260 | 162,807 | +2.2% |
| PDF save conflicts | 34.7 seconds | 28.4 seconds | 120,614 | 83,726 | \-30.6% |
| /clear, queue, and reconnection | 35.2 seconds | 42.3 seconds | 180,956 | 181,466 | +0.3% |

For PDF, desc directly selected three documents, reducing tokens and time. The list question required less map navigation, but additional source reading prevented input savings; the agent question increased time and input through additional catalog queries and panel contract checks. Fewer discovery steps do not necessarily mean fewer cumulative tokens.

### Assessment

Placing `desc` in each document and automatically providing a **path + desc catalog** can work without MOCs. In this small document set, it showed quality and time similar to MOC, with slightly fewer input tokens. It is worth considering to eliminate map maintenance overhead, but the results do not justify a complete replacement based on performance alone.

To reproduce these conditions in actual use, a tool must extract and provide the description catalog in one batch rather than having the AI open each file's frontmatter individually. As the document count grows, supplying only descriptions relevant to the question or domain is another candidate, but its effect has not yet been measured. Maintaining document ownership, distinctions between current and historical content, and links to related documents must also be addressed separately.

## Comparison conditions

- The current 147 Markdown files were frozen in a `/tmp` copy. `history`, `archives`, hidden files, and the previous/current measurement reports were excluded. The source content is approximately 1.60 MB; this experiment does not change the actual project's document structure.
- 12 documents originally had a nonempty `desc`. For the remaining 135 documents, descriptions automatically extracted from titles, opening descriptions/bullets, and subheadings were added to the experiment catalog. Individual descriptions were not written based on the questions or answers. The effects of human-refined semantic summaries or AI-generated descriptions were not measured.
- The catalog contains only paths and `desc`, with 147 lines and 25,088 characters. The `o200k_base` estimate is 12,881 tokens. This includes descriptions of the 16 current MOC files. Excluding these rows gives an estimated 12,212 tokens; AI discovery was not remeasured using the catalog with these rows excluded.
- Model `gpt-6.1-sol`, reasoning `medium`, service tier `default`, `codex-cli 0.159.2`. 3 questions × 2 methods × 2 repetitions, totaling 12 runs. Fresh `--ephemeral`, read-only sessions were used with automatic injection of user settings and project instructions disabled. Web, code, central ADRs, and other agents were out of scope.
- MOC starts at `docs/MOC.md` and follows only map and body links. It does not search all files or read the `desc` catalog.
- desc first reads the full catalog at the exact path `docs/desc-catalog.tsv` once, then checks the necessary source content and body links. It does not use MOC content or search the body text of all files. Summaries do not substitute for factual evidence.
- Both methods used the same fixed tool output limit of 24,000 tokens. This allows the 12,881-token catalog to be delivered in a single read. The order of methods was alternated by question and reversed in the second repetition. Calls ran sequentially.
- Time runs from CLI startup through the final answer, usage return, and exit. It includes model waiting, generation, and tool execution, but excludes experiment design, description generation, and review time. Local preparation of descriptions/catalog took approximately 0.073 seconds, with no separate AI summary generation calls. Python startup, token estimation, and compressed bundle creation are excluded from this preparation interval.
- Tokens are the measured cumulative values from each session's `turn.completed.usage`. Input including cached tokens, cached input, uncached input calculated by subtraction, and output tokens are reported separately. These differ from a simple token count of the catalog source text. Reasoning tokens were recorded in a separate reporting field and were not arbitrarily added to input or output. The measurement interface used [Codex non-interactive JSON events](https://learn.chatgpt.com/docs/non-interactive-mode). Actual charges or subscription usage were not calculated.

## Questions and evaluation

Questions and expected documents were fixed before execution. Each answer was required to include at most 5 documents with source line ranges and 3\~5 key facts.

| Question | Key facts to verify | Expected documents |
| --- | --- | --- |
| List line numbers and internal links | 24px nesting adjustment, link line height and wrapping, preservation when saving Markdown | Link features, shared package contract, editing guide |
| PDF save conflicts | Draft preservation on conflict, version conditions and temporary file replacement, restrictions on encrypted/digitally signed/certified files | PDF features, PDF development contract, editing guide |
| /clear, queue, and reconnection | FIFO session boundaries, waiting for Codex termination and preservation on failure, queue restoration | Conversation features, agent session contract, terminal and agent guide |

Path retrieval and line ranges are checked automatically; key facts in answers and command history are reviewed separately. Exact matches to expected paths and factual completeness are treated as separate metrics. This is not quality approval by an independent evaluator or user.

## Individual runs

| Repetition | Question | Method | Time (seconds) | Input | Cached input | Uncached input | Output | Command count | Expected paths |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 1 | List line numbers and links | moc | 39.88 | 160,236 | 131,072 | 29,164 | 1,043 | 10 | 3/3 |
| 1 | List line numbers and links | desc | 35.50 | 142,806 | 110,848 | 31,958 | 1,024 | 7 | 3/3 |
| 1 | PDF save conflicts | desc | 31.56 | 98,018 | 76,800 | 21,218 | 767 | 5 | 3/3 |
| 1 | PDF save conflicts | moc | 35.61 | 118,724 | 93,824 | 24,900 | 918 | 8 | 3/3 |
| 1 | /clear, queue, and reconnection | moc | 33.36 | 178,861 | 141,312 | 37,549 | 843 | 9 | 3/3 |
| 1 | /clear, queue, and reconnection | desc | 47.70 | 218,351 | 174,336 | 44,015 | 1,360 | 10 | 3/3 |
| 2 | List line numbers and links | desc | 35.86 | 182,808 | 150,144 | 32,664 | 1,061 | 7 | 3/3 |
| 2 | List line numbers and links | moc | 39.11 | 158,285 | 109,312 | 48,973 | 887 | 9 | 2/3 |
| 2 | PDF save conflicts | moc | 33.80 | 122,504 | 97,792 | 24,712 | 918 | 10 | 3/3 |
| 2 | PDF save conflicts | desc | 25.18 | 69,434 | 46,976 | 22,458 | 619 | 4 | 3/3 |
| 2 | /clear, queue, and reconnection | desc | 36.87 | 144,581 | 107,776 | 36,805 | 958 | 7 | 3/3 |
| 2 | /clear, queue, and reconnection | moc | 36.96 | 183,050 | 143,872 | 39,178 | 1,070 | 10 | 3/3 |

## Scope of interpretation

- This test reads the **full desc catalog**. Per-question keyword/semantic search, domain-specific catalogs, and supplying only relevant documents were not measured.
- Results depend on the quality of automatically extracted descriptions. The additional cost and benefit of short, accurate descriptions written by document owners, and the cost of maintaining descriptions, were not measured.
- The questions explicitly include feature names and observed behavior. Results cannot be generalized to ambiguous questions, questions without answers, historical records, or large document sets. Each question was repeated only 2 times, so no statistical significance is claimed.
- Provider prompt caches may be shared even across fresh sessions. Caches were not fully controlled, and no separate uncached runs were performed. Time also includes provider waiting and host load.
- Both methods use the same file paths and existing body links. Performance in an unstructured repository with all existing links removed was not verified.
- The previous experiment on 2026-09-28 used a different model, document count, content, and point in time, so its absolute values are not directly compared with these results.

## Reproduction and raw data

```bash
python3 server/document-discovery-benchmark.py \
  --output .data/benchmarks/<새 실행명> \
  --model gpt-6.1-sol --effort medium --repeats 2
```

Python `PyYAML` is required; `tiktoken` is used only to estimate catalog size. This command runs 12 actual model sessions. Use `--prepare-only` to create only the copy and description catalog, then continue with the same output folder using `--resume`. It does not build the app or start/restart a server.

Final raw data is stored in `.data/benchmarks/desc-moc-20261006-final/`, which is excluded from Git. It includes metadata, the description catalog, the source SHA-256 list, snapshot bundle, execution scripts, prompts, JSONL, answers, individual results, and aggregates. The scripts used at execution time and frozen source content are stored together, so conditions can be checked even if the current working tree changes.

The 12 preliminary runs are preserved separately in `.data/benchmarks/desc-moc-20261006/`. In the preliminary prompt, the common instruction to read only the document folder conflicted with the description catalog path at the root, causing all 6 desc runs to query the wrong path initially. The catalog was also read multiple times under the default tool output limit. Results under these conditions were not included in the final comparison. All 12 runs were remeasured with explicit paths and identical output limits for both methods, while retaining the same 147 source documents and description catalog.

The final 12 runs totaled 431.4 seconds and 1,777,658 input tokens. Including preliminary runs, there were 24 actual model sessions, totaling 929.3 seconds and 4,235,793 input tokens. Conversation costs for design, preparation, and scoring were excluded.

Frozen source SHA-256 list hash: `e66b881e8be7329067aab8fa21aae9933aefd9a4b459b5176eaec97069036797`.
