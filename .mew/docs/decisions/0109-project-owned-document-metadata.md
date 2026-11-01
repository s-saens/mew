---
title: "Project-owned document metadata"
description: "Stores Documents comments, table widths, and shared frontmatter options in the active project's .mew directory, using project-relative file identity and preserving legacy data through lazy migration."
created: "2026-11-01"
updated: "2026-11-01"
---

## Status

Accepted.

## Context

The `docs` API scope resolves file operations to the configured Documents folder. Reusing that file root for metadata created `.mew/docs/.mew/comments.json` in this repository and could create equivalent nested folders for table widths and frontmatter options. Opening the same document through Files could also use different metadata.

## Decision

Resolve these three metadata files to the actual project's `.mew`. Documents shares storage with the active root's Files view. Prefix Documents comment and table-layout keys with the configured Documents path so both views identify the same physical file. Share frontmatter option lists and colors within that project. Named child projects retain their own storage.

Migrate each known legacy file on Documents access. Merge comments by thread/reply IDs and union shared options; canonical values win matching comment IDs, width keys, and colors. Publish the merged file atomically before removing the source. Remove the legacy directory only when empty, preserve unrelated files, and fail without deleting originals when migration cannot safely complete. The [current contract](../development/architecture.md#project-owned-document-metadata) owns exact paths and failure boundaries.

## Alternatives and rationale

- Hiding the nested folder leaves the incorrect ownership and split file identity intact.
- Deleting the folder discards existing collaboration data and allows it to be recreated.
- Keeping separate Documents registries under a renamed directory avoids nesting but preserves duplicate state for the same file.
- Project-root storage follows the existing Files storage format and keeps metadata next to project settings.

## Consequences

Documents remains a content location and no longer receives generated `.mew` directories from these features. Migration writes project metadata on first access and can fail on read-only paths. Files opened through Documents and Files now share comments, widths, and field options. This change does not merge collaboration rooms or other API scope identifiers. Running server code requires user application; the [work record](../work/project-owned-document-metadata.md) distinguishes local checks from that operation.
