---
title: "Compact context-menu appearance"
description: "Records the 2026-10-30 adjustment of shared context menus to workspace-colored backgrounds, rounded containers, and smaller desktop rows, with local verification and pending application to the running instance."
created: "2026-10-30"
updated: "2026-10-30"
---

Adjusted shared right-click menus to blend with the workspace background and reduce row spacing. The [shared action-menu contract](../development/ui-contracts.md#shared-action-menus) owns the current appearance and interaction requirements.

The default menu uses the solid workspace surface token for both opaque and translucent backgrounds. Its container has a 6px corner radius and 3px internal padding. Desktop rows shrink from 28px to 26px, with padding reduced from 4px/8px to 3px/6px and a 3px corner radius. Text, icons, coarse-pointer target heights, and header dropdown styling retain their existing sizes.

## Verification

- `node --test server/action-menu-ui.test.ts` passed without skips. The updated fixture distinguishes workspace and raised colors and checks five menu wrappers across desktop/mobile, light/dark, and solid/gradient variants. It also verifies keyboard navigation, modal focus, viewport/dock bounds, outside-click handling, table clipboard actions, and unchanged header/project/command dropdown styling.
- Reviewed isolated desktop dark and mobile light/gradient captures before and after the change.
- `node --test server/editor-context-menu-ui.test.ts` passed all 5 tests without skips, covering editor selection colors, touch-selection menus, selection preservation, scoped actions, and desktop selection behavior.
- `npx tsc -b`, `npx oxlint server/action-menu-ui.test.ts`, and `git diff --check` passed.
- `npm run check:docs` passed: 558 descriptions, no metadata or document link errors.

No app build, deployment, server startup, or restart was performed. Applying the change to the running instance and checking physical touch devices remain pending.
