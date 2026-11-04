---
title: "0136 — Restore Chromium for browsing and UI verification"
description: "Supersedes Obscura decisions 0129 and 0135 with local Chrome/Chromium for the internal DOM browser and UI tests after slow real-app startup and interaction. Preserves DOM relay and isolation while restoring native browser networking, navigation, and input."
created: "2026-11-04"
updated: "2026-11-04"
status: "accepted"
---

## Context

[ADR 0129](0129-obscura-ui-testing.md) moved normal UI tests to an external Obscura CDP service. [ADR 0135](0135-obscura-dom-browser.md) replaced the internal browser's headless Chromium with Obscura and added Node networking, cookie, WebSocket, and navigation bridges.

The migration's synthetic fixture showed lower resource use and faster first snapshots. A real localhost app subsequently displayed without its stylesheet. Correcting reflected stylesheet URLs restored CSS capture in a local snapshot check, but did not establish acceptable end-to-end browsing. The user then confirmed the page appeared only after a long delay and remained slow to interact with, and preferred the earlier Chromium behavior. Browser compatibility and usable interaction take priority over those fixture results for this feature and UI verification.

## Decision

Restore local Chrome/Chromium for both the internal Browser and normal UI tests. Supersede ADRs 0129 and 0135 while preserving their original rationale and verification records.

- Discover `MEW_BROWSER_EXECUTABLE`, then Playwright's bundled Chromium, then standard system Chrome/Chromium locations. Obscura-specific discovery and CDP endpoint settings are no longer used.
- Launch a dedicated headless Chromium browser and ephemeral context for each normal internal Browser session. Restore native HTTP/cookies, history traversal, WebSocket connections, and pointer activation. Keep CDP interception that validates every redirect hop against the current port policy.
- Keep `connectTestBrowser()` as the common UI-test entry point, but launch a test-owned headless Chromium browser instead of attaching to a shared service. Callers close the browser in test cleanup.
- Remove the Obscura-only reflected-link patch and its tests. Keep rrweb replay, document generations, account isolation, access checks, theme/scroll synchronization, and the separate OAuth video desktop.

## Alternatives and rationale

Continuing to patch Obscura would require more real-app compatibility and latency work before it could replace the earlier behavior. Retaining it only for UI tests would still make the verification engine differ from the Chromium browser being restored. Keeping both as selectable engines would add configuration and maintenance without a current requirement. Restore the established Chromium paths first.

## Consequences

Chrome/Chromium installation is required, and its resource costs return. Removing a browser engine does not remove DOM replay's canvas, frame, media, or native-dialog limitations. The historical Obscura fixture timings are not evidence of current real-app responsiveness.

The user applies server code through the normal restart procedure; agents do not deploy or operate servers. Local browser checks do not establish mobile or external-network behavior. Current contracts are [DOM browsing](../development/port-preview.md#internal-dom-browser) and [UI testing](../development/browser-testing.md); actual verification is recorded in the [restoration work record](../work/chromium-browser-restoration.md).
