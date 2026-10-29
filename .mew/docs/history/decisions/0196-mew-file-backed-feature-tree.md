---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: The feature panel is a file-backed document tree. Preserves the choices and rationale at the time and links to subsequent decision 0049, which displays branch-specific work and previews instead of documents."
title: "0196 — The feature panel is a file-backed document tree"
created: 2026-10-06
updated: 2026-10-06
---

- Status: Adopted
- Decision maker: User direction, Codex implementation
- Partially supersedes: [0161](0161-mew-feature-markdown-source.md) — Independence of filenames and hierarchy; required frontmatter and body section contracts
- Partially supersedes: [0194](0194-mew-readonly-feature-panel.md) — Display of body content, evidence, and history within the panel; the read-only boundary remains

- Subsequent decision: [0198](0198-mew-inline-feature-title.md) — Inline title editing for accounts with edit permissions; open documents only through icons
- Subsequent decision: [0049](../../decisions/0049-branch-feature-previews.md) — Convert the feature panel to a branch work list; preserve the Markdown document hierarchy and storage contracts

## Decision

- Each feature item is one Markdown file under `features/` in Documents. Its title is the filename with `.md` and the representative file's `_` prefix removed; frontmatter titles and parents do not determine the displayed hierarchy.
- The hierarchy follows the `이름.md` ↔ `이름/_이름.md` rule in [0191](0191-mew-documents-parent-and-child-pages.md). Creating or moving in the first child promotes it, and removing or moving out the last child returns it to a single file. Remaining attachments and hidden files are preserved as in Documents.
- Keep the panel's existing title bar, status display, sorting, refresh, and view state restoration. Rows provide only a title and an action to open the document; arrows only expand child items. Requirements, implementation, validation, files, commits, and work history are available in the original documents and existing agent and Git views. Do not reintroduce detailed section UI without an explicit request.
- Read ordinary Markdown without a separate ID or dedicated result delimiter. Maintain compatibility with existing ID, status, and result metadata and API and CLI execution queues; do not block the entire list because of body formatting. Document changes alone do not trigger execution.
- Structural changes preserve body content and links and do not overwrite conflicting documents. [Feature-based development](../../specs/feature-development.md) owns the current product, storage, and validation contracts.
