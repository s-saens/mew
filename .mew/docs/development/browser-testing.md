---
title: "UI browser testing with Chromium"
description: "Defines managed Chromium prerequisites, MEW_CHROMIUM_EXECUTABLE, and the shared Playwright helper for test-owned headless browsers. Separates UI automation from ordinary Chrome, and covers cleanup and execution limits."
created: "2026-11-04"
updated: "2026-11-05"
---

Mew's normal UI tests under `server/*-ui.test.ts` use Playwright's Chromium or an installed Chromium executable through Playwright. `server/test-browser.ts` owns the shared `connectTestBrowser()` helper. Each call launches an isolated headless browser with Chromium sandboxing enabled and a 15-second startup timeout. The caller owns the returned browser and must close it during test cleanup.

## Prerequisites and executable discovery

Source setup/update prepare the required browser. After a manual `npm ci`, run `npm run browsers:install` before browser tests; `npm run browsers:check` checks readiness without installing. Default preparation requires Chromium and its headless shell pinned by the installed Playwright dependency even if system Chromium exists. Overrides and platform prerequisites follow the [browser dependency contract](browser-dependencies.md).

The helper uses `domBrowserExecutable()` from `server/browser-dom-executable.ts`. Discovery checks `MEW_CHROMIUM_EXECUTABLE`, the legacy `MEW_BROWSER_EXECUTABLE` override, Playwright's bundled Chromium, then installed Chromium locations. Overrides must be absolute executable paths. Ordinary Google Chrome is reserved for external browsing and login and is not an automatic fallback for UI tests. Test selection follows this automation policy even when a fixture uses an external URL.

An Obscura installation or running CDP service is not required. `MEW_TEST_BROWSER_CDP_URL` and `MEW_DOM_BROWSER_EXECUTABLE` are no longer used. If the legacy override previously pointed to Obscura, remove it or set `MEW_CHROMIUM_EXECUTABLE` to Chromium. Prefer the purpose-specific override; the legacy variable also affects external browsing and login. Missing executables, invalid overrides, and launch failures leave browser verification incomplete; report the actual error.

## Writing and running tests

Import `connectTestBrowser` from `./test-browser.ts` in normal UI test files. Create the test's contexts and pages from the returned browser and register cleanup immediately:

```ts
const browser = await connectTestBrowser()
t.after(() => browser.close())
const page = await browser.newPage()
```

Closing this browser closes its contexts and terminates the test-owned browser process. Tests can also close individual contexts or pages earlier. The helper does not attach to an existing browser or manage an external browser service.

Run the focused Node test files relevant to the change. Browser tests may launch their isolated test browsers; follow the repository's [execution rules](getting-started.md#execution-and-verification). Agents must not deploy, run the Mew launcher, or start, stop, or restart application servers. Implementation work still requires `npm run build` and applicable tests, lint, and [document checks](../README.md).

Tests under `server/` use the Node TypeScript configuration without DOM globals. In Playwright callbacks, obtain the document through the evaluated element's `ownerDocument`, as required by the [development rules](getting-started.md#execution-and-verification).

## Scope and limitations

This helper covers normal UI tests. Mew's application DOM browser uses this Chromium resolver for loopback URLs and ordinary Google Chrome for other URLs (`server/dom-browser.ts`). External DOM browsing still uses Playwright and rrweb; the login desktop retains its separate native video and input lifecycle (`server/login-desktop.ts`). Native RTC, browser-conformance, and platform-specific checks retain the actual engines and devices their assertions require.

Helper unit tests verify browser selection and launch behavior without launching a browser. They do not establish that every UI assertion or screenshot passes. Record actual browser results and remaining blockers separately from build success. [ADR 0137](../decisions/0137-browser-purpose-routing.md) records browser selection by purpose, building on the [Chromium restoration](../decisions/0136-chromium-browser-restoration.md).
