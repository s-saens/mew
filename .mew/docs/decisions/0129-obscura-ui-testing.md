---
title: "0129 — Obscura CDP for normal UI tests"
description: "Selects an externally managed local Obscura CDP endpoint for normal Playwright UI tests, with a shared connection helper and no Chromium launch fallback. Retains application-browser and native-conformance requirements and records compatibility limits."
created: "2026-11-04"
updated: "2026-11-04"
status: "accepted"
---

## Context

Normal UI tests launched Playwright Chromium independently. The requested change replaces that test browser with a local Obscura instance while preserving Playwright test interactions and the application's separate browser behavior.

## Decision

Route normal `server/*-ui.test.ts` browser setup through `connectTestBrowser()` in `server/test-browser.ts`. Connect over CDP to `ws://127.0.0.1:9222` by default, with `MEW_TEST_BROWSER_CDP_URL` selecting another test endpoint. Require an existing rendering-enabled Obscura service. The helper neither starts nor stops it and provides no Chromium launch fallback.

Keep Obscura binaries outside the repository. The user owns service lifecycle operations under the existing [execution rules](../development/getting-started.md#execution-and-verification). Retain application DOM-browser, login-desktop, native RTC, and browser-conformance requirements where an actual engine or platform behavior is part of the assertion.

## Alternatives and rationale

Keeping direct Chromium launches would not carry out the requested test-browser replacement. A fallback could let missing Obscura prerequisites pass unnoticed by running a different engine. Managing the Obscura service inside tests would conflict with the user-owned lifecycle boundary.

A shared connection helper makes endpoint selection and connection failures consistent while leaving test fixtures and assertions in their owning tests. Upstream documents Playwright CDP connections, but that interface alone does not prove complete browser compatibility.

## Consequences

The user must prepare and run Obscura before browser verification. Missing endpoints block affected UI checks. Test cleanup closes test resources and the CDP connection, leaving the service under user control.

Migrating the source does not establish that every test passes or remove all Chromium dependencies. Obscura's rendering and Web API differences can require focused diagnosis; native browser evidence remains necessary where the tested behavior depends on it. Passing unit tests and a build are reported separately from real Obscura browser checks.

The [browser-testing contract](../development/browser-testing.md) owns prerequisites, configuration, usage, and limitations. The [work record](../work/obscura-ui-testing.md) owns actual checks and application status.
