---
title: "DOM browser theme synchronization"
description: "Records the 2026-11-03 synchronization of Mew dark/light mode with host Chromium and replayed pages, regression coverage, and the boundary before user-owned server application."
created: "2026-11-03"
updated: "2026-11-03"
---

## Purpose and result

Localhost pages in the internal Browser used the host browser's default appearance instead of Mew's theme. The Browser now supplies Mew's resolved dark/light preference before opening a page and updates it while the page stays open. Host JavaScript and replayed CSS receive the same preference; switching themes preserves app state. Navigation, new snapshots, and reconnect retain the current Mew mode. The [DOM browser contract](../development/port-preview.md#internal-dom-browser) owns the implementation, and the [browser guide](../../../docs/guides/browser.md#open-host-localhost-apps) explains the behavior and app-specific theme limits.

## Local verification

- Eleven tests passed across `server/dom-browser.test.ts`, `server/dom-browser-flow.browser.test.ts`, and `src/components/dom-browser-panel.browser.test.ts`. They cover command validation, initial mode before navigation, host `matchMedia` and replayed CSS, live changes in both directions, preserved app state, navigation, responsive layout, and reconnect.
- After simplifying the integration assertion helper, the host/viewer flow passed again together with all four `src/utils/dom-browser-scroll.test.ts` tests. Desktop dark and mobile light screenshots were inspected from temporary files outside the repository.
- `npm run lint` passed with existing React warnings. The UI detector reported no findings for `DomBrowserPanel.tsx`.
- The first build exposed a widened TypeScript string inference; an explicit dark/light return type corrected it. `npm run build` then passed, including TypeScript checks, with the existing large-chunk warning.
- `npm run check:docs` passed all 667 description checks but failed on one existing absolute `/api/asset` link in the unrelated, untracked `.mew/tasks/Image preview and attachment editing.md`. The four documents changed for this task passed metadata and local-link checks separately. `git diff --check` passed.

## Application boundary

Verification used isolated browser fixtures. Sites must support automatic color-scheme selection; explicit app theme settings remain under app control. Physical-device and live Mewlink behavior were not checked. No deployment, launcher execution, or Mew server start, stop, or restart was performed. The user must apply the updated server code; a UI build alone does not reload the running host handler.
