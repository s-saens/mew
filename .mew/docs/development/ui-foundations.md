---
title: "UI foundations, themes, and copy"
description: "Shared visual foundations for compact layouts, icons, scrollbars, theme colors, UI copy, and translations. Defines reusable presentation rules while feature documents retain their requirements."
created: "2026-11-03"
updated: "2026-11-03"
상위파일: "ui-contracts.md"
---

## Shared scrollbars

`src/index.css` owns native scrollbars in editors, file explorers, terminals, and tables: 6px width/height, rounded thumbs, transparent tracks, and 70% thumb opacity. Manage colors through `--color-scrollbar-*` tokens, mixing the selected background (`--color-surface-deep`) and text (`--color-ink`) in both solid and gradient themes.

| State | Thumb ends | Highlighted point |
| --- | --- | --- |
| Default | 82% background, 18% text | 65% background, 35% text |
| Hover | 25% text | 45% text |

Hover retains 70% opacity. The brightest point follows scroll position divided by maximum scroll distance (content size − viewport size): top/center/bottom vertically and left/center/right horizontally. Darken the thumb away from that point. `src/utils/scrollbar-gradient.ts` collects nested scroll events and updates only the affected region's CSS variables each frame. Firefox falls back to a thin solid scrollbar using the thumb-end theme color at 70% opacity; `.no-scrollbar` regions remain hidden.

Touch dragging uses an invisible 24px-thick thumb target:

- Vertical length: three times the larger of the thumb length and 44px, at least 132px before clipping.
- Horizontal length: the larger of the thumb length and 44px.
- Center the target on the thumb; shift it inside either track end and cap its length at the track length. Grabbing outside the visible thumb must not jump the scroll position. Preserve appearance, content width, and drag ratio.

`src/utils/scrollbar-touch.ts` handles single-finger dragging in vertical, horizontal, RTL, and nested regions. Exclude non-scrolling regions, `.no-scrollbar`, `overflow: hidden/clip`, and axes misaligned by rotation or skew. Leave mouse input, ordinary content swipes, and multitouch starts unchanged. Release on touch end/cancel and clean up the global handlers from `src/main.tsx` during HMR replacement. The [vertical touch-area work record](../work/scrollbar-touch-area.md) records verification and application status.

Validation on 2026-10-19: the 2 tests `server/scrollbar-touch-ui.test.ts`·`server/sidebar-touch-ui.test.ts` and TypeScript passed. Browser touch input confirmed vertical, horizontal, RTL, and nested operations, exclusion conditions, and preservation of the drag position after adding FileTree rows. Reviewed 390px mobile dark and 1100px PC light captures and checked that 6px scrollbars and content width were preserved.

## Theme-colored outline shadows

The Mewpet notification bubble also colors its outline shadow with `--color-surface-deep`, preserving its 24% opacity, offset, and blur. `server/theme-shadows-ui.test.ts` verifies immediate theme changes for both tab arrows, the loading-logo wrapper, and this bubble at desktop/mobile widths across every preset and custom solid/gradient palettes. See the [theme shadow work record](../work/theme-background-shadows.md) for verification and application status.

## Design guidelines: spacing and information density

**Use orderly layouts and consistent spacing to clarify relationships and create openness.** Mew's work UI prioritizes the information and workspace visible on one screen, alongside readability and ease of operation.

- Panels, settings, popups, and toolbars default to compact spacing. In keeping with the existing compact UI, generally start with 8–12px internal padding and 4–8px spacing within groups, increasing only as needed for meaningful separation, readability, and touch operation. Use concise padding and spacing suited to the content. Do not inflate the interface with decorative outer margins, accumulated padding in nested containers, or unnecessary minimum heights.
- Group related items closely, and add only the spacing needed to distinguish groups. Also express hierarchy through alignment, font size and weight, and color; do not rely on large gaps for every distinction.
- Allocate extra space on wide screens to body content, lists, and work areas. On mobile and in narrow panels, prevent excessive spacing from pushing primary actions offscreen or causing unnecessary scrolling.
- Remote desktop prioritizes the visible area of the actual remote screen. Apply the same density principles to connection/settings screens and controls, and prevent large guidance cards or empty areas from encroaching on the workspace. Distinguish letterboxing needed to preserve the video aspect ratio from decorative spacing.
- Even when increasing density, preserve readable text and line spacing, click/touch areas, focus indicators, and device safe areas. Reduce container padding and redundant space first; do not truncate content or make interactive targets excessively small.

