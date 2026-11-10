---
title: "Mobile editor actions menu"
description: "Records the mobile editor actions menu, its comment and annotation controls, local verification, and device and runtime limits."
created: "2026-11-10"
updated: "2026-11-10"
---

The editor's floating tools occupied substantial space on narrow screens. The mobile editor now groups the available actions under an editor menu button; desktop retains the floating toolbar. Comment and annotation lists remain accessible from the menu. The [editing guide](../../../docs/guides/editor.md#mobile-and-fullscreen) describes the controls.

The browser regression test passed at 320, 390, and 1280 pixels, including menu dismissal, comment and annotation list toggles, and database actions. The project build and type check passed. Lint completed with warnings. The documentation check reported existing missing links elsewhere in the working tree; descriptions passed. Physical mobile devices were not tested. The build updates local assets; server lifecycle operations were not performed.
