---
title: "UI browser testing with Obscura"
description: "Defines Obscura CDP prerequisites, user-owned service startup, MEW_TEST_BROWSER_CDP_URL, shared Playwright test connections, and current compatibility limits for Mew UI tests. Distinguishes UI fixtures from application browsers and native browser-conformance checks."
created: "2026-11-04"
updated: "2026-11-04"
---

Mew's normal UI tests under `server/*-ui.test.ts` use Playwright through a running Obscura CDP endpoint. `server/test-browser.ts` owns the shared `connectTestBrowser()` connection. The helper connects to an existing service and does not launch or stop Obscura. Follow the repository's [execution rules](getting-started.md#execution-and-verification); agents must leave service lifecycle operations to the user.

## Prerequisites and endpoint

Install a rendering-enabled Obscura release for the host platform and verify its archive checksum. Keep `obscura` and `obscura-worker` together in their extracted directory and expose the CLI through `PATH`. Binaries remain outside Git. The locally prepared baseline is the official Linux x64 v0.2.6 release. Official unsuffixed archives include rendering; a source build needs the `render` feature. Follow the upstream [installation guide](https://github.com/h4ckf0r0day/obscura/blob/main/docs/Installation.md).

Before running UI tests, the user starts the local service:

```bash
obscura serve --host 127.0.0.1 --port 9222 --allow-private-network
```

Private-network access allows the test browser to reach local fixture URLs. Keep this test endpoint on loopback. Tests connect to `ws://127.0.0.1:9222` by default. Override it for an already-running test endpoint with:

```bash
MEW_TEST_BROWSER_CDP_URL=ws://127.0.0.1:9333 node --test server/agent-harness-ui.test.ts
```

The override changes only the test connection address. It does not configure or start the service. If the endpoint is absent or incompatible, report the connection failure and leave browser verification incomplete. The helper provides no Chromium launch fallback.

## Writing and running tests

Import `connectTestBrowser` from `./test-browser.ts` in normal UI test files and await it in place of launching a browser. Create new test-owned contexts and pages rather than reusing the service default context. The helper exposes only contexts it created and closes those contexts before disconnecting; tests should still close pages or contexts in their own cleanup where needed. The upstream [Playwright guide](https://github.com/h4ckf0r0day/obscura/blob/main/docs/Use-with-Playwright.md) specifies `connectOverCDP`; closing that connection leaves the Obscura service running.

Run the focused Node test files relevant to the change after the endpoint is ready. Tests continue to use their existing fixture setup and assertions. Browser access does not authorize starting the Mew launcher or application servers. Implementation work still requires `npm run build` and applicable tests, lint, and [document checks](../README.md).

Tests under `server/` use the Node TypeScript configuration without DOM globals. In Playwright callbacks, obtain the document through the evaluated element's `ownerDocument`, as required by the [development rules](getting-started.md#execution-and-verification).

## Scope and limitations

This connection policy covers normal UI tests. Mew's application DOM browser and login desktop retain their own browser dependencies and lifecycles. Native RTC, browser-conformance, and platform-specific checks retain the actual engines and devices their assertions require.

Obscura's CDP support does not establish Chromium equivalence. Upstream documents gaps in service workers, native media, Web APIs, CSS, compositor behavior, and editor interaction. Source migration and passing helper unit tests do not prove that every migrated UI assertion or screenshot works. Record actual browser results and remaining blockers separately from build success.

[ADR 0129](../decisions/0129-obscura-ui-testing.md) records the choice. The [work record](../work/obscura-ui-testing.md) owns installation and verification evidence.
