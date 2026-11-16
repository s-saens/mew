---
title: "Compact Dock slots"
description: "Records the compact workspace Dock slot sizing change, local verification, and remaining visual validation limits."
created: "2026-11-16"
updated: "2026-11-16"
---

# Compact Dock slots

Compact workspace Dock buttons now share the available width without gaps, making the selected background fill its slot. Buttons retain a 32px minimum and horizontal overflow remains scrollable. The current behavior is specified in the [workspace layout contract](../development/ui-workspace-layout.md#mobile-dock-and-panel-switching).

The browser regression test passed for adjacent growing slots and narrow overflow. `npm run build` and `npm run lint` passed, with existing lint warnings. `npm run check:docs` found no description errors but reported 39 existing repository link errors, including missing MOC paths. No deployment or server lifecycle operation was performed. Actual device and running workspace visual checks were not performed.
