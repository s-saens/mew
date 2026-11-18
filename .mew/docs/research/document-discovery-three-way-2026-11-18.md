---
title: "Mew document discovery benchmark on 590 documents"
description: "Compares scoped description search, hierarchical MOCs, and folder and body search across 20 Korean questions and 60 first attempts. Records measured tokens, elapsed time, cited evidence scores, protocol limits, and reproduction inputs."
created: "2026-11-18"
---

# Mew document discovery benchmark on 590 documents

The description catalog used the fewest input tokens and gave the most fully supported answers in this run. Folder search was close enough to use without maintaining metadata. It fully answered 18 of 20 questions compared with 19 for descriptions, and averaged 27.0 seconds compared with 24.8. The benchmark covers retrieval and answering. Description maintenance and hybrid search remain open questions.

## Results

Token means use trials that returned usage. The attempt mean includes the MOC timeout. Times are per question. A full answer covers both requested evidence groups with citations.

| Method | Token records | Mean input | Mean uncached input | Mean output | Mean time with tokens | Median time with tokens | Mean time across attempts | Full answers | Evidence points |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Description catalog | 20/20 | 77,787 | 22,824 | 490 | 24.8 s | 23.7 s | 24.8 s | 19/20 | 39.5/40 |
| MOC | 19/20 | 128,348 | 24,500 | 603 | 35.6 s | 32.3 s | 42.8 s | 18/20 | 36/40 |
| Folder search | 20/20 | 95,876 | 25,271 | 596 | 27.0 s | 27.1 s | 27.0 s | 18/20 | 39/40 |

- **Description catalog vs. folder search.** Descriptions used 18.9% fewer total input tokens and 9.7% fewer uncached input tokens, and took 2.3 seconds less on average. On the 16 questions all three methods answered fully, descriptions still used fewer input tokens on average (76,736 vs. 91,858 for folder search) and took 24.9 vs. 26.9 seconds.
- **MOC traversal.** It averaged 6.4 shell calls in measured runs, compared with 3.4 for descriptions and 3.8 for folders. One run (Q01) returned a generic response with no findings despite producing usage. Q03 timed out at 180 seconds with no usage or answer. It counts as zero evidence and is omitted from token means.
- **Timeout check.** We repeated Q03 as a new three-way concurrent block. The MOC run returned an answer and reported 76,400 input tokens (6,640 uncached), 330 output tokens, and 20.9 seconds. The two other repeat runs also returned usage. The main table keeps the original outcomes. The 60 first attempts took 14 minutes 40 seconds as a batch, and the repeat block took 22.3 seconds.

### By question type

Each cell shows fully supported answers, mean input tokens, and mean elapsed time for runs with usage.

| Question type | Description catalog | MOC | Folder search |
| --- | ---: | ---: | ---: |
| Named feature | 8/8 full · 63,576 · 22.9 s | 6/8 full · 116,177 · 36.1 s | 8/8 full · 76,012 · 22.8 s |
| Symptom or goal | 7/8 full · 71,069 · 23.3 s | 8/8 full · 129,194 · 33.2 s | 7/8 full · 91,702 · 27.6 s |
| Cross-area | 4/4 full · 119,644 · 31.5 s | 4/4 full · 147,956 · 39.5 s | 3/4 full · 143,952 · 34.5 s |

Q15 tested the difference between selecting the Reply action and displaying the reply preview. The MOC answer cited the guide's statement that Reply selection is unavailable in specific modes. The description and folder answers cited the narrower rule about when the reply preview is hidden. Q20's folder answer left terminal continuity on project switch unresolved. These differences account for the partial scores.

## Experimental setup

The corpus came from commit `161244c9c153005eca72908eb57b8abc5418f679`. Each of the three copies contains the same 590 source documents. The set includes 554 files under `.mew/docs`, 35 under `docs`, and the root README. The source set contains 4,998,547 bytes before masking. The snapshot excludes 199 historical or archived documents, 28 existing maps or representative pages, and 3 earlier retrieval experiments. It contains no working-tree edits, tasks, notes, or source code. The preparation script verified identical source paths, document bodies, and line counts.

| Search method | Material available for finding documents |
| --- | --- |
| Description catalog | A generated TSV with 589 existing path and `description` pairs. The agent may filter or read parts of the TSV, then open the selected documents and follow their links. The root README has no description. |
| MOC | A root map and 24 directory maps link all 590 files. The maps list immediate child directories and files. The labels come from existing titles, first headings, or filenames. The agent navigates maps and links in selected documents. |
| Folder search | The same directory tree with filenames, headings, and body text. The agent can list paths, search Markdown with `rg`, and follow source links. |

