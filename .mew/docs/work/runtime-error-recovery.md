---
title: "Drawing and workspace runtime error recovery"
description: "Records drawing and workspace error recovery, including the November 17 project error screen redesign, local verification, and runtime application limits."
created: "2026-11-02"
updated: "2026-11-17"
---

## Purpose and behavior

A reported drawing failure left only the workspace background visible after building without restarting the server. The drawing entry points had Suspense for pending imports but no local error boundary. The asynchronous startup catch also could not catch later React render failures.

Both drawing entry points now use a shared deferred wrapper. Loading stays visible in a closable dialog, and rejected imports, invalid modules, or render failures show a local alert. Closing preserves the surrounding document and agent input. A root boundary provides recovery for failures outside a local boundary. Existing startup and workspace-import failures use the same workspace recovery screen. Recovery offers manual refresh and conditional server-restart guidance after an update; it never restarts the server or refreshes automatically.

Current contracts: [drawing board](../features/terminals-agents-automation/agent-drawing-editor.md) and [workspace initialization](../development/browser-startup.md#workspace-initialization).

## Local verification

- `node --test src/components/app-error-boundary.browser.test.ts`: 15 tests passed, none skipped. Routed Chromium fixtures exercised missing and invalid drawing chunks, drawing render errors, Korean/English desktop/mobile alerts, preserved editable drafts, closing during loading, late module completion, healthy reopening with document props, root render/lazy-import failures, and manual refresh. The fixtures use the real boundaries and deferred wrapper with a stub drawing module.
- `node --test server/editor-paint-host-ui.test.ts server/agent-drawing-ui.test.ts packages/ui/src/i18n.test.ts`: 6 tests passed. Existing real-editor and agent drawing flows still open and save successfully; shared translations retain all three target languages and matching placeholders.
- `npm run build`: passed, including TypeScript project checks; the build retained its large-chunk warning. An earlier standalone `npx tsc -b` failed on concurrently edited project-dialog types and duplicate translation keys; the later required build passed after those external edits changed.
- Repository lint and targeted source/test lint passed with existing React warnings. The Impeccable detector returned no findings for the changed UI targets. The changed-file whitespace check passed. Desktop and mobile recovery screenshots were inspected. `npm run check:docs` passed with 644 descriptions and no local-link errors.
- `node --test src/app-bootstrap.browser.test.ts`: 2 passed and 2 failed. Startup grouping and startup-failure/authentication-timeout checks passed; the source-graph independence and authentication-bundle dependency checks failed. A read-only comparison substituting HEAD versions of `main.tsx` and `AppBootstrap.tsx` still produced the public-share-to-workspace chunk dependency. The stub-workspace fixture also includes deferred public-share dependencies (`public-share-page` → `CodePane` → `api/client`, plus editor packages), while its failing assertion scans every output module rather than only eager dependencies. These failures were not introduced by the new recovery imports; the existing checks remain unchanged.

## Remaining limits

The reported running installation was not modified or reproduced directly. The fix handles the observed failure class; it does not compare build and server versions or prove that version skew caused the original incident. A failed drawing render may discard its in-memory drawing. Browser and React import caching can retain a rejected module until refresh. General asynchronous event-handler failures remain outside React error boundaries.

The required build updates served assets, but no deployment, launcher, or application server start, stop, or restart was performed. Applying server-side changes remains a user operation. Browser checks use isolated fixtures rather than physical-device input or the running instance.

## Project error screen redesign

On November 17 a project view exception showed a small message in the top-left corner. The [project recovery contract](../features/appearance-accounts-operations/multi-project-mode.md#closing-switching-and-recovery) now presents the existing project selection action and a manual page refresh in a centered card, with scrolling for compact panels. This changes the recovery surface; the exception that prompted the report was not reproduced or identified.

The isolated Chromium fixture passed for a full workspace and a 280×240 panel, covering the error boundary, layout, project selection callback, and page refresh. `npm run build` passed with a large-chunk warning; targeted lint passed with four existing workspace effect/ref warnings. `npm run check:docs` validated 860 descriptions but reported 39 existing link errors, including the missing decisions README. The build updates served UI assets; no deployment or server lifecycle operation was performed. The actual reported exception and physical-device appearance remain unverified.
