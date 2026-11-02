---
title: "Agent context and code ownership cleanup"
description: "Records the 2026-11-03 cleanup of agent-facing document retrieval and focused code owners, with local regression checks and remaining verification limits."
created: "2026-11-03"
updated: "2026-11-03"
---

## Purpose and scope

Shorten the context needed to find and maintain Mew contracts. Keep conditions, compatibility anchors, and historical evidence while separating independently maintained topics. Current owners are the [documentation rules](../README.md), [UI topic entry](../development/ui-contracts.md), and the contracts linked below. This is source cleanup, without deployment or server lifecycle operations.

## Public module preparation

Extract the public-module delay, shared promise, and urgent promotion from `App.tsx` into `createDeferredModulePreparation`. App retains the actual dynamic import and UI eligibility decisions; component and permission lifetimes remain with callers. See [browser startup](../development/browser-startup.md#optional-tools-and-public-module-scheduling).

| Local check | Result |
| --- | --- |
| `node --test src/utils/deferred-module-preparation.test.ts` | 6 passed: delayed and promoted loads, shared completion/failure, timer cleanup, and independent controllers |
| `node --test src/workspace-startup.browser.test.ts` | 7 passed: actual desktop/mobile startup and full-source dependency boundaries |
| `npm run build` | Passed, including TypeScript project checks; existing large-chunk warning retained |
| Scoped source/test lint | Passed with existing App React warnings |

The graph retains 170 deferred edges and 19 critical chunks. These checks establish scheduling and boundary preservation, not production connection latency.

## Account UI route ownership

Move the eight theme, root-project, agent-tab, and workspace GET/PUT handlers into `server/user-ui-routes.ts`. `createApiApp()` mounts the router at the original middleware position and supplies its existing error handler. Request identity, per-route authentication/feature checks, response shapes, and root/session-claim behavior remain unchanged. See [server structure](../development/architecture.md#structure).

`node --test server/user-ui-routes.test.ts` passed all 5 tests against the actual API fixture: guest rejection, agent/terminal feature gates, account/root isolation, cache middleware, and existing error responses. The required build and scoped lint also passed; this does not apply new server code to a running instance.

## Foreground probe and network contracts

Extract pending-probe state, response listeners, admission cancellation, and transmit-relative RTT timers into `createRemoteForegroundProbe`. The connection controller retains authenticated/visible/open-channel/transport/lease eligibility and cancels the probe synchronously on close. See [foreground recovery](../development/remote-access-recovery.md#foreground-liveness-and-lease-expiry).

`node --test src/utils/remote-foreground-probe.test.ts src/utils/remote-connection.test.ts` passed 131 tests, including late statistics and responses, canceled queued probes, replacement, and reset. The required build and scoped lint passed. Independent source review found no intended behavior change.

The [remote access](../development/remote-access.md), [recovery](../development/remote-access-recovery.md), [remote desktop](../development/remote-desktop.md), [collaboration](../development/collaboration.md), and [port preview](../development/port-preview.md) contracts now use shorter paragraphs and lookup tables. Recovery has its own canonical topic; the original entry anchor remains. Existing headings, code, limits, links, and historical verification evidence were checked for preservation. Authentication and transport clauses received an independent semantic review; this review did not revalidate production operation.

## Shared package reference corrections

Restructure the [package APIs](../development/packages.md) into focused sections and option tables. Match existing source behavior for the mobile editor key bar and shared header/action menus; these are documentation corrections, not UI changes. Shared [overlay](../development/ui-overlays.md#shared-action-menus) and [editor context-menu](../development/ui-editor-input.md#editor-body-context-menu) sections retain their anchors at the correct heading level. The editor prop comment now describes its existing mobile-width default without a focus gate.

`node --test server/action-menu-ui.test.ts` passed its actual-component check across eight desktop/mobile/theme/gradient combinations. The fixture now uses the existing translated mobile dialog name, **내 프로젝트**; it suppresses only irrelevant module-directive warnings. Source geometry and current key-bar conditions were inspected directly.
