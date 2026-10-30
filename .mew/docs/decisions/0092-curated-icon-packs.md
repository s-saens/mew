---
title: "Curated local file icon packs in account themes"
description: "Chooses a built-in Material/Catppuccin/basic icon selector with account theme synchronization, pinned upstream assets, local license notices, and no runtime extension catalog or execution. Extends ADRs 0030, 0089, and 0091 while retaining their palette and generic-artwork behavior."
created: "2026-10-30"
updated: "2026-10-30"
status: accepted
---

## Context

[ADR 0089](0089-file-type-icons.md) and [ADR 0091](0091-unified-explorer-icons.md) made Material Icon Theme the only file and ordinary folder artwork. Users need to choose another style in Appearance settings. An extension registry provides distribution and search, but does not make every extension or icon reusable under a single license. File icons need static mappings and artwork, without extension execution.

## Decision

Provide a curated built-in list under Appearance → File icons: Material Icon Theme 5.40.0, Catppuccin Icons 1.26.0 (shown as Catppuccin), and Basic icons (`none`), which retains outline file and folder icons. Material remains the default for existing settings. Show compact radio rows with previews and the selected artwork pack's source and local license links; include supplemental Material source notices.

Extend the account theme contract from [ADR 0030](0030-account-themes.md) with optional `ThemeSettings.iconPack`: `material`, `catppuccin`, or `none`. Reuse its authenticated API, account ledger, migration, browser cache, and change notifications. An omitted value resolves to Material. Reject unsupported values in API writes; normalize unknown persisted values to Material without discarding palette or custom themes. Color theme changes preserve the independent icon pack choice.

Keep Material's pinned npm package and generator. Add Catppuccin from the official project's GitHub release archive, with its release URL, source commit, SHA-256, palette mapping, and generated-output hashes recorded in `src/utils/catppuccin-icon-source.json`. Verify the archive before extracting static mappings, SVG artwork, metadata, and the original license. Do not execute extension code. Catppuccin uses Latte for light themes and Mocha for dark themes. Render generic closed/open folder states; keep named-folder mapping data without applying it.

Bundle artwork and license texts locally. Preserve the packs' original MIT copyright and permission notices. Material's upstream README identifies Pictogrammers Material Design Icons and Google Material Symbols as sources; also distribute their source attribution, Pictogrammers license, and Apache 2.0 text. Source notices preserve license information and do not constitute general permission to use third-party brands or logos. Mew uses file icons to identify file types and tools, without claiming endorsement.

Retain synchronous generic files and folders and lazy-load each selected pack's larger artwork module. Preserve custom project and Map Of Contents icons. No runtime catalog, external icon lookup, URL installation, extension execution, or automatic pack update is included.

This extends the single-pack choice in ADRs 0089 and 0091. Their filename/extension precedence, local delivery, and consistent generic artwork remain; ADR 0030's account isolation and palette behavior remain.

## Alternatives and rationale

- Open VSX search and installation would require per-pack license review, additional package validation, and a broader supported format. The curated list gives a useful choice with a bounded source and notice review.
- Iconify provides icon collections but does not supply a uniform file association contract for this UI. Each collection would still need license review and mapping work.
- Arbitrary GitHub/npm package URLs would move license and compatibility decisions into normal user setup. Maintainer-reviewed pins make those decisions part of adding or updating a pack.
- A browser-only setting would diverge from existing account themes. Reusing account synchronization preserves the same selection across devices and avoids separate persistence.

## Consequences

The built-in list adds local artwork payloads and a generator with a pinned release archive. Users receive a small set of supported choices without downloading executable extensions. Adding another pack or updating one requires source and license review, retained notices, regenerated assets, and regression checks. Software license review does not remove separate trademark conditions.

The [appearance feature](../features/appearance-accounts-operations/appearance-language-fonts-and-shortcuts.md) owns settings and normalization; the [file navigation feature](../features/projects-files-search/file-folder-exploration-and-operations.md#file-type-icons) owns matching, loading, and regeneration. The [public guide](../../../docs/configuration/appearance.md#appearance-settings) explains user controls; the [work record](../work/icon-pack-settings.md) records local verification and application status.
