---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: code repository documentation allowlist and full absorption into docs. Preserves the choices, rationale, and subsequent changes at the time; consult Mew's owning documents for the current contract."
title: "0012 — Code repository documentation allowlist and full absorption into docs"
created: 2026-07-27
updated: 2026-09-11
---

- Date: 2026-07-27
- Status: Adopted
- Subsequent decision: [0131](0131-mew-repository-docs-hierarchy.md) — Exception for detailed Mew references; now absorbed into 0132
- Subsequent decision: [0132](0132-docs-project-owned-documentation.md) — Project docs permissions, ownership, and write-back; the allowlist outside docs remains in effect
- Decision makers: Song Sanghoon (request and judgment) + agent (research and execution)

## Background

ADR 0008 (`이전 Liiiiv 문서: decisions/0008-docs-agent-write-back-contract-and-repo-wiring.md`) established the write-back contract, but defined only "what goes into docs," not "what may remain in the repository." As a result, there was no way to determine whether leaving documents that met the triggers in the repository violated the rules, and such documents did remain.

Measured on 2026-07-27 — 34 `.md` files in workspace code repositories (excluding docs). Most already meet write-back triggers:

| File | Applicable trigger | Where it belongs |
| --- | --- | --- |
| `liiiiv-life/SEO.md` (137 lines) | 5 (recurring procedures and runbooks) | `ops/` |
| `typebot/GOOGLE-SHEETS-SETUP.md` | 4·5 (external service accounts) | `ops/` |
| `liiiiv-life/PLAN-HOMEPAGE.md` | 1 (unified account and role model) | `decisions/`·`platform/` |
| `alaaaarm/PLAN.md` (149 lines) | 3 (product scope and feature definitions) | `products/alaaaarm/` |
| `mew/SECURITY-REVIEW.md` | 5 | `ops/mew/` |
| `server/GPT-RESEARCH.md` (233 lines) | 3 (tag system and schema) | `products/sleeeep/research/` |

Drift was not hypothetical; it had already occurred. Three cases were observed:

1. The alaaaarm MethodChannel contract is duplicated 3 times, with conflicting versions. `NATIVE.md` has 8 channels (the canonical version), `README.md` has 5 channels (missing `sound` and `powerGuard`), and `PLAN.md` has 3 channels using `EventChannel` — yet line 144 of that same `PLAN.md` says "the EventChannel push design was abandoned and replaced with a pending queue." It diverged even within a single file.
2. `mew/SECURITY-REVIEW.md` (2026-07-21) flags code that no longer exists. §4 cites `callClaude` in `server/agent.ts` as a risk, but the agent panel was completely removed on 2026-07-25.
3. Repository documentation misrepresents the state of docs. When `alaaaarm/AGENTS.md` described the docs home as "not yet created," `products/alaaaarm/product.md` and `roadmap.md` already existed.

An additional driver is where agents start their work. If documentation exists in the repository, agents read it first and consult docs later, or never. If the repository contains only code and execution information, docs is the only place to obtain context, so the entry order is structurally enforced.

## Options

1. Keep the current approach — judge solely by the trigger list — Advantage: no changes. Disadvantage: the criterion is the subjective question "Does this document meet a trigger?", which receives a different answer each time. The 34 files above are the result.
2. Ban all repository documentation (0 files, including README) — Advantage: the rule is simple and cannot be violated. Disadvantage: `AGENTS.md` is a router configuration file that the harness automatically loads based on cwd, rather than documentation. Removing it eliminates the very mechanism that ensures "read docs first," directly defeating the purpose. Placing contracts that must change in the same commit as code, such as MethodChannel contracts, in docs would actually increase drift.
3. Allowlist by content type + full absorption of everything else — enumerate, by file, what may remain in the repository, and move all other `.md` files to docs.

## Decision

Option 3 adopted. This narrows ADR 0008 (`이전 Liiiiv 문서: decisions/0008-docs-agent-write-back-contract-and-repo-wiring.md`) without replacing it — the write-back triggers in 0008 remain valid, and this decision closes the reverse side: what is allowed to remain in the repository.

