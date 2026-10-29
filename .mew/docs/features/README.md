---
title: "Mew feature document management"
created: "2026-09-18"
updated: "2026-10-29"
description: "Criteria for ownership, hierarchy, and shared-contract links in current feature specifications; separation of work and research records; and preservation of compatibility materials for legacy status fields and the removed feature panel."
---

AI selects the needed features from each document's `description` according to the [document rules](../README.md). The [feature home](_features.md) is retained for document navigation and compatibility with old links. Mew's Documents connection is `.mew/docs`.

The feature panel and its dedicated API, CLI, and execution queue were removed according to the [removal decision](../decisions/0065-remove-feature-panel.md). Feature specification Markdown continues to be read and edited in Documents.

## Files and hierarchy

- Each feature item is one Markdown file. Its title is the actual filename without `.md`. The `_` prefix of a parent representative file is not displayed. Frontmatter `title` and `parent` are not the canonical source for titles or hierarchy.
- An item without children is `이름.md`. When its first child is created or moved under it, move it to `이름/_이름.md` and place the children in the same folder. When the last child is deleted or moved, move the representative file back to `이름.md` and remove the empty folder. If attachments or hidden files remain, retain the folder as Documents does.
- Using create, rename, move, and delete operations in Documents also adjusts body content and links. Renaming a parent changes both the folder name and the representative filename. If you move files directly with general file tools, check the links yourself.
- Existing `MOC.md` and `_MOC.md` are supported as folder representatives for compatibility. If `_폴더이름.md` exists, distinguish the representative file from a separate MOC. Retain root MOCs and READMEs as document navigation guides.
- Retain existing IDs for references to historical execution records. Read ordinary Markdown even without frontmatter or dedicated delimiters, and do not enforce heading or bullet formats in the body.

## Navigation and content ownership

- Navigate the document hierarchy through Documents and the actual files and folders. Check titles, body content, related files, commits, and validation in the original documents and document editor.
- One feature document owns that feature's requirements, scope, detailed behavior, implementation entry points, and acceptance criteria. Maintain feature-specific specifications in the same file without creating a separate Specs body. Place current detailed behavior and acceptance criteria after the overview. Store and link dated implementation/validation records in `../work/` and original comparison/research materials in `../research/`.
- Keep development contracts shared by multiple features, along with usage, configuration, and operations guidance, in their existing owning documents and link to them. Do not duplicate that content in feature files. When delegating a feature, also read the linked shared contracts.
- When code or features change, update the owning feature file; when shared contracts change, update their owning documents in the same task. New documents do not require MOC registration, and automatic generation or updating of MOC lists is not required. When moving documents, update actual incoming links. Do not reapprove status determinations or verification hashes solely because formatting was cleaned up.

## Status and execution

The initial catalog on 2026-09-18 registered 8 areas and 44 subfeatures. `created` is the registration date, not the actual initial implementation date. For features added or removed afterward, follow the current file list.

- `implemented` means the provided scope has been confirmed in documentation and code; it does not mean validation is complete in every environment. `verified` and `needs-fix` are user determinations.
- `status_hash` associates status with the current title, body requirements, and parent relationship. It is the hash the former feature API used to identify external content/path changes as `changed`; after the panel's removal, the app does not recalculate it or make determinations from it.
- `files` lists representative implementation entry points, not every changed file. Do not infer and record executions, commits, or validations that were not actually performed.
- Editing documents alone does not trigger agent execution or Git commits. [Feature-based development](terminals-agents-automation/feature-driven-development-and-markdown-documents.md) owns the historical records of the removed API, CLI, and execution queue.

## Items not included in the catalog

The old home's to-do list/calendar, AI commit message generation that was not implemented, and unrealized plans were not listed as current features. Android is limited to environment preparation and existing gateway connections. The initially registered RAG was removed on 2026-09-28 and moved to [historical feature records](../history/rag-feature.md). Installation, HTTPS, backups, licensing, research, and past plans remain in their existing owning documents.

## Specs consolidation — 2026-10-06

Previously, summaries for feature discovery/delegation were separate from detailed specifications in Specs, but switching between two documents to understand or modify one feature created substantial overhead. The bodies of 7 feature-specific Specs documents were consolidated into their corresponding feature files. Only relocation notices for existing ADRs and external links remain in `.mew/docs/specs/`; current AI discovery selects the relevant feature body from the description list. Existing IDs, saved statuses, verification hashes, and validation records are preserved, and document consolidation alone does not update user determinations. Items with changed body content or links may be read as `changed` under the existing hash rules and are not automatically reapproved.
