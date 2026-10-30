---
title: "File-type icons from Material Icon Theme"
description: "Chooses Material Icon Theme 5.40.0 for generated file mappings, variants, and local SVGs. ADR 0091 replaces the old folder icons; ADR 0092 extends the fixed pack choice with account-selected packs and supplemental source notices."
created: "2026-10-30"
updated: "2026-10-30"
status: accepted
---

The ordinary-folder preservation clause below is superseded by [ADR 0091](0091-unified-explorer-icons.md). [ADR 0092](0092-curated-icon-packs.md) extends the fixed pack choice with account-selected Material/Catppuccin/basic icons and supplemental Material source notices. The original file association rules remain in effect.

## Context

File Explorer used a generic page icon for most files. Users need to distinguish source, configuration, media, and other files by their names and extensions, including in search results and the shared server browser. The requested icon pack should be open source and work without an external icon service.

## Decision

Pin `material-icon-theme` to 5.40.0 as a development dependency and use its MIT-licensed SVG artwork and upstream filename, extension, and light-theme mappings. Generate checked-in association and artwork JSON with `tools/generate-file-icons.mjs`. Keep the upstream license in `public/licenses/material-icon-theme.txt`.

Resolve filename associations against path suffixes from longest to shortest, including the basename, before trying compound extensions. Normalize case and Windows separators. Use a generic file icon when no association matches. Load artwork through the shared `FileTypeIcon` component's lazy `Artwork` module and render local SVG data URLs. Preserve existing folder, project, and Map Of Contents icons.

The [file navigation feature](../features/projects-files-search/file-folder-exploration-and-operations.md#file-type-icons) owns the current behavior and regeneration contract. The [work record](../work/file-type-icons.md) records verification and application status.

## Alternatives

- Maintain a small manual extension map with the current general-purpose icons. This adds mapping maintenance and provides less file-type coverage.
- Use [vscode-icons](https://github.com/vscode-icons/vscode-icons#license) and its JavaScript adapter. Its code is MIT, but artwork has CC BY-SA and separate branded-icon licenses.
- Adapt [Seti UI](https://github.com/jesseweed/seti-ui), which is MIT. Its font and mapping sources require more adaptation for the existing React explorer.

## Rationale and consequences

[Material Icon Theme's npm API](https://github.com/material-extensions/vscode-material-icon-theme/blob/main/src/module/README.md) supplies both SVG files and `generateManifest()`, so upstream associations can be retained without a hand-maintained subset. Its [MIT license](https://github.com/material-extensions/vscode-material-icon-theme/blob/main/LICENSE) permits redistribution with the copyright and permission notice.

The generated artwork JSON contains 636 original file-related SVG variants. Lazy loading keeps artwork outside the explorer's initial synchronous module graph, but the artwork still adds a downloadable chunk. The artwork JSON supports the isolated UI fixture without raw SVG imports and avoids importing the icon package or `chroma-js` at runtime. Package updates require regeneration and checks. Generic fallback covers unsupported types; it does not imply a unique icon for every possible extension. Icon delivery uses local app assets and requires no external CDN.