The MOC and folder copies blank the `description` lines to keep citation line numbers stable. The 25 maps are generated for full coverage because several original entry maps are absent. This measures a complete directory-based MOC with titles. Hand-curated topic maps may give different results.

Each question used three fresh, read-only Codex CLI 0.169.0 sessions with `gpt-6.1-sol`, low reasoning, and the default service tier. Web search, local user configuration, and automatic project instructions were disabled. The question, answer schema, and tool output limit of 12,000 tokens were identical across methods. The question blocks ran in order, with three concurrent sessions per block and rotating submission order. Results reflect concurrent provider load. The prompt restricted filesystem reads and navigation. The read-only sandbox guards writes, and reviewing command traces provides a separate check of read scope and method.

Elapsed time runs from CLI launch through process exit, including model requests and tool execution. Snapshot preparation, queue time between question blocks, and scoring are outside per-run time. Input and output tokens come from `turn.completed.usage`. Input includes the agent instructions, navigation traffic, evidence passages, and cached input reported by the provider. Uncached input is total input minus cached input. The CSV keeps the reported output total and reasoning breakdown. Ephemeral sessions can share provider prompt caches, so both total and uncached input are shown.

The 20 Korean questions were frozen with two evidence groups each before the runs. Eight name a feature, eight start from symptoms or goals, and four cross document areas. Blind graders saw the answers and cited excerpts under shuffled labels. Each group was worth 1 point for complete supported coverage, 0.5 for partial coverage, and 0 for absent, incorrect, or unsupported coverage. Equivalent current citations counted. An answer earned full credit at 2/2. The grading was performed by AI reviewers, with one reviewer assigned to each question.

The snapshot hashes and file sets matched after the trials. We scanned the command traces for broad searches in restricted methods, access to alternate copies, and unexpected navigation aids. The scan found none. A separate check found no observed MOC file open outside the links made reachable by preceding reads, treating links anywhere in those files as reachable. The checks cover observed commands and cannot reconstruct why the model chose a candidate.

## Per-question results

Each cell shows total input / uncached input / output tokens, elapsed time, and evidence points. The question labels are English summaries of the original Korean prompts.

