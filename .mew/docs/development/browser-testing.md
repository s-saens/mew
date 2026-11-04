---
title: "UI browser testing with Chromium"
description: "Defines local Chrome/Chromium discovery, MEW_BROWSER_EXECUTABLE, and the shared Playwright helper that launches and closes test-owned headless browsers. Covers execution restrictions, cleanup, and the boundary between UI fixtures and native browser checks."
created: "2026-11-04"
updated: "2026-11-04"
---

Mew's normal UI tests under `server/*-ui.test.ts` use a local Chrome/Chromium executable through Playwright. `server/test-browser.ts` owns the shared `connectTestBrowser()` helper. Each call launches an isolated headless browser with Chromium sandboxing enabled and a 15-second startup timeout. The caller owns the returned browser and must close it during test cleanup.

## Prerequisites and executable discovery

The helper uses `domBrowserExecutable()` from `server/browser-dom-executable.ts`. Set `MEW_BROWSER_EXECUTABLE` to an absolute executable path when needed. Otherwise, discovery checks Playwright's bundled Chromium first, then standard system Chrome/Chromium locations. macOS discovery includes apps installed in the current user's `Applications` directory.

An Obscura installation or running CDP service is not required. `MEW_TEST_BROWSER_CDP_URL` and `MEW_DOM_BROWSER_EXECUTABLE` are no longer used. If `MEW_BROWSER_EXECUTABLE` previously pointed to Obscura, remove the override or change it to Chrome/Chromium. Missing executables, invalid overrides, and launch failures leave browser verification incomplete; report the actual error.

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

This helper covers normal UI tests. Mew's application DOM browser also launches isolated Chrome/Chromium sessions (`server/dom-browser.ts`); the login desktop retains its separate video and input lifecycle (`server/login-desktop.ts`). Native RTC, browser-conformance, and platform-specific checks retain the actual engines and devices their assertions require.

Helper unit tests verify browser selection and launch behavior without launching a browser. They do not establish that every UI assertion or screenshot passes. Record actual browser results and remaining blockers separately from build success. [ADR 0136](../decisions/0136-chromium-browser-restoration.md) records the current browser runtime and test policy.
