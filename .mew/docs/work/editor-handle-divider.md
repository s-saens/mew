---
title: "Editor handle divider"
description: "Records the editor panel handle's continuous bottom divider, browser checks, and local verification limits."
created: "2026-11-17"
updated: "2026-11-17"
---

The editor panel's move handle lacked the bottom border already present under the adjacent tab bar. Its divider now continues across the handle, following the [workspace layout contract](../development/ui-workspace-layout.md#workspace-panel-layout).

The unified editor browser test passed with light and dark border alignment and handle maximization and restoration. The broader `server/dock-maximize-ui.test.ts` failed later on an unrelated menu border-radius expectation: 0px expected, 6px observed. `npm run build`, `npx tsc -b`, and `npm run lint` passed; lint reported warnings. The documentation description check passed; the link check reported 39 existing errors involving missing paths and a task asset URL. The build updated local `dist/`; no server was restarted and no deployment was performed. The running workspace was not manually checked.
