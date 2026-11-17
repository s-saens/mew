---
title: "Drawing and workspace runtime error recovery"
description: "Records drawing and workspace error recovery, the project error screen redesign, and the November 17 investigation of intermittent project-view exceptions and verified failure conditions."
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

## Investigation of intermittent project view exceptions

A later investigation examined the reported error while agent tabs were being closed. The project error boundary logs the exception and component stack to the browser console; no persisted copy of that incident was found after refresh. The screenshot attachment was created around 20:53 local time, shortly after a change recorded at 20:52 whose [work record](agent-runtime-settings.md) reports a local build. Neither timestamp proves that the affected browser requested an old asset or establishes when its workspace was loaded.

An isolated Vite build and Chromium reproduction established that rebuilding the same output directory removes older hashed chunks. An already-open client that first requests one of those chunks after the rebuild reaches the project error boundary. CDP captured the dynamic import failure and React lazy stack. An additional fixture with the actual agent panel reproduced the error when closing a shell tab opened a Codex session whose composer chunk was unavailable, and in the reverse direction for the terminal chunk. Both 404 and the direct server's HTML fallback produced the error. When a Codex tab had already loaded the shared composer chunk, closing it to reveal another Codex tab did not request that chunk again. These fixtures use mocked APIs and do not prove the reported incident had the same cause.

Two other conditional paths reached the same boundary in isolated Chromium fixtures. Closing a tab fails in the focus-restoration effect when `Element.checkVisibility` is unavailable; the experiment deliberately removed that method and did not establish the user's browser support. Closing the final agent tab also fails if reading the picker preference throws a storage `SecurityError`. Filling local storage until a write raised `QuotaExceededError` did not make reads fail in the tested browser. Neither condition was observed in the reported session.

The existing agent-close browser fixture returned its initial tab state even for saves, so its first tab-removal assertion timed out. A temporary fixture correction exposed a separate last-tab focus race involving removed desktop groups and the mobile runtime picker; no project-boundary exception was observed. The temporary fixture changes were reverted. Another isolated, same-event-batch experiment reproduced a closed tab returning through a stale state update; two separate mouse clicks closed both tabs without an exception. These findings do not establish the cause of the reported error.

Ten thousand synthetic event streams produced matching incremental and full conversation folds without a synchronous exception. In isolated Chromium with actual agent session views, a 15-minute desktop/mobile run closed 1,980 tabs without a boundary error, page error, or timeout. A second 15-minute run closed 1,980 tabs while mock messages streamed; its mock sessions remained idle. A separate 114-second run varied message timing and close order across 240 tab closures without an exception. A further 32 runs delayed mocked tab reads and writes while closing 192 tabs; eight additional runs forced reads to complete before or after closure, with 48 closures. Neither group observed an exception, timeout, or tab reappearance. Each run used fresh fixture pages and mocked APIs, not actual provider sessions or user conversations.

A further ten-minute desktop fixture kept one page and a draft open while creating and closing 972 tabs. It recorded no boundary or page errors; the original draft, tab, and one mock connection remained. After a separate short forced-GC comparison, DOM nodes returned to 305 and event listeners fell from 524 to 484, while heap usage rose from approximately 12.0 to 16.2 MB. This limited comparison cannot establish whether a leak exists. These fixtures used mock idle sessions and do not verify actual provider execution or physical devices.

`server/agent-prompt-feedback-ui.test.ts` passed. Two other existing browser tests, `server/agent-history-preview-ui.test.ts` and `server/agent-work-details-ui.test.ts`, timed out looking for expected buttons; both failed at the same steps using their unmodified HEAD test sources, with no captured page error or project-boundary log. The tests do not replace the missing incident stack. No application code, server lifecycle operation, or deployment was involved in this investigation.