Even when using design skills such as `impeccable`, prioritize this project's task-focused density standards. During review, check how well key content and controls remain visible at the same screen size and whether spacing actually helps distinguish sections and improve usability.

## Prefer icon buttons

Prefer existing icons for familiar actions: close, refresh, copy, cancel, and disconnect. Use X to close popups. Supply translated `aria-label` and `data-tip` names through the shared `HoverTipLayer`; mark the icon `aria-hidden`. Preserve keyboard focus and disabled, in-progress, and completed states. Retain short labels when an icon cannot clearly convey the primary action, target, or result, such as login or authorization. Do not convert every button mechanically or shrink interaction areas excessively.

`HoverTipLayer` handles all `data-tip` attributes assigned to HTML elements and SVG lines and points. It immediately displays names on mouse hover, shows no tooltips for touch input, and hides them on pointer press, scrolling within the layer, or pointer exit. Tooltips use `--layer-tooltip` (1900 fallback), flip above or below when needed, and clamp to the portal host's visible bounds. Callers inside menus pass the menu's portal container so the tooltip remains in the same dialog or fullscreen host. SVG interaction targets also provide separate accessible names and keyboard behavior.

Panel and file explorer close buttons follow the task header: a 24×24px interaction area, a 14×14px `Xmark`, vertical centering in a 36px-high header, and a 4px right margin. They share icons, sizing, focus, and common tooltips through `PanelCloseButton`, without adding duplicate right padding to the header.

## Theme Colors and Derived Accents

Color inputs use `ColorPicker` (`packages/ui/src/color-picker.tsx`) from `@mew/ui`. `value` and `defaultValue` are opaque 6-digit HEX values, and `onChange` passes only valid lowercase HEX values. The caller owns persistence and theme derivation and supplies translated labels. Instead of opening the OS color dialog, it expands a color area and hue, saturation, and brightness sliders below the field. Its inline placement follows the settings scroll area and mobile width without creating a separate portal or modal.

The color area uses pointer capture for mouse and touch dragging and clamps coordinates outside its bounds. The same values can be adjusted by keyboard through three range sliders with accessible names and current values. The hue and saturation being adjusted are preserved even for black and gray. Incomplete HEX values are not saved and are restored on blur or Esc. `useOverlayDismiss` handles Esc and Back first while the picker or HEX editor is active, keeping the settings dialog open, and returns focus to the color button after closing. Pressing outside also collapses it, and input is blocked when disabled.

Appearance settings select one `ThemePalette` from `shared/theme.ts`: opaque 6-digit HEX `background`, `text`, and `primary`. Optional `gradient` contains two HEX `colors`, finite direction `angle` normalized to 0 ≤ direction < 360 degrees, and boolean `animated`. Keep `background` as the gradient base and solid fallback.

