---
title: "Task calendar and row layout"
description: "Records the 2026-11-04 right-hand calendar agenda and document-before-date row controls, local checks, and Obscura connection blockers for browser regression verification."
created: "2026-11-04"
updated: "2026-11-04"
---

The [task-panel feature](../features/projects-files-search/task-panel-list-calendar-and-gantt.md#dates-calendar-and-gantt) owns the current behavior. This change keeps the selected day's tasks visible beside the month when a wide, short panel would otherwise push them below it.

## Implementation

`src/components/task-panel.css` names the existing task-panel container and enables size queries against its allocated width and height. The calendar uses two columns when the panel is wider than tall and at least 640px wide; narrower and square/portrait panels retain the stacked layout. The minimum width leaves room for seven calendar columns and task controls. Each column scrolls independently in the horizontal layout, including short panels.

`src/components/task-calendar.tsx` groups month navigation and the date grid in one column. CSS reflows the existing month and agenda without remounting them, preserving selection, keyboard navigation, and task editing.

## Local verification

- `npm run build` passed, including TypeScript project checks. Vite reported its existing large-chunk warning.
- `npm run lint` completed with repository warnings outside this change. Focused `oxlint` checks for the changed component and regression test passed without diagnostics.
- `node --test src/utils/task-schedule.test.ts src/utils/task-list-session.test.ts` passed all 27 checks for schedule membership, task state, and persistence.
- `npm run check:docs` passed all 695 description checks, then reported 42 missing-link errors outside the changed documents, including missing `.mew/docs/MOC.md` and decision entrypoints. The changed documents' descriptions and local link targets were checked separately.
- Added `server/task-calendar-layout-ui.test.ts` to check wide, tall, square, 640px/639px boundary, 320px, and short panels; independent scrolling; horizontal bounds; preserved selected tasks; and mouse/keyboard date selection.
- `node --test server/task-calendar-layout-ui.test.ts` failed before rendering because the shared helper could not connect to the configured Obscura CDP service. Browser assertions, screenshots, and physical-device verification remain unverified. No browser or application service was started.
- The Impeccable detector reported only the pre-existing task swipe `padding-right` transition; this change adds no animation.

The required build updates local `dist/` assets. No deployment, launcher execution, or server lifecycle operation was performed.

## Document and date order follow-up

The follow-up places the document icon immediately before the date in list and calendar rows, making dates the rightmost ordinary control. `TaskDateStatus` changes DOM order so keyboard traversal matches the visual order. File opening, date editing, and the separately revealed swipe-delete action retain their behavior. The [internal document link contract](../development/task-list.md#internal-document-links) owns this order; earlier dated feature records describe the previous arrangement.

The existing isolated calendar layout test now renders `TaskDateStatus` with linked documents. It checks document → date DOM and visual order at every panel size, file opening, and Tab focus from document to date, in addition to the calendar layout checks.

Follow-up verification: `npm run build` passed, including TypeScript checks. `npm run lint` completed with existing repository warnings, and focused lint passed without diagnostics. The design detector reported no findings for the changed component. Changed-document descriptions and links passed; the full documentation check still reported 42 unrelated missing links. The updated browser regression could not connect to Obscura before rendering, so visual placement, file-opening interaction, and keyboard focus remain unverified in the browser. No services were started or restarted.
