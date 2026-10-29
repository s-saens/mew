---
title: "Theme Gradients and Background Animation"
description: "Decision adding optional two-color gradients and background animation to three-color themes, and defining transparency for the actual docking host, translucent components, editor line-number gutters without backgrounds, preservation of existing preset selections and solid-color custom themes, contrast checks, and reduced motion. Subsequent adjustments adopt bright 75% backgrounds and 6px blur for all light popups and a backdrop outside modal panels, while retaining existing dark-mode behavior."
created: 2026-10-16
updated: 2026-10-20
status: accepted
---

## Background

The user requested gradient backgrounds for custom themes and soft background motion like the Mewlink loading screen for the Midnight, Rose, and Ocean presets. Background presentation must be extended while preserving the existing three-color theme contracts for storage, drafts, and solid-color surfaces.

## Decision

Add optional `gradient` to the existing `background`, `text`, and `primary`. Gradients store two colors, a direction, and whether animation is enabled, while `background` remains the base color and solid-color fallback. Apply slow background motion by default to Midnight, Rose, and Ocean, and offer the same settings in custom editing. Changes take effect when saved after previewing.

Include gradient presence, both colors, direction, and animation in combination comparisons. Discard only invalid gradient settings while preserving the valid base three colors. Migrate previously saved Midnight, Rose, and Ocean selections to the new presets only when all three colors match exactly and no identical solid-color custom entry exists. Apply migration only when reading settings.

Composite two radial gradients on a single fixed background and make the workspace's large base surfaces transparent to reveal it. This includes `[data-dock-workspace]` in `DockWorkspace`, the portal host for the actual panels. Slowly change only the background's position, size, and opacity, and stop motion when the device's reduced-motion setting is enabled. Use the base background color together with gradient samples to calculate body-text contrast guidance and link-color adjustments.

Apply a shared surface with a stronger tint and alpha to neutral bubbles, buttons, and components in themes with gradients. Display the outer background surfaces of overlapping popups, menus, dialogs, and floating windows at 80% opacity with 6px backdrop blur. Restore inner surfaces using opaque counterpart tokens to keep inputs and hover states readable, without blurring text or icons themselves. Remove background color and backdrop blur from CodeMirror's line-number gutter so it flows into the body background. Keep the gutter fully transparent in solid-color themes as well. Retain dialog backdrops and the solid colors of pinned tree rows and loading overlays. Preserve solid-color themes, the original palette, the overall workspace background, primary colors, text colors, borders, and the terminal's default background. Only derived surfaces change, so saved entries and drafts are not migrated.

## Rationale and Impact

Existing palette formats and solid-color themes remain readable, and users' saved solid-color custom combinations are preserved. Limit configuration to two colors and a direction to keep the editing screen and storage format simple. Provide background animation as slow motion that does not interfere with reading or typing and can be disabled in user and device settings.

The host's default border-color background differs from ordinary workspace surface colors, so it must be made transparent separately for gradients. Verify background visibility through captures and pixel checks that render actual panels together with the docking host; CSS checks of a simple workspace stand-in used for settings are not sufficient to declare completion.

Resolve neutral components obscuring the background through shared surface tokens without changing the palette's gradient colors. Give translucent backgrounds a stronger tint to preserve their outlines, and provide opaque counterpart tokens to keep inner controls readable. Apply a light blur to the outer backgrounds of overlapping windows to obscure detailed text underneath while letting the overall colors show through.

This decision extends the background presentation and migration scope for previous preset selections in [0002 — Three-Color Themes](0002-theme-palettes.md). The meanings of the three colors and the contract for retaining drafts before saving continue to apply. [Shared UI Contract](../development/ui-contracts.md#theme-colors-and-derived-accents) owns the current storage, rendering, and contrast contracts; [Display Settings](../../../docs/configuration/appearance.md#appearance-settings) owns interactions; and [Display Settings Features](../features/appearance-accounts-operations/appearance-language-fonts-and-shortcuts.md) owns feature scope and actual verification.

## Subsequent Adjustment — 2026-10-17

In response to the user's request for slightly more transparent popups, reduce shared background opacity from 80% to 75%. Apply the same value to the hamburger menu, dropdowns, Mewpet, and other popups, while retaining 6px backdrop blur and solid-color inner controls. This adjustment supersedes only the opacity value in the decision above.

## Subsequent Adjustment — 2026-10-19

To resolve translucent light-mode popups looking dull because a black backdrop shows through, use opaque counterpart colors for popups, menus, dialogs, and floating windows in gradient light mode. Dark mode retains 75% backgrounds and 6px blur. Also assign the shared overlay boundary to the command-button add/edit dialog so its inner inputs use solid colors and its outer surface follows the mode-specific background and blur rules. Preserve saved themes and body-component transparency.

## Subsequent Adjustment — 2026-10-20

In response to the user's report that light popups had lost transparency and blur and dropdowns looked dark, supersede the opaque light-background decision in the 2026-10-19 adjustment above. Popups, dropdowns, menus, dialogs, floating windows, and tooltips in Light, Paper, Rose, Ocean, and light custom themes use 75% backgrounds and 6px backdrop blur, regardless of whether a gradient is present. Blend 70% theme background color with 30% of the existing popup's opaque surface color to produce a bright tint. Do not blur text or icons themselves, and keep inner inputs and controls solid-colored.

Remove the black backdrop beneath light modal panels and render it as a shadow extending only outside the rounded panel. This keeps black from showing through the translucent panel while dimming the surrounding screen as before. `src/components/overlay-layers.css` owns both the existing popup background and blur rules in `src/index.css` and this outer backdrop. Preserve outside-click, Esc, back-navigation, and layer-order behavior; dark mode retains the existing 75% backgrounds and 6px blur for gradient popups and opaque backgrounds for solid-color popups. Do not change saved themes or body-component transparency.
