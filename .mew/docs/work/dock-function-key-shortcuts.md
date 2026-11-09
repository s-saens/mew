---
title: "Dock function-key shortcuts"
description: "Records F1–F12 Dock selection, local automated checks, browser key reservation limits, and the runtime application boundary."
created: "2026-11-09"
updated: "2026-11-09"
---

# Dock function-key shortcuts

Added unmodified F1–F12 selection in visible Dock order so keyboard users can focus or open a panel directly. Hidden and unavailable items do not take slots. Repeats and empty slots are consumed without selecting a panel. Dialogs and remote input retain priority. The current contract is in [workspace layout](../development/ui-workspace-layout.md#mobile-dock-and-panel-switching) and the [user guide](../../../docs/configuration/appearance.md#keyboard-shortcut-settings).

Local verification: `node --test src/utils/dock-shortcuts.test.ts src/utils/mobile-dock.test.ts` passed all 8 tests; `npm run build` and `npm run lint` passed with warnings. `npm run check:docs` verified descriptions but reported 37 existing missing-document links elsewhere in the checkout. These tests simulate keyboard events; actual browser and OS interception, especially F11 and F12, was not verified. The build updates `dist/`, which a running server may serve; no server lifecycle or deployment operation was performed.
