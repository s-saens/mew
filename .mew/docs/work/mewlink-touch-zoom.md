---
title: "Mewlink launcher touch zoom"
description: "Records the 2026-11-02 source extension of workspace page-pinch suppression to the Mewlink connection and app launchers, dashboard exclusion, local verification, and the boundary before central deployment and physical-device checks."
created: "2026-11-02"
updated: "2026-11-02"
---

## Purpose and resulting behavior

Extend the existing workspace touch policy to the outer `mew.run` device connection page and the nested `app.mew.run` launcher. Each document needs its own policy because iframe touch events do not reach parent documents. Install the policy early in the connection and app entries; leave the central account dashboard outside its scope.

The launcher helper imports the shared host event policy, adds the viewport scale limit while preserving existing directives, and enables scoped `pan-x pan-y` touch behavior through a root data attribute. Cleanup removes listeners and restores the previous viewport content and attribute. Editor-local font pinching in the installed UI remains available; the helper does not intercept desktop wheel or keyboard zoom.

The canonical source contract is [Launcher touch zoom](../development/remote-access.md#launcher-touch-zoom). [ADR 0112](../decisions/0112-workspace-touch-zoom.md) records the document scope and accessibility trade-off. The earlier [workspace implementation record](editor-touch-zoom.md) remains historical evidence for the host change.

## Local verification

`npm run check:docs` validated 650 descriptions with no metadata errors. The repository link check failed on an unrelated absolute `/api/asset` link in `.mew/tasks/Image preview and attachment editing.md`; that task file was left unchanged.

- `node --test mewlink/test/pinch-zoom.browser.test.ts`: passed. The route-mocked cross-origin launcher chain verified trusted Chromium pinch and pan with actual CodePane and Hotview editors, unchanged top-level page scale and source text, Safari synthetic gesture cancellation, listener removal, replacement of existing viewport scale limits, and viewport/root-state restoration. No HTTP fixture server was started.
- `npm run check --prefix mewlink`: Worker and browser type checks passed.
- `npm run build --prefix mewlink`: passed. A local check of the generated HTML and static JavaScript import graph confirmed the policy is included in connection/app startup and excluded from dashboard startup.
- `npm run build` in the parent checkout: passed, including TypeScript checks.
- Scoped Oxlint checks for the changed launcher TypeScript and browser test: passed.
- Impeccable detection over the changed launcher targets: no findings.
- Scoped `git diff --check`: passed in both repositories.

These local checks do not establish physical-device gesture behavior or production application.

The central implementation is recorded in the independent Mewlink repository as `0166384` (`fix: preserve editor touch zoom through launcher frames`).

## Application boundary

These are source changes only. No central deployment, launcher execution, or server start, stop, or restart was performed. They have no live effect at `mew.run` until the user applies the central source separately. Actual Safari and Android pinch behavior and OS accessibility interactions remain unverified.
