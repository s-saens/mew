---
title: "Account-wide desktop layout and last-panel focus"
description: "Records the November 4 change to retain desktop layout, popup coordinates, last-panel focus, and the preferred editor slot across project switches for each account and browser device. Tracks migration, project-content boundaries, passing local regressions and build, blocked browser verification, and user-managed runtime application."
created: "2026-11-04"
updated: "2026-11-04"
---

## Purpose and resulting behavior

Keep the desktop arrangement stable when the account selects another project. One browser record now owns desktop docking and chrome state per account, with a one-time migration from the first accepted active project's old layout. Project previews, cached responses, and later server snapshots preserve that arrangement, including when browser storage is blocked. Desktop popup coordinates, last-panel focus, and the preferred editor slot also follow the account across projects.

The desktop Dock remains mounted for the account. Project-specific documents and execution tabs still load from their own logical-project state. Incoming editor panes align with the current desktop slots while preserving destination-project tab contents. Desktop hydration prefers the account's last editor slot over project metadata while retaining each destination pane's active document. The project ledger keeps `focusedPaneId` for compatibility and mobile restoration. Restoring the last-panel highlight or editor-slot selection does not take keyboard focus. Mobile layout and foreground restoration keep their existing project scope.

[ADR 0134](../decisions/0134-account-desktop-layout.md) records the scope change. Current storage and behavior belong to the [layout contract](../development/ui-workspace-layout.md#workspace-panel-layout), and shared tab ownership belongs to the [account tab contract](../development/account-tabs.md).

## Verification

- `node --test src/hooks/use-floating-panel.test.ts src/utils/device-layout.test.ts src/hooks/use-focused-workspace-panel.test.ts src/utils/editor-tab-state.test.ts src/utils/workspace-ui-startup.test.ts src/utils/layout-presets.test.ts`: all 28 tests passed. Coverage includes first-project migration, stale prefetched snapshots, account/device separation, mobile storage boundaries, blocked storage, destination buffer retention, preferred editor focus, delayed popup migration, focus persistence, and existing startup/preset behavior. DOM tests use Happy DOM with explicit geometry; they do not verify physical-device rendering.
- `npm run build` passed, including TypeScript. An initial attempt found a missing identity mapper argument in startup snapshot seeding; it was corrected before successful builds. Vite retains its large-chunk warning.
- `npm run lint` passed with warnings and no errors. The scoped mechanical UI detector reported no findings. Changed files passed whitespace checks.
- `npm run check:docs` found 697 valid descriptions and 42 existing missing-target links outside this change. Scoped description and local-link checks for the five changed documents passed.
- The new actual-App scenario in `server/workspace-switch-ui.test.ts` covers different destination dock/chrome/pane IDs, retained Dock host and geometry, independent document contents, and an empty destination project. Its focused run could not connect to the user-managed Obscura endpoint after creating the fixture bundle. Browser behavior remains unverified. An earlier broad run was stopped after repeated instances of the same connection failure; no browser-test success is claimed.

Outgoing Dock snapshots are accepted only after tabs finish hydrating, so an intermediate empty editor registration cannot replace the account's retained slots during rapid project selections.

## Application boundary and remaining limits

No deployment, launcher execution, or server start, stop, or restart is performed. The required build updates `dist/` assets served by the existing instance; it does not reload server code. Physical-device behavior and user-managed runtime application require separate confirmation.
