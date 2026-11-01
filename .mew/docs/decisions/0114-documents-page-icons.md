---
title: "Restore Documents page icons"
description: "Restores the previous outline document SVG for Documents pages and search results while preserving selected file-type artwork for Markdown files in Files and the shared server browser."
created: "2026-11-02"
updated: "2026-11-02"
---

## Status and context

Accepted. Narrows [ADR 0089](0089-file-type-icons.md) for Documents page rows only. The user requested the previous basic document icon in Documents while keeping Markdown file icons in Files.

## Decision and rationale

Restore the exact previous 14px muted outline document SVG for leaf and parent Documents pages, including search results. Its artwork is independent of the selected file icon pack. Keep filename-based icons for Files and the shared server browser.

Keeping Markdown artwork in both views would ignore the requested distinction. Replacing the global Markdown mapping would also change Files. Applying the change only in the Documents page renderer preserves that boundary.

## Consequences

Documents pages retain a consistent document symbol across Material, Catppuccin, and Basic icon settings. File associations, icon-pack settings, Documents chevrons, and Map Of Contents icons retain their existing contracts. The [feature contract](../features/projects-files-search/file-folder-exploration-and-operations.md#file-type-icons) owns current behavior; the [work record](../work/file-type-icons.md#documents-page-icons-restored-2026-11-02) records local verification and application limits.
