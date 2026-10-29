---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: the mew README contains only an introduction and links to usage guides by language. Preserves the choices, rationale, and subsequent changes from that time; consult Mew's owning documents for the current contract. The repository guide routing is superseded by ADR 0088."
title: "0178 — The mew README contains only an introduction and links to usage guides by language"
created: 2026-09-29
updated: 2026-09-29
---

- Date: 2026-09-29
- Status: Adopted
- Partially supersedes: [0132](0132-docs-project-owned-documentation.md) — the scope of the mew root README body and the entry path to the documentation map
- Decision makers: user (requested an English introduction and usage guide links in four languages) + agent (documentation separation)

## Background

The mew root README contained installation instructions, feature-specific usage guides, and development rules together. The user requested that the initial page contain only a short English introduction and links to Korean, English, Chinese, and Japanese usage guides.

## Decision

- The mew root README contains an English introduction and links to usage guides in four languages.
- Place installation, usage, and update instructions in `mew/docs/guides/getting-started-{ko,en,zh,ja}.md`. Use Simplified Chinese. The four documents are language versions of the same usage guide; update them together when procedures change.
- Move development commands, agent execution restrictions, and mandatory UI rules to `mew/docs/development/getting-started.md`. Link directly to this document from the project's AGENTS.
- Each language version links to the project documentation map and development documents. Documentation checks also accept a path from the README to the MOC through one intermediate guide within the same project's docs.
- Follow 0132 for project documentation ownership, the central ADR location, the current/history distinction, and write-back rules.

## Rationale

First-time visitors can choose a language and then read installation and usage instructions. Make development rules directly accessible from the agent entry point without duplicating them in every translation.

## Repository language policy (2026-10-29)

[ADR 0088](../../decisions/0088-english-project-documentation.md) supersedes this repository's language-specific installation routing. The original decision remains historical evidence; Mew's product language capabilities retain their existing behavior.
