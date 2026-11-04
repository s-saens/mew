---
title: "Header resource control identity"
description: "Records the 2026-11-04 repair for resource and layout controls sharing a React key and accumulating resource buttons. Covers account-scoped identities, reconciliation regression checks, local build and lint results, and unavailable Obscura browser verification."
created: "2026-11-04"
updated: "2026-11-04"
---

## Purpose and resulting behavior

The resource gauges accumulated across the header. `HeaderResources` and its sibling `LayoutPresets` both used the account email as their React key. During reconciliation, duplicate keys could leave resource controls behind instead of removing them.

Both controls now prefix their account-scoped keys with their component role. Account changes retain the intended remount behavior, while sibling identities stay distinct. The [system resources contract](../features/appearance-accounts-operations/system-resources-and-processes.md#header-identity) owns the current behavior.

## Verification

- `node --test server/header-resource-identity.test.ts`: passed. The test reads the actual header key expressions from `App.tsx` and renders the real resource control in an isolated DOM fixture. Eighteen account/layout transitions retain one resource button and one polling timer; permission removal and unmount clear the control and abort its previous requests. No duplicate-key warning or runtime error was emitted.
- An in-memory run with the original key expressions failed the same regression: two resource buttons remained where one was expected. No working-tree source was reverted for this comparison.
- `npm run build`: passed, including `tsc -b`; Vite reported its large-chunk warning.
- `npx tsc -b`: passed again after adding the regression test.
- `npm run lint`: exited successfully with warnings. Focused lint on `src/App.tsx` and the new regression also exited successfully; its warnings concern existing hook dependencies in `App.tsx`.
- `node --test server/header-controls-ui.test.ts server/header-resources-polling-ui.test.ts`: both blocked by failure to connect to the configured Obscura CDP service. Their layout and browser-polling assertions did not execute.
- `npm run check:docs`: description validation passed with zero errors; the full link check reported 42 missing-target errors outside the changed documents, including the referenced `.mew/docs/decisions/README.md`. The existing link checker found no errors in the two changed documents.

## Application boundary

No deployment, launcher execution, or server lifecycle operation was performed. Browser layout and visual verification remain incomplete because the configured Obscura CDP endpoint could not be reached. The build updates the frontend assets served from `dist/`; an already-open page needs a reload to discard existing orphan DOM nodes.
