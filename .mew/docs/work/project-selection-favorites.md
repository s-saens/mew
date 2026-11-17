---
title: "Project selection favorites transition"
description: "Records the incomplete transition from My/All project selection to a single account-starred catalog, local checks, and remaining regressions."
created: "2026-11-16"
updated: "2026-11-16"
---

The requested change replaces the My/All selector with a shared catalog, account-specific stars, favorites-first ordering, drag handles, and collapsible subprojects. It also retains the active workspace when the last star is removed.

The implementation is incomplete. The current draft changes the selection surface and empty-favorites behavior. It still needs keyboard and shortcut integration, reliable reordering with collapsed or filtered rows, tests for the new catalog controls and account isolation, and updates to the existing navigation and usage contracts. The existing shortcut-order fixture fails against the draft selector. Do not treat the draft as verified or deployed.

Local verification: `node --test src/utils/project-workspace-view.test.ts` passed five tests. `node --test src/components/project-shortcut-order.test.ts src/utils/project-workspace-view.test.ts` failed three shortcut-order tests and passed five workspace-view tests. `npm run build` passed on the draft. `npm run lint` completed with warnings. `npm run check:docs` validated 824 descriptions but failed on 39 existing missing or invalid links. The source was not deployed and no server was restarted.
