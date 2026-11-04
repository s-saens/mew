---
title: "Obscura UI test browser migration"
description: "Historical Obscura work, superseded by the Chromium restoration under ADR 0136. Records the 2026-11-04 local Obscura installation and normal UI-test migration to a shared external CDP connection. Separates passed helper/build checks and native CLI smoke results from browser verification blocked by the absent service and retained native-browser requirements."
created: "2026-11-04"
updated: "2026-11-04"
---

Current behavior follows [ADR 0136](../decisions/0136-chromium-browser-restoration.md) and the [Chromium restoration work record](chromium-browser-restoration.md). The original migration and stylesheet investigation below are retained as historical evidence.

## Purpose and resulting behavior

The requested change uses local Obscura for normal Playwright UI tests. Migrated UI test files use `server/test-browser.ts` and `connectTestBrowser()` to connect to the configured CDP endpoint instead of launching Chromium. The helper defaults to loopback port 9222, accepts `MEW_TEST_BROWSER_CDP_URL`, and provides no browser launch fallback or service lifecycle operations.

The official rendering-enabled Linux x64 v0.2.6 archive was installed outside the repository at `~/.local/share/obscura/v0.2.6`, with CLI links under `~/.local/bin`. Its checksum was checked against the official SHA-256 value. No Obscura binary is added to Git.

The [browser-testing contract](../development/browser-testing.md) owns prerequisites, commands, scope, and compatibility limits. [ADR 0129](../decisions/0129-obscura-ui-testing.md) records the test-browser choice. Application DOM-browser and login-desktop dependencies and native RTC/browser-conformance requirements remain in effect.

## Verification

- The migration changes 219 browser calls in 201 tracked UI test files. Two existing untracked UI test files were adapted locally without adding their unrelated bodies to the commit.
- Three helper unit tests passed, covering endpoint selection and validation, no Chromium fallback, preservation of per-context options, test-owned context cleanup, and single CDP disconnect. Two existing executable-discovery tests also passed, preserving the separate application browser contract.
- The installed `obscura --version` reported 0.2.6. A native CLI data-URL smoke returned the expected document title, executed a button click and returned the changed text, and produced a nonempty PNG without Chromium or a CDP service.
- Both representative MCP-management browser tests were attempted. They failed at the Obscura CDP connection prerequisite because no service was listening; they were not skipped and are not recorded as passing.
- `npm run build` passed, including TypeScript checks for the migrated sources, with the existing large-chunk warning. `npm run lint` passed with existing repository warnings. `npm run check:docs` passed with 681 descriptions and zero link errors. `git diff --check` passed.

Real Obscura UI verification is blocked because the CDP service has not been started. No claim is made that all migrated UI tests or screenshots are compatible. Source migration, unit checks, and build verification do not replace actual browser execution.

## Application and limits

No deployment, launcher execution, or server start, stop, or restart was performed. The user must start the local Obscura service using the [documented command](../development/browser-testing.md#prerequisites-and-endpoint) before UI verification. This migration does not replace every Chromium dependency in Mew or establish native browser conformance.
