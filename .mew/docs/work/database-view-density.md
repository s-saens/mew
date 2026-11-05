---
title: "Compact database views"
description: "Records the initial database density reduction and the November 5 adjustment to larger table cells and titles with shorter calendar days. Covers document-style isolation, local regression checks, and runtime verification limits."
created: "2026-10-31"
updated: "2026-11-05"
---

The [database feature contract](../features/document-databases/document-databases-and-catalog.md#multiple-views-and-item-details) owns the current dimensions and interaction behavior.

## October 31 density reduction

Reduced the space used by document databases after a report that table fields and other views were too large. All five views shared compact UI typography. Tables received smaller text and vertical padding; cards and boards received tighter spacing; calendar days and Gantt rows received smaller minimum heights.

The database surface resets inherited document typography. Document heading rules also exclude database controls, fixing the extra size and margins on embedded board and calendar headings. Table type/sort buttons, view tabs, date selectors, and addition bars retain their coarse-pointer target sizes. Gantt horizontal scale and date-editing calculations remain unchanged.

The added regressions failed against the previous code: the database surface inherited a 22px host font, and table inputs remained at 14px. Browser checks compare standalone and editor hosts with 22px surrounding text, 40px line height, and a heavier font weight. They measure table input fonts and row/header heights, view tabs, headings, card padding/gaps, calendar minima, and Gantt rows/bars in light and dark themes at 390px and 1100px. Existing scenarios also cover 320px view switching, cell editing, sorting, keyboard navigation, board dragging, date ranges, Gantt resizing/drawing, read-only access, and regular/collaborative table conversion. Desktop and mobile captures were reviewed; touch input is emulated.

`node --test server/database-layout-ui.test.ts server/database-table-ui.test.ts server/editor-table-database-ui.test.ts` passed all 7 tests with no skips. `npx tsc -b`, targeted `npx oxlint`, and `npm run check:docs` passed. Targeted lint retained two existing React warnings in `DatabaseCollection.tsx`; the design scan reported only the unchanged document blockquote border in `editor.css`. Browser fixture bundling retained existing dependency `use client` warnings. Scoped `git diff --check` passed.

No app build, deployment, server launch, or restart was performed. The user builds and applies the changes to the running instance. Postgres integration and physical-device verification were outside this styling change.

## November 5 table and calendar adjustment

Increased table header and value text by 2px, added 2px of padding on each side of table cells, and increased editable and read-only DB titles by 4px after feedback that tables were too small. Table typography is scoped to the field grid, including selection tags and content-sizing mirrors; shared detail editors retain their existing sizes. Reduced calendar day minima and inner spacing to show a shorter month grid while retaining date buttons, event-driven growth, and the full-title agenda.

Updated browser regressions measure fonts, padding, row/header heights, and calendar minima in embedded and standalone hosts, light/dark themes, and desktop/emulated-touch layouts. The layout and conversion tests passed; all five table tests passed on rerun after allowing half-pixel collapsed-border rounding in the header-height assertion. Desktop table/calendar and mobile calendar captures were reviewed.

`npm run build` (including TypeScript) and `npm run lint` passed; lint retained existing React warnings and the build reported large chunks. `npm run check:docs` passed all 714 descriptions but failed on 42 missing links outside the changed documents, including missing `.mew/docs/MOC.md`, `decisions/MOC.md`, and `decisions/README.md`. Scoped link checks for the changed documents and `git diff --check` passed.

The build updated local `dist/` assets. No deployment, launcher execution, or server lifecycle operation was performed. Physical-device and live Postgres verification remain outside this styling change.
