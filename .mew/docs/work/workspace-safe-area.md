---
title: "Installed workspace safe areas"
description: "Records the 2026-11-01 fix for installed iPhone workspace controls overlapping the status bar, shared workspace and dialog inset handling, isolated browser checks and build results, and remaining physical-device verification."
created: "2026-11-01"
updated: "2026-11-01"
---

The reported iPhone Safari home-screen app placed the top menu beneath the status bar, making it unreachable. The direct entry used a translucent Apple status bar without `viewport-fit=cover`, and the workspace had no top safe-area padding. Insets were previously reserved only by particular Dock edges.

The workspace now reserves all four safe-area insets within its existing viewport height. Positioned docks use their regular dimensions within that area, avoiding duplicate insets and protecting panel footers with any Dock placement. Shared dialogs and the separate settings portal reserve safe areas independently of the workspace. Current behavior belongs to [Device safe areas](../development/ui-workspace-layout.md#device-safe-areas) and the [panel layout feature](../features/appearance-accounts-operations/panel-layout-mobile-and-state-restoration.md).

Local verification:

- `node --test server/workspace-safe-area-ui.test.ts`: passed both tests, including simulated portrait, landscape, narrow landscape, keyboard-sized and desktop viewports, all Dock edges, keyboard-hidden Dock boundaries, shared dialogs and the actual settings panel. CSS environment values were substituted in the isolated fixture because the available Chromium does not expose safe-area emulation.
- `server/workspace-viewport-ui.test.ts`, `server/project-switcher-ui.test.ts`, `server/settings-navigation-ui.test.ts` and `server/dock-settings-ui.test.ts`: all four existing browser regressions passed in the related test run.
- `server/editor-keyboard-ui.test.ts` and the Dock edge/orientation case in `server/mobile-dock-ui.test.ts`: passed. The latter file's older touch/reorder case failed at line 167 because its expected order omits the existing Browser item. Re-running that case with the pre-change CSS produced the same failure; no Dock item/order implementation was changed here.
- `npm run check:docs`: passed with 626 descriptions and no metadata or local-link errors.
- `npm run build`: passed TypeScript and the production build; Vite reported its existing large-chunk warning.
- `npm run lint`: exited successfully with existing React warnings outside this change.
- The Impeccable detector found no issues in the changed UI files. Portrait, landscape and desktop fixture screenshots were inspected.

The build updated local `dist/` assets. No deployment, launcher execution, or server lifecycle operation was performed. An installed physical iPhone session, Safari-provided inset values, OS keyboard transitions and the Mewlink frame chain still require device verification.
