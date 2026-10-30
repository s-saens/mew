---
title: "Unified explorer file and folder artwork"
description: "Extends Material Icon Theme to ordinary folder rows and synchronous generic file and folder artwork, superseding ADR 0089's preservation of old folder icons."
created: "2026-10-30"
updated: "2026-10-30"
status: accepted
---

## Context

[ADR 0089](0089-file-type-icons.md) introduced Material Icon Theme for files while retaining the old outline folder icons. The resulting explorer mixed icon styles. Its loading fallback also used the old Page icon.

## Decision

Use the pinned pack's generic `file`, `folder`, and `folder-open` artwork for ordinary file and folder rows. Render these three SVGs synchronously from a small generated module and use its file icon while associated file artwork loads. Keep the larger association artwork lazy-loaded. Folder expansion selects the open or closed artwork; file and ordinary folder icons share a 16px square. Preserve custom project and Map Of Contents icons.

This supersedes only ADR 0089's preservation of ordinary folder icons. The [file navigation feature](../features/projects-files-search/file-folder-exploration-and-operations.md#file-type-icons) owns the implementation contract; the [work record](../work/file-type-icons.md#unified-generic-file-and-folder-icons) records verification and application status.

## Alternatives and rationale

Keeping the old folder and loading icons preserves the reported inconsistency. Loading the entire artwork set synchronously would fix the fallback but increase the initial module payload. A small synchronous module keeps default files, including extensionless `mew`, and both folder states consistent without waiting for the larger artwork module.

## Consequences

The generator maintains an additional three-icon JSON file. Ordinary folders now use the pack's filled silhouette, and their size matches file icons. No package, external icon service, or folder-name association system is added.