`ThemeSettings` saves `palette` and the `custom` array together in server-side account state, excluding derived tokens. `src/utils/theme-color.ts` re-exports the model and owns derivation, browser migration, and initial display. APIs, account caches, change signals, and reconnection follow the [Account Theme Storage Contract](browser-storage.md#account-themes).

Normalize saved colors to lowercase. Exclude invalid, duplicate, and preset-matching custom entries; compare gradient presence, both colors, direction, and animation. If only `gradient` is invalid, discard it but keep the three valid colors. Add a selected theme absent from both presets and custom entries to the custom list for reselection. Failed saves leave it usable for the current session.

If `mew:themes` is missing or the selected palette is invalid and there are no previous settings, the Midnight preset is used. The same default is used when storage cannot be read. If previous settings exist, the existing selection is preserved. Migration reads the `mew:theme` mode and `mew:theme-color`. It reads `accent` from the `mew:accent-color` object only when no theme color exists, and restores invalid legacy colors to the default `#4432a8`. It calculates the displayed accent for that mode from the legacy source and migrates it to the new `primary`, preserving the previous screen colors. Legacy settings are retained, and valid new settings take precedence.

When settings are read, if the selected solid-color palette exactly matches the three colors of the old Midnight, Rose, or Ocean preset and the stored custom list contains no identical solid-color palette, it is migrated to the new gradient preset. If the custom list contains the same combination, the user's saved solid colors are preserved. Migration does not occur during normalization or saving, preserving new solid-color custom themes.

`deriveThemePalette` maps `background`, `text`, and `primary` directly to `--color-surface-deep`, `--color-ink`, and `--color-accent`. Mix background/text to derive panels, hover, borders, and secondary text.

| Surface | Light solid theme: text-color mix |
| --- | --- |
| Base | 3% |
| Raised | 7.5% |
| Hover | 14% |

Apply these brighter levels to bubbles, neutral buttons, inputs, and popups; retain solid dark-mode levels. Keep workspace mixing (dark 5.9%, light 4.6%) in separate `--color-workspace`, preserving body background/gradient. Base-background contrast against white/black determines `.dark`; status, syntax, and inverted tokens retain mode-specific CSS. Do not auto-correct custom body text or primary colors. Show guidance when draft body-text contrast against base or sampled gradient backgrounds is below 4.5:1.

Gradient themes derive `surface`, `surface-raised`, and `surface-hover` as 8-digit HEX colors with alpha, exposing the overall background through neutral bubbles, buttons, and components:

| Surface | Dark text-color mix | Light text-color mix | Opacity |
| --- | --- | --- | --- |
| Base | 10% | 8% | 48% |
| Raised | 21% | 14% | 58% |
| Hover | 31% | 22% | 72% |

All themes also provide opaque `surface-solid`, `surface-raised-solid`, and `surface-hover-solid`. Change only derived tokens: preserve non-gradient surfaces, original palettes, workspace background, gradient, primary/body text colors, borders, and default terminal backgrounds. Do not migrate saved entries or draft structures.

Large workspace panel backgrounds are distinguished from the neutral surfaces of buttons and inputs. Git, tasks, debugger, notes, Git diff, SVG, media, spreadsheet and PDF previews, and panel loading backgrounds use `mew-panel-surface`. In gradient themes, these backgrounds, the `[data-dock-tab-bar]` tab bar, and the desktop dock rail are transparent so the full-screen background appears continuous. The Git commit form uses the same background. The large Gantt SVG grid background is transparent, and weekend shading uses the base background color at 32% opacity. Active tabs, hover states, buttons, and inputs retain existing translucent tokens, while popup interiors, fixed regions that overlap during scrolling, and actual document and media backgrounds follow their respective content readability rules. Solid-color themes restore the existing panel, tab, and grid backgrounds.

Links and strong accents retain HSL hue/saturation and adjust lightness by binary search:

- Links keep the primary color if contrast suffices against body, panel, raised, and sampled gradient backgrounds. Otherwise correct lightness, including opaque hover counterparts for gradients.
- Strong accents start from primary relative luminance plus 0.08 in dark mode or minus 0.045 in light mode; constrain the range by button-text contrast.
- `--color-ink-on-accent` keeps the mode's default text color when contrast suffices, otherwise choosing white or black. Preset body text, links, and text on solid accent/strong-accent buttons must reach 4.5:1. Delete buttons use separate `--color-ink-on-danger`.

`ThemeSettingsPanel` and `ThemeButton` show 7 presets and custom entries in an `Aa` grid. Midnight, Rose, and Ocean enable slow gradient animation. Selecting a preset/saved entry applies it immediately; final `+` copies the current palette into a draft.

- Wrap background, gradient checkbox/two colors, text, and primary controls together; text and primary wrap as a pair. Compact `ColorPicker` stays fixed without pushing down the form.
- **Gradient** reveals a 24px clock-style `ThemeGradientAngle`, matching color squares, a numeric field, and **Background Animation** immediately below. Use clockwise integer angles 0–359 from 0° at the top, adjustable by drag, arrows, or numeric input. Previews and theme buttons share the gradient.
- Reset restores the value from the start of editing. New/replacement themes affect the screen only after the title's right-hand save icon. Editing a saved entry adds a delete icon beside it. Use translated accessible names and shared tooltips, without text, cancel-edit X, or a bottom button row.
- Esc/Back discard drafts; deleting removes the entry and applies the default theme. Provide labels/names in four languages, with 3 columns at 320px and 4 at 360px or wider.

Detailed interactions follow the [Appearance Settings Feature Contract](../features/appearance-accounts-operations/appearance-language-fonts-and-shortcuts.md).

Gradients combine two `radial-gradient` layers whose positions vary by direction. A single fixed `.theme-gradient body::before` background in `src/index.css` covers the screen, while the large base background of `.mew-workspace` and the CodeMirror body are transparent to reveal it. `[data-dock-workspace]`, the actual panel portal host for `DockWorkspace`, is also explicitly transparent in gradient themes. Because the host defaults to `bg-edge`, making only `bg-surface-deep` transparent leaves the agent body obscured by a solid color. Only transform translation and scale and opacity change slowly over 18 seconds with `ease-in-out alternate`. The file explorer's large background is made transparent separately, while the terminal retains its default solid surface. In all themes, CodeMirror's line-number gutter is fully transparent without a background color or backdrop blur, continuing the body background, and remains fixed on the left during horizontal scrolling. Theme buttons and draft previews in `theme-background-sample` use the same gradient and motion. Animation stops when disabled or when `prefers-reduced-motion: reduce` applies, and switching to a solid-color theme removes the global gradient.

`src/components/overlay-layers.css` owns popup background and blur rules. In light mode, floating windows, dialogs, menus, selection lists, tooltips, and neutral absolute/fixed popups apply 75% opacity and `backdrop-filter: blur(6px)` to their actual background surface, regardless of gradient presence. This applies to Light, Paper, Rose, Ocean, and bright custom themes, mixing 70% theme background color with 30% of each surface's opaque counterpart to produce a light tint. Dark mode retains the existing 75% background and 6px blur for gradient popups and opaque backgrounds without blur for solid-color popups. Text and icons receive no opacity or filter. Command button add/edit dialogs apply the same rules through `role="dialog"` and `.mew-overlay-surface`.

Light-mode dialogs make the outer backdrop background transparent and render the existing black backdrop using a shadow (the spread of `box-shadow`) that extends only outward along the inner panel's rounded boundary. When modals overlap under the same parent, the rear modal's backdrop is hidden so black does not show through even a wider front panel. No black is painted beneath translucent panels; shared CSS handles this while preserving outside presses, Esc, Back, and the existing layer order. Dark-mode backdrops retain their existing behavior. Large inner bodies of floating windows are transparent so they do not obscure the outer translucent background. Surface tokens inside the boundary are restored with `*-solid` to preserve input and hover readability, while sticky tree rows and agent loading overlays remain solid.

`src/main.tsx` applies the saved palette before the first React render. `useAccountTheme` fetches account state and saves only explicit user changes to the server. Applying a remote theme updates all derived tokens and the copy used for initial display without repeating save requests. The terminal reflects background and text colors through its existing root class/style observer. `mew:theme` also stores the mode determined by the background, preserving the initial HTML mode selection.

If a `listbox` embedded in a popup is not a separate floating list, assign `data-inline-listbox` to exclude the shared overlay background and blur. The Git branch menu's inner list shows the outer popup surface while preserving solid backgrounds for selected and hovered rows and inputs.

Popups positioned through CSS or inline style without `.absolute` or `.fixed` also assign `mew-overlay-surface` to their actual background surface to apply the mode-specific background and blur rules above. Color levels are selected using the existing `bg-surface-deep`, `bg-surface`, and `bg-surface-raised`; inline background colors must not override shared handling. Editor slash, mention, link, and table tools, DB selection and column menus, date calendars, and popups in tasks, the drawing app, and remote screens also use this boundary. Mewpet conversations, recent notification lists, and fullscreen guidance receive the same handling through `.mewcat-notifications`, and speech bubble tails use the same opacity as their bodies. Inner conversation bubbles and inputs remain solid. Solid light themes retain bright translucent backgrounds and blur, while solid dark themes restore existing opaque surfaces without backdrop blur.

Validation: `src/utils/theme-color.test.ts` checks legacy display colors, preset selection migration, save failures, solid/gradient custom normalization, duplicate comparisons, saved-state restoration, damaged gradient recovery, application of all presets, mode selection, translucent/opaque counterpart tokens, preservation of existing solid-theme values, gradient samples and an RGB grid, and link/button contrast for achromatic primary colors. `server/theme-color-ui.test.ts` checks actual settings for preset selection, color drafts, gradient editing, adding/duplicates/editing/deleting, restoration, pre-save contrast guidance, stopping under reduced motion, translucent neutral surfaces, 75% overlays and backdrop blur, protection of solid interiors, mouse/touch, sliders, achromatic colors, incomplete input, reset, Esc/Back stages, language/font lists, button hover, delete button text, and layouts at 320/390/1100px. `server/mewcat-assistant-ui.test.ts` checks Mewpet body and tail opacity of 75%, 6px backdrop blur, and solid interiors in the three gradient presets and solid light mode on PC and mobile, plus restoration of opaque backgrounds without blur when switching to solid dark mode.

`server/light-overlay-ui.test.ts` renders the actual `DialogFrame`, existing modals, and nested modals in 24 combinations of 390/1100px and Light/Paper/Rose/Ocean. It checks that panel interior pixels remain identical before and after backdrop removal while exterior and rounded-corner pixels differ, that rear backdrops are hidden when nested, that actual backdrop blur is applied, and that selection lists close on Esc and outside presses.

Workspace background visibility is not judged solely by settings previews or CSS values. `server/theme-workspace-ui.test.ts` places the actual `AgentPanel` in the `DockWorkspace` portal host and captures Midnight, Rose, and Ocean at 390/1100px to check that multiple pixels in the empty body are not covered by a solid color. In the same workspace, it also checks background motion over time, stationary pixels under reduced motion, restoration of saved session history, menu opacity of 75% and backdrop blur, and host background restoration when switching to a solid-color theme. It also checks neutral bubble and input alpha, changes in interior pixels, actual text contrast, preservation of solid primary-color buttons, and the absence of filters on menu text.

`server/theme-panels-ui.test.ts` places actual Git and task panels in the same `DockWorkspace`. Across 12 panel combinations of Midnight, Rose, and Ocean at 390/1440px, it checks body and tab bar transparency, spatial differences in captured pixels and background changes over time, translucent active-tab tints, mode-specific menu readability protection, Gantt grids and weekend shading, and restoration when switching to solid colors. On 2026-10-20, failures were also confirmed in an isolated variant with the new shared background rules removed across 18 combinations that included the feature panel available at the time.

`server/overlay-consistency-ui.test.ts` compares the actual hamburger menu, slash, mention, link reading/editing, table tools, and date calendar in Midnight, Rose, Dark, and Light at 390/1100px. It checks background opacity, blur, text sharpness, solid inner controls, selection, removal, closing, and Esc.

## UI copy

Show only item names, current status, differences needed to make a choice, and the next action. Do not add a separate explanation when a button or input label is sufficient. Do not add persistent instructions or shortcut guidance that repeats behavior already apparent on screen. Do not reintroduce guidance removed at the user's request by rewording it or moving it elsewhere. Before merely shortening sentences such as `~하면 ~에 저장됩니다`, first determine whether users need the information.

Do not reintroduce implementation explanations about servers, CLI, registries, saved file paths, communication methods, or fixed guidance areas for them. Keep implementation and operational information in the relevant development and configuration documents. Retain the scope of deletion or overwriting, whether execution ends, when changes take effect, input limits, cost distinctions, and error resolution instructions where needed. Do not remove copy to hide functionality or the causes of errors.

- Display settings: Do not explain theme, language, or color selection again. Show font input requirements briefly.
- Login video: Show connecting, ended, and error states and a Reconnect button. Relay remote pixel coordinates and key input; do not retain video, input, or authentication codes in notification history. Follow [Login virtual screen](login-desktop.md).
- Agent settings: Show installation status and available actions. Do not explain implementation reasons for unsupported delete or logout commands. Retain when settings take effect and how to change keys.
- Account and subscription: Show the account, plan, actual limits, and refresh action. Do not show duplicate paragraphs explaining the free plan or original notes about how the provider is queried. Retain the distinction for API usage charges, and place guidance for checking whether it is the same account inside the subscription window.
- Commands and schedules: Show the execution folder, what to run, the time, and whether to close the terminal upon completion. Do not explain configuration file locations or the crontab execution structure.
- Document tools: Remove repetitive explanations from import and export menus, and place overwrite warnings at the folder selection and confirmation steps. Use brief indicators to distinguish non-editable link titles and read-only DB references.

When removing explanations, also clean up empty boxes, dividers, and spacing. For screens that use translations, update all four languages together and delete translation keys for removed copy. Preserve keyboard focus, input names, and status announcements. Detailed criteria for the agent login screen follow the [display criteria](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#login-screen).

## UI translation

- The existing `I18nProvider` manages the app's language selection and immediately passes both the initially saved language and changes to `setUiLocale` in `@mew/ui/i18n-core`. The app's `t()` keys and the shared package's `uiText()` follow the same Korean, English, Simplified Chinese, and Japanese settings.
- `packages/ui/src/ui-messages.ts` is the canonical source for shared copy. Use the Korean source text as the key and register English, Chinese, and Japanese translations for every entry. Include loading, empty states, error fallbacks, buttons, help, and accessible names. Register new source text under an existing app key or in the shared dictionary instead of inserting it directly into the UI. Pass counts, paths, and names as placeholders, and translate complete sentences.
- React surfaces subscribe to changes through `useUiLocale()` from `@mew/ui/i18n`. Do not freeze translated results at module initialization. Utilities outside React read the language at call time, and DOM node views subscribe through `subscribeUiLocale()` and unsubscribe on destruction. CodeMirror search reconfigures only the language compartment, and the Markdown render cache includes the language in its key. Do not remount editors or terminals or clear drafts, search terms, or documents to switch languages.
- Weekdays, calendars, and times use the selected language's `Intl` formatting. Do not replace original text in user documents, filenames, project names, conversations, command output, or external systems in an attempt to translate it. Preserve Korean slash-search aliases, compatibility values for existing tab names, and Markdown heading parsing aliases as data contracts.
- Verification: `packages/ui/src/i18n.test.ts` checks all four languages, placeholders, and subscription cleanup; `src/ui-localization.test.ts` checks for untranslated Korean literals in UI sources, language-specific Markdown caches, and time display. `server/i18n-ui.test.ts` checks switching among all four languages, refreshing agent history and the current conversation, CodeMirror find, code copying, shared confirmation dialogs, and preservation of drafts, search terms, and content on desktop and mobile in isolated Chromium.
