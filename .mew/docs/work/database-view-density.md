---
title: "Compact database views"
description: "Records the 2026-10-31 reduction of database typography, row heights, card spacing, calendar day minima, and Gantt bars, including document-style isolation, local regression checks, and pending user application."
created: "2026-10-31"
updated: "2026-10-31"
---

Reduced the space used by document databases after a report that table fields and other views were too large. All five views now share compact UI typography. Tables have smaller text and vertical padding; cards and boards have tighter spacing; calendar days and Gantt rows have smaller minimum heights. The [database feature contract](../features/document-databases/document-databases-and-catalog.md#multiple-views-and-item-details) owns the dimensions and interaction behavior.

The database surface resets inherited document typography. Document heading rules also exclude database controls, fixing the extra size and margins on embedded board and calendar headings. Table type/sort buttons, view tabs, date selectors, and addition bars retain their coarse-pointer target sizes. Gantt horizontal scale and date-editing calculations remain unchanged.

The added regressions failed against the previous code: the database surface inherited a 22px host font, and table inputs remained at 14px. Browser checks compare standalone and editor hosts with 22px surrounding text, 40px line height, and a heavier font weight. They measure table input fonts and row/header heights, view tabs, headings, card padding/gaps, calendar minima, and Gantt rows/bars in light and dark themes at 390px and 1100px. Existing scenarios also cover 320px view switching, cell editing, sorting, keyboard navigation, board dragging, date ranges, Gantt resizing/drawing, read-only access, and regular/collaborative table conversion. Desktop and mobile captures were reviewed; touch input is emulated.

`node --test server/database-layout-ui.test.ts server/database-table-ui.test.ts server/editor-table-database-ui.test.ts` passed all 7 tests with no skips. `npx tsc -b`, targeted `npx oxlint`, and `npm run check:docs` passed. Targeted lint retained two existing React warnings in `DatabaseCollection.tsx`; the design scan reported only the unchanged document blockquote border in `editor.css`. Browser fixture bundling retained existing dependency `use client` warnings. Scoped `git diff --check` passed.

No app build, deployment, server launch, or restart was performed. The user builds and applies the changes to the running instance. Postgres integration and physical-device verification were outside this styling change.
