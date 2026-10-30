---
title: "Curated icon pack settings"
description: "Records the 2026-10-30 implementation of account-synchronized Material/Catppuccin/basic file icon choices, pinned GitHub asset generation, retained source licenses and notices, and verification and application boundaries."
created: "2026-10-30"
updated: "2026-10-30"
---

## Purpose and resulting behavior

Added a File icons selector to Appearance settings so users can choose Material Icon Theme, Catppuccin, or Basic icons (outline file and folder icons). Compact radio rows preview the artwork. The choice applies immediately, persists with the signed-in account theme, and follows the existing cross-device synchronization. Palette changes preserve the pack. Existing settings keep Material; unsupported API values are rejected, and unknown persisted values fall back to Material without losing palettes or custom themes.

The selected artwork pack exposes its source and local license links. Material remains pinned to npm 5.40.0. Catppuccin 1.26.0 is extracted from the official GitHub VSIX release only after its SHA-256 matches the checked-in pin; its source commit and output hashes are also recorded. The generator retains original SVG strings and associations for Latte and Mocha, uses a small default artwork module, and keeps extension code out of the app. Ordinary folders use generic open/closed states. All artwork is local, with larger modules loaded on demand; there is no catalog search, URL installation, extension execution, or automatic update.

The [appearance feature](../features/appearance-accounts-operations/appearance-language-fonts-and-shortcuts.md) owns settings behavior and the [file navigation feature](../features/projects-files-search/file-folder-exploration-and-operations.md#file-type-icons) owns rendering and regeneration. [ADR 0092](../decisions/0092-curated-icon-packs.md) records the distribution and account storage choices.

## Source and license review

- Retained the original MIT notices for Material Extensions and for Catppuccin/thang-nm in distributed `public/licenses/` files. Catppuccin's checked-in license matches the [pinned upstream license](https://github.com/catppuccin/vscode-icons/blob/b6915da9f6889b683a110aa747de96c2820a537d/LICENSE).
- The installed Material package and [upstream 5.40.0 README](https://github.com/material-extensions/vscode-material-icon-theme/tree/v5.40.0#icon-sources) identify Pictogrammers Material Design Icons and Google Material Symbols as artwork sources. The npm package includes the MIT license but no supplemental source license file.
- Added [Material source notices](../../../public/licenses/material-icon-theme-notices.txt), including attribution, the original [Pictogrammers source license](https://github.com/Templarian/MaterialDesign/blob/master/LICENSE), and full Apache 2.0 text. The [Pictogrammers license page](https://pictogrammers.com/docs/general/license/) and [Google source license](https://github.com/google/material-design-icons/blob/master/LICENSE) support retaining these notices. On 2026-10-30, neither source repository's root contained a separate NOTICE file.
- Pack licenses do not grant general third-party brand rights. Pictogrammers excludes its Brand / Logos category from the general icon license. The integration identifies file types and development tools and does not claim endorsement or blanket trademark clearance. New or updated packs require another review.

## Verification and application

- `node --test server/file-icon-assets.test.ts src/utils/file-icons.test.ts src/utils/theme-color.test.ts src/utils/account-theme.test.ts server/account-theme.test.ts server/file-type-icons-ui.test.ts server/icon-pack-settings-ui.test.ts`: 43 passed, 0 failed, 0 skipped. Coverage includes upstream mapping and artwork integrity, retained licenses, rejected unverified archives, API validation and account isolation, cross-device synchronization, cache migration and recovery, and selection persistence.
- The new isolated browser check exercised all three choices at 1100px, 390px, and 320px in light and dark themes. It verified four UI languages, keyboard radio selection and focus, immediate updates in File Explorer, the shared server browser, and React portals, decorative 16px images, open/closed folders, local license links, reload restoration, and preservation through custom palette add/save/delete. No external registry or CDN requests were made. Desktop light and mobile dark screenshots were reviewed.
- Existing `server/theme-color-ui.test.ts` and `server/settings-navigation-ui.test.ts` passed after the new selector was connected, preserving palette editing and mobile Back behavior. The explorer fixture now includes the shared artwork component when collecting CSS classes, so both light and dark variants are tested.
- `npx tsc -b`, targeted lint, and both generators' standard `--check` commands passed. The full lint command passed with existing repository warnings. The Impeccable detector returned no findings for the changed UI.
- Downloaded the pinned official Catppuccin 1.26.0 archive and ran the generator with `--source <archive> --check`; its SHA-256, extracted SVGs and mappings, and complete license reproduced the committed outputs. Temporary download and extraction directories were removed.
- `npm run check:docs` passed with 567 descriptions and no description or local-link errors. `git diff --check` passed. License source inspection above is separate from runtime verification.

No app build, deployment, launcher execution, or server start/restart was performed for this change. The user must build and apply it to the running instance. Actual-server and physical-device verification remain pending.
