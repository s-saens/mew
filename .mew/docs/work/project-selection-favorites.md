---
title: "Project selection favorites transition"
description: "Records the incomplete transition to a single account-starred catalog, default-collapsed nested projects, sibling reordering, hierarchy guides, themed favorite stars, local checks, and remaining regressions."
created: "2026-11-16"
updated: "2026-11-18"
---

The requested change replaces the My/All selector with a shared catalog, account-specific stars, favorites-first ordering, drag handles, and collapsible subprojects. It also retains the active workspace when the last star is removed.

The implementation is incomplete. The current draft changes the selection surface and empty-favorites behavior. It still needs keyboard and shortcut integration, reliable reordering with collapsed or filtered rows, tests for the new catalog controls and account isolation, and updates to the existing navigation and usage contracts. The existing shortcut-order fixture fails against the draft selector. Do not treat the draft as verified or deployed.

Local verification: `node --test src/utils/project-workspace-view.test.ts` passed five tests. `node --test src/components/project-shortcut-order.test.ts src/utils/project-workspace-view.test.ts` failed three shortcut-order tests and passed five workspace-view tests. `npm run build` passed on the draft. `npm run lint` completed with warnings. `npm run check:docs` validated 824 descriptions but failed on 39 existing missing or invalid links. The source was not deployed and no server was restarted.

## Default collapsed nested projects — 2026-11-17

The project selection catalog starts nested projects collapsed beneath their nearest registered parent, including projects with different favorite status. Search temporarily reveals matching descendants and ancestors, then restores expansion choices when cleared. Visible sibling reordering remains available while branches are collapsed. See the [project selection contract](../features/projects-files-search/opening-projects-tabs-and-groups.md).

Local verification passed the new desktop/mobile browser regression, catalog snapshot tests, hierarchy tests, the project build, and lint with warnings. The separate project-add browser test failed at its existing catalog request count assertion (four requests versus two expected); the prior catalog already issues snapshot and discovery requests separately. The documentation check reported 39 existing link errors. No deployment or server restart was performed.

## Nested project reordering and guides — 2026-11-17

The selector keeps hierarchy based on actual paths. Reordering is limited to siblings with the same favorite status, and the drag preview reflects valid drop positions. Handles align along the left edge, vertical guides show ancestor levels, and rows without children reserve the expansion-control space. The current behavior is defined in the [project selection contract](../features/projects-files-search/opening-projects-tabs-and-groups.md).

Local Chromium tests covered mouse and touch dragging, keyboard movement, expanded subtrees, invalid destinations, and guides at 320, 390, and 1100 pixels. The shared tab drag test and build passed; lint completed with warnings. Documentation descriptions passed, while the link check reported 39 existing errors. No deployment or server restart was performed. Physical-device verification remains outstanding.

## Favorite star color — 2026-11-18

The filled star now uses the theme's primary color so favorites stand out in the [project selection catalog](../features/projects-files-search/opening-projects-tabs-and-groups.md#select-and-organize-projects). The Chromium regression verified the filled star and the unfilled outline in the mobile selector. The build passed and lint completed with warnings. Documentation descriptions passed, and the link check reported 39 existing errors. Verification was local.