| Question | Description catalog | MOC | Folder search |
| --- | ---: | ---: | ---: |
| Q01 PDF save conflict, draft, and copy | 62,129 / 18,737 / 430 · 21.2 s · 2/2 | 97,377 / 19,041 / 337 · 54.9 s · 0/2 | 92,195 / 22,819 / 551 · 23.8 s · 2/2 |
| Q02 External or managed PostgreSQL | 75,862 / 22,486 / 406 · 33.3 s · 2/2 | 145,981 / 24,893 / 588 · 36.8 s · 2/2 | 46,703 / 32,751 / 331 · 16.5 s · 2/2 |
| Q03 Database page title and type changes | 55,473 / 22,577 / 290 · 17.2 s · 2/2 | — / — / — · 180.0 s · 0/2 | 67,573 / 19,573 / 421 · 20.5 s · 2/2 |
| Q04 Skill priority, disabling, and removal | 45,507 / 31,555 / 479 · 19.5 s · 2/2 | 107,774 / 24,318 / 518 · 33.4 s · 2/2 | 113,950 / 30,494 / 579 · 28.3 s · 2/2 |
| Q05 Filename wildcard and RE2 syntax | 53,325 / 20,173 / 372 · 21.9 s · 2/2 | 129,647 / 25,071 / 513 · 28.2 s · 2/2 | 47,711 / 19,039 / 428 · 17.9 s · 2/2 |
| Q06 Mewlink recovery and session identity | 78,985 / 24,841 / 602 · 24.1 s · 2/2 | 162,637 / 17,997 / 865 · 47.4 s · 2/2 | 85,241 / 26,617 / 586 · 25.5 s · 2/2 |
| Q07 Workspace indexing directives | 47,649 / 22,945 / 387 · 20.0 s · 2/2 | 95,523 / 18,083 / 505 · 30.2 s · 2/2 | 74,194 / 21,202 / 489 · 21.9 s · 2/2 |
| Q08 Build, deploy, and lifecycle authorization | 89,680 / 25,168 / 570 · 26.1 s · 2/2 | 74,301 / 40,637 / 487 · 21.7 s · 2/2 | 80,529 / 24,977 / 620 · 28.0 s · 2/2 |
| Q09 Cached document preview and lost access | 77,745 / 23,601 / 528 · 23.2 s · 2/2 | 126,451 / 20,211 / 618 · 30.5 s · 2/2 | 101,056 / 26,944 / 557 · 28.4 s · 2/2 |
| Q10 Project shortcut, registration, and deletion | 83,224 / 26,008 / 373 · 29.4 s · 2/2 | 105,819 / 23,771 / 446 · 27.9 s · 2/2 | 75,264 / 23,424 / 620 · 25.2 s · 2/2 |
| Q11 First-owner setup link expiry and rotation | 51,802 / 4,698 / 349 · 19.0 s · 2/2 | 98,486 / 35,894 / 470 · 26.5 s · 2/2 | 105,274 / 27,322 / 547 · 42.0 s · 2/2 |
| Q12 Password reset and external login | 63,725 / 18,157 / 364 · 20.4 s · 2/2 | 123,132 / 19,708 / 493 · 28.9 s · 2/2 | 44,792 / 30,584 / 290 · 14.8 s · 2/2 |
| Q13 Shared and private memo persistence | 56,147 / 13,523 / 364 · 19.2 s · 2/2 | 96,937 / 9,001 / 513 · 27.9 s · 2/2 | 81,690 / 15,514 / 506 · 22.6 s · 2/2 |
| Q14 Retired tasks panel and existing task files | 51,078 / 21,126 / 443 · 21.5 s · 2/2 | 128,197 / 36,549 / 592 · 32.3 s · 2/2 | 135,926 / 27,510 / 639 · 31.6 s · 2/2 |
| Q15 Mobile reply navigation and availability | 75,061 / 38,453 / 651 · 25.9 s · 1.5/2 | 260,499 / 29,331 / 1,008 · 56.3 s · 2/2 | 106,088 / 19,048 / 756 · 29.3 s · 1.5/2 |
| Q16 APK discovery and older build results | 109,767 / 27,335 / 610 · 28.0 s · 2/2 | 94,034 / 10,962 / 664 · 35.5 s · 2/2 | 83,524 / 25,796 / 710 · 26.7 s · 2/2 |
| Q17 Multi-project mode and database row pages | 101,446 / 14,278 / 541 · 25.4 s · 2/2 | 158,078 / 27,902 / 706 · 33.9 s · 2/2 | 125,998 / 19,374 / 790 · 32.5 s · 2/2 |
| Q18 Browser cookies and Git authorization | 111,489 / 18,945 / 577 · 30.2 s · 2/2 | 106,688 / 10,944 / 568 · 31.2 s · 2/2 | 104,684 / 11,116 / 735 · 27.5 s · 2/2 |
| Q19 PDF drafts and stale Markdown saves | 130,351 / 30,895 / 828 · 36.5 s · 2/2 | 188,575 / 36,639 / 898 · 56.6 s · 2/2 | 163,188 / 32,244 / 929 · 41.4 s · 2/2 |
| Q20 Panel close and conversation path binding | 135,291 / 30,971 / 629 · 33.6 s · 2/2 | 138,484 / 34,548 / 674 · 36.3 s · 2/2 | 181,939 / 49,075 / 842 · 36.6 s · 1.5/2 |

## What this supports

Folder and body search are a viable baseline when authors can give files and headings informative names. The description catalog delivered a modest extra retrieval benefit on this corpus, especially in input volume. That favors retaining existing descriptions during an optional-description trial and measuring the maintenance cost before requiring new ones everywhere. The result does not establish that a folder-first fallback to descriptions or a different ranking method will have the same accuracy.

The sample includes one first attempt per method and question. There is one corpus, one model, and a question set authored with reference documents. Latencies include provider variability, and cache conditions were shared. User terminology, broader scope, historical sources, and handcrafted topic maps can change the results. Earlier experiments used different snapshots and models. [Description catalog vs. MOC](desc-moc-benchmark.md) · [Regular file search vs. MOC and RAG](document-discovery-benchmark.md)

## Reproduction data

The local ignored directory `.data/benchmarks/doc-discovery-20-2026-11-18/` contains `snapshots.tar.gz`, the preparation script and SHA-256 manifest, exact prompts and rubrics, per-run JSONL and answers, blind grades, `results.csv`, and the separate Q03 repeat. Extract the archive into a fresh `/tmp/mew-discovery-20/`. Copy `run.py`, `questions.json`, and `snapshot-manifest.json` into a fresh results directory and run that copy of `run.py` with Python 3 and an authenticated Codex CLI. The runner creates fresh sessions and writes the raw output beside the script.
