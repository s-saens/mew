---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record for Documents parent/child pages and representative files. Preserves the original storage and single-click navigation rationale; decision 0107 supersedes its click and Ctrl/Cmd+click opening behavior."
title: "0191 — Documents parent and child pages and representative files"
created: 2026-10-02
updated: 2026-11-01
---

The click and Ctrl/Cmd+click opening rules below are superseded by [decision 0107](../../decisions/0107-explorer-selection-and-opening.md). The original storage and representative-file decisions remain in effect.

- Date: 2026-10-02
- Status: Adopted
- Decision makers: User (requested a structure in which parent documents have child documents), Codex (implementation)

## Decision

- Display folders in Docs as parent documents. Clicking the name opens the representative file, and the arrow expands the children. Do not duplicate the representative file in the child list.
- Store documents without children as `name.md` and documents with children as `name/_name.md`. Promote a document when its first child is added and demote it back to a single file when its last child is removed. Renaming changes both the folder and the representative file.
- A normal click replaces the document in the current editor tab, while Ctrl/Cmd+click retains a separate tab. Do not discard unsaved content.
- Read existing MOC.md and _MOC.md files as folder representative documents. Do not bulk-migrate actual existing documents; switch to the new representative name when creating or renaming a child of the corresponding parent document. The Docs root entry point remains compatible with existing MOCs. Do not change archives.
- Structural conversions adjust paths, body content, and internal links together and preserve existing files on conflicts or permission errors. Retain Docs API and editor scopes and ordinary file navigation.

## Rationale

Reduce the burden of navigating documents as separate files and folders, and allow child documents to be grouped while retaining document content. Storage rules and current usage instructions reside in the [document pages contract](../../development/document-pages.md).
