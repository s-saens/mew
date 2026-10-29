---
title: "Improved Custom Theme Color Layout and Direction Controls"
description: "Records the 2026-10-27 implementation of grouped custom theme colors, save/delete icons beside the title, a 24px circular direction control, and an overlay color picker, along with isolated Chromium, type, and lint check results, existing documentation link errors, and the scope not deployed."
created: "2026-10-27"
updated: "2026-10-27"
---

Improved the layout where color choices were scattered across multiple rows and the color picker pushed settings below it down. Current controls are owned by [Appearance settings](../../../docs/configuration/appearance.md#appearance-settings), detailed behavior by the [Appearance settings feature contract](../features/appearance-accounts-operations/appearance-language-fonts-and-shortcuts.md), and coordinate calculations by the [Shared popup contract](../development/ui-contracts.md#popup-coordinates-inside-modals).

## Implementation results

- Grouped background, gradient, text, and primary colors in one area. On narrow screens, text and primary colors wrap together.
- Replaced the direction slider with a 24px clock-style graphic matching the color squares and a numeric input. Dragging, keyboard controls, and numeric input adjust the same angle, and the touch target is 44px.
- The compact picker appears in a fixed layer using the existing shared coordinate calculations. Preserves the height of the form below, the save button position, and the Tab, Esc, and Back handling order. The paint app's regular picker remains inline.

## Verification

- `node --test server/theme-color-ui.test.ts server/theme-gradient-angle-ui.test.ts server/fixed-popup-ui.test.ts src/utils/theme-color.test.ts`: 22 passed, none skipped. Tested with in-memory fixtures and Chromium without running the actual app server.
- Verified theme settings at 320/390/1100px in light/dark modes: color grouping, picker screen boundaries, preservation of height and save button position, input over obscured content, existing save/cancel/reset behavior, Esc/Back, and four languages. Also reviewed desktop and narrow-screen captures.
- For the circular control, verified its 24px size on PC and touch devices, all four directions matching the actual background, pointer capture outside the area, cancellation and repeated interaction, numeric normalization and restoration of empty inputs, and arrow keys, Page Up/Down, and Home/End.
- `npx tsc -b` passed. `oxlint` completed without errors for the changed code and tests, with warnings remaining about ref access and existing effect state synchronization. `impeccable detect --json --scope layout` reported no findings.
- The description check in the full `npm run check:docs` passed, but the link check failed on 18 links pointing to feature MOCs and task documents that were already being deleted or moved before this work. The description and direct links in this work's document were checked separately.

No app build, deployment, server startup, or restart was performed. Application to an actual instance and verification on physical devices remain pending.

## Follow-up: Save and Delete icons next to the title

Following an additional request on 2026-10-27, replaced the X to the right of the custom editing title with Save and Delete icons and removed the bottom row of text buttons. New themes show only Save; saved items show Save and Delete side by side. Esc and Back remain available to cancel edits.

`node --test server/theme-color-ui.test.ts` passed. Verified that only icons appear at 320/390/1100px in light/dark mode, their placement next to the title, control sizes, accessible names/tooltips in four languages, saving and deleting, cancellation with Esc, and stable button positions when opening the picker. Also verified Enter activation of the Save icon and PC/mobile captures. `npx tsc -b` and linting of the changed code and tests completed without errors, with existing ref warnings remaining. The layout check reported no findings. The full documentation check failed on 18 existing link errors; descriptions and direct links in the changed documents were checked separately. No build or application to the server was performed.
