---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Markdown and frontmatter are the canonical source for feature documents. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0161 — Markdown and frontmatter are the canonical source for feature documents"
created: 2026-09-17
updated: 2026-09-17
---

- Date: 2026-09-17
- Status: Adopted
- Partially supersedes: [0159](0159-mew-feature-driven-development.md) — server JSON feature ledger and result storage; execution queues, supervision, and permissions remain
- Decision maker: User direction, Codex implementation
- Subsequent decision: [0196](0196-mew-file-backed-feature-tree.md) — filename-based titles, folder hierarchy, and reading ordinary Markdown; execution record ownership remains

## Decision

- Store a Markdown file for each feature in `features/` under the project's Documents. Frontmatter owns the ID, parent ID, title, persistent status, dates, related files/commits, and the content hash confirmed by the status; the body owns requirements, implementation descriptions, and verification. Filenames and hierarchy are independent.
- The GUI and shared CLI read and update the same files. Even in a fresh clone, restore the list, hierarchy, implementation results, and user judgments from the documents alone. Server JSON owns only execution queues, sessions, and per-request history, without creating a second canonical source for the documents.
- Blue is derived from an active execution and is not persisted in the document. Use a content hash of the requirements, title, and parent to determine whether to display orange after external edits. A checkout that changes only file timestamps does not revoke approval. Check for concurrent edits using the entire document content.
- Safely migrate existing JSON to documents after preserving a backup of the original. Do not overwrite another file with the same ID. Recover interrupted writes using the recorded transaction; if they conflict with external changes, preserve them and display an error.
- Reflect ordinary Markdown edits, renames, additions, and deletions on the next query. Report duplicate IDs, invalid frontmatter, missing parents, cycles, and paths escaping the allowed scope, along with file paths. File changes alone do not automatically run agents.
- Eliminate duplicate authoring of feature specs. Keep installation, operations, ADRs, and shared guidance in their existing owning documents. Do not automatically convert or delete all old docs.

Format, migration, recovery, and editing contracts are defined in [Feature-driven development](../../specs/feature-development.md).
