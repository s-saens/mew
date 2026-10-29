---
title: "Back navigation from mobile settings detail screens"
description: "2026-10-29 Record of the fix to return to the list when navigating back from mobile settings details. Distinguishes isolated regression checks for nested selection lists, direct entry, responsive boundaries, and existing close behavior from existing documentation errors and the scope not applied to production."
created: "2026-10-29"
updated: "2026-10-29"
---

On mobile, pressing the browser or device Back button while viewing a detail screen such as appearance settings closed the entire settings window. This happened because `SettingsModal` called `onClose` regardless of the detail state.

Added checks for the current screen width and `mobileSection` to the existing `closeOnBack` in `useOverlayDismiss`. On detail screens below 768px, back navigation returns to the settings list while retaining the shared History guard. The next back action from the list closes only the settings window. An open selection list closes first, and direct entry to Mewpet or the debugger uses the same detail state. Esc, the close button, and desktop back navigation retain their existing behavior.

[Settings features](../features/appearance-accounts-operations/appearance-language-fonts-and-shortcuts.md) and the [Settings window UI contract](../development/ui-contracts.md#settings-window-layer) own the current contract, and the [Appearance settings guide](../../../docs/configuration/appearance.md) owns user operations.

Verification results:

- `node --test server/settings-navigation-ui.test.ts server/overlay-history-ui.test.ts packages/ui/src/useOverlayDismiss.test.ts server/dock-settings-ui.test.ts`: 14 checks passed. The new regression checks in isolated Chromium with dark and light themes verified detail → list → close, repeated item entry, closing the language selection list first, the on-screen back button, Esc and the close button, direct entry to Mewpet, and transitions between 767/768px. Also verified that overlays beneath settings remain open.
- `npx tsc -b`: Passed.
- `npx oxlint src/components/SettingsModal.tsx server/settings-navigation-ui.test.ts`: Passed without warnings or errors.
- Impeccable review of the changed UI: no findings.
- `npm run check:docs`: Failed because of 1 existing missing-frontmatter issue in `docs/지원서.md`. Separately running `node server/document-links.ts --all` also failed because of 19 existing link errors. The causes were references to feature MOCs and task documents already deleted before this work, and an API image path in the README; the 4 documents changed in this work had no errors.

No app builds, deployments, server runs, or restarts were performed. Behavior on actual mobile devices and after application to the production instance is unverified; the user builds and applies the changes.
