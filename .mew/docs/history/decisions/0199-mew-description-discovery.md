---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
title: "0199 — Description-based discovery of mew documents"
description: "Decision to switch mew document discovery to frontmatter descriptions and remove the requirement for manual MOC registration."
created: 2026-10-06
updated: 2026-10-06
---

- Status: Adopted
- Decision maker: User instruction
- Partially supersedes: [0132](0132-docs-project-owned-documentation.md) — MOC discovery and document registration requirements for the mew project
- Partially supersedes: [0155](0155-mew-project-agent-context.md) — Default MOC paths for automatic guidance and new document initialization

## Decision

All docs Markdown in mew has `description` frontmatter that distinguishes its subject and scope. AI reads paths and descriptions first, then selects only relevant current body content. For a new task with only a title, a default description based on the title is generated automatically; the description is also refined when the detailed body is written. The description is a discovery hint; the body is the canonical source for facts.

Remove the requirement to manually register each new document in an MOC. Preserve existing MOCs as representative pages in the UI and for compatibility with existing links, and retain actual link correction when files are moved in Documents. Do not change ownership, same-task write-back, central ADRs, or the immutability of archives. Exclude history from default searches.

[Measurements](../../research/desc-moc-benchmark.md) showed little difference in execution time; the reason for this choice is to eliminate duplicate work in adding documents and maintaining discovery lists. Do not automatically overwrite existing guidelines in other projects.

Detailed rules: [mew documentation rules](../../README.md).
