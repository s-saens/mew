---
title: "Debugger Settings Field Alignment"
description: "Records the 2026-10-31 connection/TCP port alignment fix, full-width stdio selection, regression and isolated browser checks, and pending user build and application."
created: "2026-10-31"
updated: "2026-10-31"
---

## Purpose and behavior

The connection selector appeared one label line above the TCP port input because its accessible name did not render a visible label. Added an associated visible Connection label and bottom-aligned the two fields. Settings inputs and textareas now use block layout to remove inline baseline spacing. With stdio selected, Connection fills the row; returning to TCP preserves the entered port.

The [External DAP Debugger contract](../features/terminals-agents-automation/external-dap-debugger.md#configuration-and-installation) owns the current behavior. Shared selection components and debugger execution behavior are unchanged.

## Verification

- Added regression assertions to `server/debugger-ui.test.ts`; before the fix, the test failed on connection/port top alignment at 1366 px.
- `node --test server/debugger-ui.test.ts`: passed after the fix at 1366, 768, and 320 px. Checks cover matching control top/bottom edges, 44 px touch heights, keyboard/touch transport selection, full-width stdio, port retention and saving, and the existing settings and panel flows. Reviewed desktop dark and mobile light screenshots from the isolated fixture.
- `npx tsc -b`: passed.
- `npx oxlint src/components/debugger-settings.tsx server/debugger-ui.test.ts`: passed.
- Impeccable detector on `src/components/debugger-settings.tsx`: no findings.
- `npm run check:docs`: passed description and local-link checks. `git diff --check`: passed.

## Application boundary

Verification used an isolated browser fixture; no app build, deployment, launcher execution, or running server restart was performed. The user must build and apply the change to update the running UI. Physical-device verification remains pending.
