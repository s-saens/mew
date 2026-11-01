---
title: "Localhost browser entry and host port selection"
description: "Records the 2026-11-01 hamburger entry, host-wide TCP port list, disabled Mew ports and live navigation guard, browser start-page lifecycle, regression checks, screenshots, and the boundary before user application."
created: "2026-11-01"
updated: "2026-11-01"
---

## Purpose and result

The user requested a hamburger-menu button that opens the localhost browser with all current host ports, permits opening apps by selecting a port, and identifies Mew's own port while preventing access to it.

**Menu → Localhost browser** now opens the existing Browser panel at its port list, even when that panel already displays an app. The list includes canonical localhost and wildcard TCP listeners outside command sessions, sorted and deduplicated, with refresh and recoverable error states. Actual registered Mew listeners are labelled **Mew** and disabled; configured/reserved blocked numbers are labelled unavailable. The same live port registry protects typed addresses and redirects, including Mew listeners registered after a browser connection opens.

The list alone opens neither a browser socket nor Chromium. Selecting an allowed port opens the existing DOM browser. Its **Open ports** button closes the isolated page context and loads the list again. Address entry, localhost link capture, command-port behavior, external HTTP(S), docking, and account/permission cleanup remain available. See the [current contract](../development/port-preview.md#host-port-discovery), [feature](../features/browser-android-remote-desktop/server-browser-login-and-popups.md), [usage guide](../../../docs/guides/browser.md#find-running-localhost-apps), and [decision 0108](../decisions/0108-localhost-browser-port-picker.md).

## Changed files

- Discovery and API: `server/dom-browser-ports.ts`, `server/dom-browser-ports.test.ts`, `server/api.ts`, and `shared/dom-browser.ts`.
- Live Mew listener policy: `server/dom-browser.ts` and `server/dom-browser.test.ts`.
- Menu, start page, and translations: `src/App.tsx`, `src/components/DomBrowserPanel.tsx`, `src/components/DomBrowserPorts.tsx`, and `packages/ui/src/ui-messages.ts`.
- Browser regressions: `src/components/dom-browser-entry.browser.test.ts`, `src/components/dom-browser-panel.browser.test.ts`, `src/components/dom-browser-ports.browser.test.ts`, and `server/dom-browser-flow.browser.test.ts`.
- Current documentation: `.mew/docs/development/port-preview.md`, `.mew/docs/development/ui-contracts.md`, `.mew/docs/features/browser-android-remote-desktop/server-browser-login-and-popups.md`, and `docs/guides/browser.md`.
- Decision and work record: `.mew/docs/decisions/0108-localhost-browser-port-picker.md` and this file.

## Verification

The final combined run passed 43 tests with no skips:

```bash
node --test server/dom-browser-ports.test.ts server/command-ports.test.ts server/dom-browser.test.ts server/dom-browser-flow.browser.test.ts src/components/dom-browser-entry.browser.test.ts src/components/dom-browser-panel.browser.test.ts src/components/dom-browser-ports.browser.test.ts src/utils/dom-browser-scroll.test.ts src/utils/local-browser-links.test.ts packages/ui/src/i18n.test.ts
```

The tests cover Linux live listener addition/removal, IPv4/IPv6 and macOS/Windows parser fixtures, permission checks and revocation during scans, sorted deduplication, Mew marking, cancellation/timeouts, malformed data, empty results, retries, and prevention of stale UI updates. Actual Chromium checks cover desktop/mobile hamburger entry, reopening the list from an app, permitted selection, disabled Mew rows, no eager browser socket, context cleanup, existing forms/assets/navigation, and scroll and clock-skew regressions. The full host/viewer test selects its fixture app from the list and confirms that it remains interactive. A two-server regression verifies that an existing connection cannot navigate into a later Mew listener.

The first integrated panel run exposed a missing test-transport export after adding the list; extending that fixture with `mewFetch` fixed it. The same-link regression now waits for the requested navigation rather than assuming React effects have completed when the click returns. Review also found the old copied blocked-port set did not include a later server; using the live registry and adding the two-server regression fixed it.

`npm run build` passed with the large-chunk warning. Scoped oxlint passed with React state-synchronization warnings in the browser and App, plus the App's dependency warning. Documentation checks and `git diff --check` passed. The Impeccable detector reported no findings on the changed app and browser UI. Reviewed desktop/mobile list screenshots and the complete mobile browser toolbar/list using compiled app styles.

## Application and remaining limits

The build updated local UI assets. No deployment, launcher execution, or Mew server start, stop, or restart was performed; the user applies the new API and listener registry to the running host. Current contracts document the endpoint and its existing Mewlink transport path; actual external-network Mewlink access and physical devices were not verified.

Discovery is a snapshot of OS-visible TCP listeners, not an HTTP health check. Some selectable ports may serve other protocols, and ports can close after listing. LAN-only bindings, separate network namespaces, actual macOS/Windows execution, and OS permission-dependent visibility remain unverified or excluded as documented. Returning to the list discards the previous page's temporary login/storage. Existing unrelated worktree changes were excluded from this task.
