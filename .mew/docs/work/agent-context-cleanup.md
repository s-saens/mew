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

## Document selection and current links

Split the former shared UI contract into six topics and separate browser startup, connection recovery, and agent guidance. Each topic has a scoped description; original UI headings and explicit aliases remain in the compatibility entry. Shorten descriptions and authoring instructions without adding MOC requirements. Historical decisions and unrelated pending edits remain outside this cleanup.

An independent audit checked 138 rewritten links across 75 current documents: each relative target/fragment resolves, every replacement matches its mapping, and the original 58 UI headings plus two explicit aliases remain. Topic descriptions were independently reviewed for distinguishable ownership. Shared UI corrections retain the existing source contract; legacy `browser` permission overrides remain a read-time compatibility rule.

`npm run check:docs` reports 665 valid descriptions and one pre-existing error in the unrelated task `Image preview and attachment editing.md`: its `/api/asset` URL needs a repository-relative link. No changed contract has a new link error. Discovery/search tests passed all 5 tests. The final required build passed; actual deployment, server application, and production latency remain unverified.

## Task and Git lookup

Shorten the [task contract](../development/task-list.md) from 9,750 to 8,363 words and the two [Git panel](../features/git-history/project-git-work-panel.md)/[connection](../development/git-connections.md) documents from 9,145 to 8,559 words, including metadata. Use focused subsections and tables while retaining existing anchors and verbatim historical verification sections. Independent reviews checked input focus, saving/lifetimes, date/sort precedence, commit selection, retry limits, account races, and credential scope. These are prose changes; they introduce no new task or Git behavior.

Related existing theme, project access, icons, worktree, snapshot, and account-state suites passed 14 tests. Together with the new helper/router, connection, browser, and discovery checks above, the scoped runs passed 169 tests. This is not a full-suite result. The final documentation check still has only the unrelated task asset-link error noted above.
