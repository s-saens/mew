---
title: "Workspace zoom controls"
description: "Records the hamburger menu workspace zoom controls, local persistence, verification, and remaining device and runtime limits."
created: "2026-11-10"
updated: "2026-11-10"
---

## Purpose and result

Added minus, percentage reset, and plus controls to the Mew menu so users can resize the workspace. The [menu contract](../development/ui-overlays.md#header-hamburger-menu) describes the available levels and local persistence. Fixed popup coordinate conversion accounts for root zoom.

## Verification and limits

- `node --test src/utils/workspace-zoom.test.ts` passed for restored values, invalid storage, and step boundaries.
- `node --test server/workspace-menu-ui.test.ts` passed in test-owned Chromium, including zoom changes, reset, storage, and menu bounds at 110%.
- `npm run build` passed, including TypeScript checks. `npm run lint` passed with existing warnings.
- `npm run check:docs` passed metadata validation but reported 37 missing local links elsewhere in the repository. The links in this record and the changed menu contract were inspected.
- No application server or launcher was operated. The build updates local assets; physical-device behavior and operational application remain unverified.

## November 10: Place zoom at the bottom

Moved the controls after the Mew actions into a separate section with a divider and no section heading. The [menu contract](../development/ui-overlays.md#header-hamburger-menu) owns the current placement.

The workspace menu Chromium test passed, including section order, divider, and keyboard End navigation. `npm run build` and `npm run lint` passed; lint retained existing warnings. `npm run check:docs` validated metadata and reported 38 missing local links elsewhere. The build changes local assets; no server or launcher was operated, and physical-device behavior was not checked.

## November 10: Keep the Dock at the viewport bottom

Root CSS zoom scaled the workspace height a second time, leaving a gap at reduced levels and clipping the bottom at increased levels. The viewport observer now converts the measured visible bottom to zoomed CSS coordinates and updates when the menu changes zoom. The [workspace layout contract](../development/ui-workspace-layout.md#device-safe-areas) describes the geometry. CSS zoom does not change media-query breakpoints like browser-controlled zoom.

The Chromium safe-area fixture passed at 50%, 80%, 100%, 125%, and 200%, checking the real Dock and workspace boundaries; existing fullscreen and keyboard viewport tests passed. The menu and zoom unit tests also passed. `npm run build` and `npm run lint` passed, with existing warnings. `npm run check:docs` found no description errors and reported 40 missing local links elsewhere. No server or launcher was operated. Physical Android/Brave and device keyboard behavior remain unverified.

## November 11: Place zoom at the top

Moved the separate, untitled zoom section to the top of the menu, before account and other actions. The [menu contract](../development/ui-overlays.md#header-hamburger-menu) owns its current placement.

The workspace menu Chromium test passed, including section order, divider, and Home/End navigation. `npm run build` and `npm run lint` passed; lint retained existing warnings. `npm run check:docs` validated descriptions and reported 39 missing local links elsewhere. The build updates local assets; no server or launcher was operated. Physical-device behavior was not checked.
