---
title: "Review of AI commit token reduction"
created: 2026-10-04
updated: 2026-10-04
description: "Records input token measurements for full diffs, chunked summaries, and change lists for AI commits, along with a proposal for local indexing and selective reading. Links to follow-up research on compressing all changes and the current execution contract."
상위파일: "_work.md"
---

[Git features](../features/git-history/project-git-work-panel.md) · [Current execution contract](../development/agent-sessions.md#git-ai-commit-jobs)

Subsequent runs confirmed that limited excerpts and rechecks caused large-scale skipping. [Follow-up compression research](git-document-commit-compression.md), which reexamines representations of all changes across large volumes of documents, repetitive edits, and records of change intent, supplements this document's initial proposal. The measurements and implementation records from that time are preserved below.

The initial chunked summarization addressed input limits for large changes, but its total token savings are limited because the full diff is sent to the model first. The recommended approach is to index all changes locally, provide a small change list first, and then accept requests only for the diff sections needed for decisions. Retain all original content and file assignment validation. This document contains input size measurements and an implementation proposal. Follow-up changes on 2026-10-04 applied local indexing, selective reading, and a path allowing up to 3 planning calls. The execution document defines the current contract; embeddings, semantic AST analysis, and analysis caching have not yet been applied.

## Cost structure of the initial approach

In the initial implementation, `server/git-commit-analysis.ts` summarized all source chunks and then consolidated the intermediate summaries. `server/git-ai-commit-runner.ts` attaches the full commit skill to each call and creates a new ACP session. Thus, summary output, intermediate consolidation input, final planning input, and recheck input are added to the initial input cost of the full source text. New sessions control accumulated context, but runtime instructions may be included again with every call.

Input size, tokens actually processed, cached input, output and reasoning tokens, billed cost, and latency must be evaluated separately. A cheaper model or provider prompt cache may reduce costs, but does not automatically reduce the amount of original text read initially.

## Measured input size of the current changes

On 2026-10-04, measurements were taken with 156 candidate files for commit fixed in a temporary Git index. An untracked file named simply `0` was excluded from analysis. HEAD at the time was `44002d4b52b03f55b78e82f7b88c64a6a55fe63e`, and the working-tree tree was `d4ac35251fdba9abbafb1fab60ce3e0da00768f1`. This snapshot predates this review document and does not imply that later changes will produce the same numbers.

Token counts are reference values for comparison calculated locally using `tiktoken` with `o200k_base`. Usage, billing, and summary quality for the actual selected model were not measured. The source text was processed only locally, without paid model calls. The values below represent input data size excluding instructions, system prompts, and AI output.

| Input data | Reference token count | Reduction from full diff | Interpretation |
| --- | ---: | ---: | --- |
| Full diff with 3 lines of context | 205,769 | Baseline | All changes and surrounding context |
| Full diff with 0 lines of context | 159,985 | 22.3% | Preserves changed lines and reads surrounding context as needed |
| 0 lines of context, abbreviated duplicate headers, and change list | 158,628 | 22.9% | Little additional benefit from abbreviating headers |
| List of paths, added/deleted line counts, hunk counts, and section headings | 6,279 | 96.9% | List for initial exploration; insufficient evidence for commits |
| The list above plus 12 changed lines from the beginning and end of each file | 48,557 | 76.4% | Sampling for size comparison; semantic preservation and decision quality are unverified |

These results do not establish that automatic commits based only on the first and last 12 lines are acceptable. A single line may be very long, and important changes may be in the middle. An implementation should explicitly identify evidence for each changed section and unread portions, rather than truncate at arbitrary line counts.

This measurement uses the input path from before recovery for summaries exceeding the recommended length was added. Recovery that compresses only existing summaries 1 time when the actual limit is exceeded was added later. The measurements below predate the subsequent application of local indexing and selective reading and must not be treated as measurements of actual model cost or time for the new execution path.

The current splitting module produced 15 source chunks. Input passing each chunk as a JSON string totals 218,699 reference tokens, and the 1,387-token commit skill is repeated 15 times, adding 20,805 tokens. **The diff and repeated skill alone total 239,504 tokens**. Actual total usage may be higher due to summary output, consolidation, final planning, and runtime instructions. If provider caching applies, uncached processing volume and costs will differ separately.

Per-file token totals for the diff with 0 context lines are 74,774 for code/other, 44,377 for tests, 40,649 for documentation, and 185 for the lockfile. The main reduction targets in this change are code, tests, and documentation. The lockfile summary of packages, versions, and changed fields is 72 tokens, but the absolute savings are only 113 tokens. Do not generalize these results to other repositories dominated by large lockfiles.

### Measurement method

Fixed HEAD and the entire selected working tree and compared `git diff --no-renames --no-ext-diff --no-textconv --no-color --unified=N <HEAD> <tree> -- <literal paths>`. Untracked files were also included in the working-tree tree. The change list consisted of JSON rows containing path IDs, paths, `--numstat`, hunk counts, and nonempty section headings after `@@`. Section headings are strings provided by Git and are not considered AST-validated function names.

Header abbreviation replaced each file's `diff --git`, `index`, `---`, and `+++` lines with a file ID, retaining actual added/deleted lines and hunk/mode information. Sample input appended the first 6 and last 6 added/deleted lines of each file to the change list. The full string was passed to the reference tokenizer; per-file totals and tokenization of the full string may differ slightly due to boundaries.

Adding `-w` with 0 lines of context yielded 158,794 tokens, an additional reduction of about 0.7% compared with the diff with 0 lines of context. Globally ignoring whitespace is not recommended because it may lose meaning in whitespace within strings, Python indentation, Markdown structure, and similar content. Git context, hunk, and statistics options follow the [official git diff documentation](https://git-scm.com/docs/git-diff).

### Measurements of the subsequent local indexing path

In the follow-up implementation on 2026-10-04, local preparation took 577ms to turn the 151 candidate files at the time into 69 source chunks and generate an overview. The overview contained 43,929 characters and 13,262 tokens using `o200k_base`. Measurements used no paid model calls and excluded the skill, system instructions, additional source content, and model output. This snapshot differs from the earlier measurement of 156 files, so no direct savings percentage comparison is made. The default path requests a plan without per-chunk model summaries, accepts requests for up to 6 source chunks per round for up to 2 rounds, and limits planning calls to 1–3. This preparation time is not the total time to complete a commit.


## Recommended execution flow

1. **Build a complete change list locally.** Extract path IDs, statuses, before/after blobs, hunk IDs, change statistics, symbols/document headings, changed imports, and package information. Start with Git hunks and section headings, and add ASTs for supported languages while validating accuracy. Do not infer functionality from names alone.
2. **Send a small list and evidence within the budget first.** Propose candidate groups based on implementations, related tests, documents, and import relationships, without finalizing them automatically. Retain every file's path and whether it has changes. Flag new files, large functions, and files mixing different concerns for additional analysis.
3. **Accept requests only for the sections needed.** The proposed protocol is `{needDiff:[{fileId,hunkIds}]}`. Mew provides the corresponding hunks and necessary functions/surrounding context from fixed Git objects. Retain existing tool approval denial boundaries and do not grant arbitrary file reading or command execution permissions. Make request units smaller than the current rechecks of 48,000-character source chunks.
4. **State analysis status explicitly.** For each file, distinguish changes verified structurally, changes assessed from source text, and changes that remain uncertain. Always read the relevant source text for changes with significant meaning even when short, such as deletions, permissions, conditionals, error handling, and security boundaries. Do not claim to understand unread portions or approve commits based only on path names.
5. **Use summaries only for unresolved groups.** Supplement with existing chunked summarization when a file or related group needs to be read thoroughly. Do not always map/reduce the entire repository. If the budget is exceeded and evidence is insufficient, leave the item in `skipped` with a reason. Retain file assignment, HEAD/tree/stage validation, and commits of the complete original content.

This approach aligns with [Anthropic's just in time context design](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents), which retains lightweight identifiers first and loads only necessary material later. How much applying this design to commits would save remains an inference and requires experiments with actual decisions. If all changes are independent and complex, most of the source text may ultimately need to be read.

## Candidate techniques and implementation priorities

| Method | Benefits and limitations | Proposed priority |
| --- | --- | --- |
| Read surrounding context as needed | Reduces this input data by 22.3%. Requires additional reading for conditional/function context | First |
| Change list and hunk-level selective reading | Potential for substantial savings. Requires validation of coverage across all files and unanalyzed status | Core |
| Deduplicate source text and use file IDs | Removes repeated paths, common instructions, and duplication between staged/final diffs. Must preserve the meaning of all changes | Alongside |
| Cache analysis results by blob/hash | Skips summary calls entirely when retrying the same changes. No benefit for initial analysis | Next |
| Provider prompt caching | Reduces repeated prefix costs and latency. Context size stays the same | Supplement after confirming support |
| Embeddings and retrieval | Useful for finding candidate related changes. Cannot replace classifying every file and gathering evidence | When need is demonstrated |
| LLMLingua-family token removal | Can shorten input using a small local model. Requires validation that code semantics, operators, negations, and constants are preserved | Lower-priority experiment |
| Cheaper models and lower reasoning effort | May reduce costs and reasoning usage. Separate from input token reduction; requires accuracy validation | Evaluate separately |

The proposed cache key includes the account, repository, per-file before/after blobs, mode, skill hash, summary prompt version, and model. Summaries that also use related files' contents must include hashes of those dependency inputs. Using only the sequence number of fixed-character-length chunks as the key may invalidate all later chunks after an earlier edit. Define retention periods and deletion policies, and do not share results across accounts.

Another option to evaluate is separating a small summary-specific contract instead of injecting the entire common skill into every chunk. However, user-edited commit skills must not be ignored. Provide summary instructions explicitly from the canonical source or separate them in a user-selected way, and apply the full canonical source to final group and message decisions. Avoid simply truncating the skill and executing differently from the existing instructions.

Provider caching is effective when the fixed prefix is identical. Currently, the full skill is appended after the summary instructions, so placing the common skill before the variable instructions for summary/consolidation modes is also worth examining. The cache controls supported by the runtime behind ACP must be checked; passing input as JSON does not guarantee caching. The [official Claude caching contract](https://platform.claude.com/docs/en/build-with-claude/prompt-caching) requires identical prefixes and checking cache usage.

Embeddings narrow the candidates to search. Commits must assign every selected file without omission, so sending only the top few search results may omit independent changes. Exact symbols, paths, imports, and test names can first be linked using local relationships and word searches. Even with embeddings, the complete list and evidence validation remain necessary. [Anthropic Contextual Retrieval](https://www.anthropic.com/engineering/contextual-retrieval) also explains why retrieval combines semantic search with exact identifier search.

The [LLMLingua 2 paper](https://arxiv.org/abs/2403.12968) performs extractive compression through token classification with a small encoder and reports 2–5× compression on evaluation datasets. These results do not validate accuracy for Mew's mixed Korean/English Git diffs or commit groups. The [official implementation](https://github.com/microsoft/LLMLingua) is a candidate reference, but model installation, CPU/memory costs, and the impact of removed operators and constants must also be compared. For the current data, validating local Git context adjustment and selective reading first requires a smaller implementation scope.

## Comparison criteria before implementation

- Compare the current full summarization, full analysis with 0 lines of context, and change lists with selective reading using the same snapshot, runtime, model, and skill. Measure retry caching separately from initial analysis. Without model usage data, do not confuse local reference tokens with actual billing.
- Sum cumulative input, cached input, output, reasoning tokens, call count, and time for the entire task, rather than the context size of one successful request. An initial input reduction target of 50% relative to existing full summarization could be set, but this has not yet been achieved. Also report whether savings came from an increased `skipped` rate.
- Currently, `runOnce` returns only the stop reason, so a path for collecting per-task usage is needed. `Usage` in the installed ACP SDK is experimental and cannot be assumed to be provided by every provider. `used` in the public [ACP usage_update contract](https://agentclientprotocol.com/protocol/v1/schema#usageupdate) is current context usage, not cumulative processed tokens. Leave it as unknown when provider-reported values are unavailable.
- For quality, first preserve 0 missing/duplicate files, 0 files included outside the selection, detection of source text changes, and committing the full originals. Then compare misassignment of independent concerns, errors in separating implementation/tests/documentation, unsupported claims in messages, and the proportion of files that cannot be classified.
- Cases must include small conditional inversions, error paths, CSS/string whitespace, document list structure, renames, binaries, large new files, and multiple concerns within a single file. Distinguish automated validation from human judgments of group quality.

The research did not include quality/cost experiments with actual paid models or changes to production servers. The follow-up implementation first applied reduced surrounding context, local change lists, and batched selective reading. Provider usage data and evaluations must confirm whether token reduction improves actual completion time and decision quality. Because embeddings add preparation and inference time, measure them separately if their benefits are needed after replacing sequential summarization.
