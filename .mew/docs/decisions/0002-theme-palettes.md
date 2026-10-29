---
title: "Three-Color Themes and Custom Presets"
description: "Decision to replace the single theme color and fixed mode combination with background, text, and primary color themes, and to adopt a preset grid, custom saving, and migration of previous display colors. The extension for optional gradient backgrounds is covered by subsequent decision 0010; per-account storage and cross-device synchronization follow 0030."
created: 2026-10-14
updated: 2026-10-20
status: accepted
---

## Background

The previous display settings fixed the light/dark background and text colors and calculated accents from a single theme color. The user requested the ability to select background, text, and primary colors together and create custom combinations.

## Decision

Save the three colors as a single theme. Display presets, including the default dark and light themes, and custom themes in a `Aa` button grid, with copying, editing, and adding available from the final `+`. Edit custom drafts in the preview and apply them when saved.

Apply the three selected colors directly to the body background, body text, and primary color. Derive panel, border, secondary text, link, button hover, and button text colors. Determine light/dark mode from background brightness. Migrate the previous single theme color by preserving the color actually displayed rather than the saved original.

## Rationale and Impact

Each button lets users compare a combination of background, text, and accent colors, and unsaved drafts do not change the readability of the workspace. Save the selection together with the custom theme list so the same theme can be selected again after a refresh. Do not automatically correct user-specified body colors; show guidance in the editing area if contrast is low.

This decision replaces the previous single theme color and mode-switching contract. [Display Settings Feature](../features/appearance-accounts-operations/appearance-language-fonts-and-shortcuts.md) and [Theme Contract](../development/ui-contracts.md#theme-colors-and-derived-accents) own the current UI, storage, and validation; [Display Settings](../../../docs/configuration/appearance.md#appearance-settings) owns usage instructions.

[0010 — Theme Gradients](0010-theme-gradients.md) retains the three-color and draft-saving contracts while adding optional gradient backgrounds, background animation, and migration of previous preset selections.

[0030 — Account Themes](0030-account-themes.md) moves the canonical source for the selection and custom theme list from the browser to account state and defines cross-device synchronization and initial migration conditions.
