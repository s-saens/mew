---
title: "Reducing Mewlink connection recovery cost and wait time"
description: "Records the 2026-10-29 implementation of faster host heartbeat detection, a lightweight presence API, cause-specific browser retries and status display, and authentication response body time limits, along with isolated validation, private central source code, and the scope not applied to production."
created: "2026-10-29"
updated: "2026-10-29"
---

## Purpose and results

Reduced the long unresponsive wait remaining after the [initial host monitoring fix](mewlink-host-heartbeat.md) and the repeated cost of full RTC preparation while waiting for an offline host. [ADR 0086](../decisions/0086-mewlink-recovery-efficiency.md) owns the policy choice, and the [remote access contract](../development/remote-access.md#reattaching-the-same-rtc-after-a-brief-signaling-interruption) owns current behavior.

The host retains the existing heartbeat interval while cleaning up dead WSS connections using a short response deadline and one recheck. The browser preserves the original error code and queries only presence when explicitly offline. It performs a new bootstrap after the host comes online and preserves the existing app and drafts. It pauses or resumes full recovery based on screen and network state and reads the recovery authentication response body within the time limit as well. Natural recovery from ordinary brief RTC interruptions and existing permission and lease validation remain in place.

## Verification

- Related Node tests for host heartbeat, startup, registration, and backoff, and browser connection, recovery policy, and transport: 149 passed across 7 files. Verified normal heartbeats, retransmission, delayed timers after sleep, send errors, shutdown cleanup, preservation of existing RTC, and forwarding of original error codes.
- Central presence, bootstrap, rate limit, and Worker tests: 38 passed across 4 files. Verified online status, registration revocation, authorization boundaries, cache prevention, IP limits, and omission of launch and management session operations.
- 23 in `startup.browser.test.ts` and 1 in `connection-screen.browser.test.ts`: 24 passed in total. Verified 0 presence queries on normal first connections, lightweight offline queries, draft preservation, tab/network return, authentication body cancellation after 10 seconds, discarding late responses, initial authentication recovery, HTTP header/body cancellation with the old central service, and stopping on explicit authentication denial. Status notices were checked and captured using actual launcher CSS at 390/1100 px in light/dark themes for layout, wrapping, and nonblocking input.
- `npx tsc -b`, central `npm run check`, and oxlint on 13 changed TypeScript files: passed. Impeccable static checks of the changed UI also passed without errors.
- `npm run check:docs` failed because the existing `docs/지원서.md` lacks frontmatter. The separate `node server/document-links.ts --all` also failed on 19 existing README, feature, and task link errors. Descriptions and local link targets in the 8 changed documents were checked separately using the existing check functions and passed.

Presence checks use actual Workers/D1/DO fixtures, and browser checks use mock bootstrap and transport with actual Chromium. Time limits are validated with virtual time; these are not actual external network performance measurements.

## Application and remaining scope

No app build, deployment, launcher execution, or production server startup, shutdown, or restart was performed. Host code requires application to the server; presence and browser recovery require a central launcher build and Worker deployment. If the central service is still on an older version, a presence 404 falls back to the existing full reconnection. Validation of actual sleep, external network switching, and restricted networks remains outstanding.

`mewlink/` is private source code excluded from the parent Git repository and has no separate repository. Local modifications to `worker.ts`, `connection-parent.ts`, `central-request.ts`, `launcher.css`, and their Worker and browser tests are preserved but are not forcibly added to the parent repository. The private folder must be backed up and deployed separately. Only public source code, regression checks, owning documents, and decision records are included in parent Git commits.