### Repository allowlist — only these four filenames are allowed

Do not place any `.md` files with names other than these four anywhere in the repository. Because the rule is based on filenames, it can be checked by linting.

| Allowed filename | Contents | Why it belongs in the repository |
| --- | --- | --- |
| `README.md` | One paragraph describing what it is · how to launch it (commands, prerequisites, ports) · code structure overview · execution-coupled contracts | Execution information. Becomes outdated along with the code |
| `AGENTS.md` + `CLAUDE.md` | Thin router — identity · docs home link · execution invariants true only in that repository | Automatically loaded by the harness based on cwd. Configuration, not documentation |
| `SECURITY.md` | Vulnerability reporting channel only (the conventional location recognized by GitHub). Public repositories only | Audit history and known limitations belong in docs |

Place execution-coupled contracts (mechanical contracts that must change in the same commit as code — MethodChannel tables and API signatures) in sections within `README.md` rather than creating separate files. Allowing separate files would keep opening holes in the allowlist through judgments such as "this is a contract." Non-`.md` artifacts such as `.env.example`, migrations, and generated schemas are not documentation and are outside the scope of this rule.

Move all other `.md` files to docs. If classification is unclear, decide using this single question:

> Should this information survive even if the entire repository is deleted and rewritten from scratch? — If so, docs; otherwise, the repository.

### Link network

Absorbing all context makes docs grow large. Context cost is determined by the number of documents that must actually be opened for a task, not the total document count, so a tree index (MOC) alone is insufficient; cross-links between documents are needed.

- MOCs retain their role as hierarchical indexes (CI enforces coverage). In addition, each document directly links related documents in its body so that arriving at one document provides a direct path to the next.
- Link syntax remains relative-path Markdown links ([README.md](../../README.md), "Naming · Links"). Both Foam and Obsidian build graphs and backlinks from Markdown links, so the goal is achieved without wikilinks. This ADR does not change the rule prohibiting wikilinks.
- Each product or scope document specifies its repository location (for example, "Code: `~/dev/liiiiv/alaaaarm`"). docs knows where the code is, and the repository's `AGENTS.md` knows the docs home — bidirectional.

### Enforcement

docs CI cannot see other repositories (a limitation confirmed in 0008). Detect allowlist violations with a workspace-level script, and place the execution procedure in ops/repo-doc-allowlist.md (`이전 Liiiiv 문서: ops/repo-doc-allowlist.md`).

## Rationale

- Why a filename allowlist rather than "0 documents": "0 documents in the repository" is easy to remember but also eliminates `AGENTS.md`. Conversely, content-type criteria ("allowed if it is a contract") introduce judgment and holes in the allowlist — every one of the 34 files above was something someone thought "must stay." Restricting by filename leaves no room for judgment and enables linting.
- Why execution-coupled contracts remain in the repository: drift is caused by "being in two places," rather than "being in the repository." Moving a channel contract to docs produces the same divergence if the agent changing the code does not also update docs. Keep things that change in the same commit in the same place.
- Why the classification question remains: an allowlist is an enumeration and cannot answer when a new kind of file appears. The question directly reflects the situation encountered when `server/` was replaced by `med-gen/`: "The repository is dead, but the research inside it must survive."
- On the context cost objection: docs growth is a real cost. However, the alternative (scattering information across repositories) does not reduce cost; it makes information impossible to find, creating the appearance of no cost. The actual solution is to reduce the number of documents that must be opened through scope subtrees ([README.md](../../README.md), "Structure") and cross-links.
- The premise that "AI does not read code" was not adopted. Agents read more code than humans do. The rationale for this decision is not "because they do not read code," but "docs only needs information that code cannot answer (why, what was abandoned, and where things connect), and duplicating information that code can answer in both docs and the repository causes divergence."

## Consequences (optional)

<!-- 시간이 지난 후 확인된 효과·부작용을 여기에 추가. 결정 본문은 수정하지 않는다. -->
