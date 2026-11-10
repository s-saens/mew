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
