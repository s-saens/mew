---
title: "Task document button position"
description: "Records the restoration of the list and calendar task document button after the date, local verification, and the existing build and documentation-check blockers."
created: "2026-11-10"
updated: "2026-11-10"
---

# Task document button position

Restore the document button to the right edge after the date in list and calendar rows. The [task panel contract](../development/task-list.md#internal-document-links) describes focus order, document opening, and touch alignment.

The calendar layout browser regression passed at desktop and narrow widths, including document opening, flush callback, and keyboard order. The task panel browser regression passed. `npm run lint` passed with warnings. `npm run build` and `npx tsc -b` failed on the existing upload API type mismatch at `src/api/client.ts:1997`; the unrelated editor API type has pending changes. `npm run check:docs` passed description validation but reported 38 existing link errors, including missing documentation entry points. The running application was not restarted or verified; build verification remains incomplete.
