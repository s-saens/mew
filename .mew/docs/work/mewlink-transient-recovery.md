---
title: "Improving Mewlink connection persistence and recovery display during brief interruptions"
description: "Records implementation and validation of replacing browser RTC termination after 250 ms with a 5-second recovery wait and delaying the status display by 1 second. Distinguishes immediate termination for permission revocation, expiration, and actual failure from the statuses not applied to production and external networks unverified."
created: "2026-10-28"
updated: "2026-10-28"
---

## Purpose and results

Browser RTC `disconnected` handling was adjusted following reports of repeated brief recovery displays and reconnections during Mewlink use. A new regression test reproduced the existing code path that immediately reported recovery status and terminated the connection after 250 ms. The actual cause of the production symptoms was not established.

Interruptions shorter than 1 second now recover silently on the same transport. After 1 second, recovery status is reported, and natural recovery is awaited for up to 5 seconds. Repeated events do not extend the deadline, and the next interruption after recovery receives a new wait period. Both timers are cleaned up on recovery or termination, and authentication, writes, and commands on the same connection are not retransmitted.

Permission denial and revocation, actual channel closure, and lease expiration are handled independently of the wait. The 10-second central check, 20-second renewal, and existing host checks were unchanged. [Remote access](../development/remote-access.md) and [shared UI](../development/ui-contracts.md) own the current contract; [ADR 0081](../decisions/0081-mewlink-transient-recovery.md) owns the rationale and the scope of superseded decisions.

## Verification

- `node --test src/utils/remote-connection.test.ts src/utils/remote-reconnect.test.ts`: 73 passed. Verified suppression of the display for 999 ms interruptions, display after 1 second, recovery just before 5 seconds and termination at the deadline, repeated events, consecutive interruptions, and timer cleanup on termination. A regression check also passed in which an in-progress POST during a 2-second interruption was sent only once on the same transport and completed with its original response. Lease expiration, revocation, normal central closure, and actual channel failure arriving before the 5-second recovery wait ended were handled immediately. These checks used mock RTC states and controlled timers.
- `server/remote-local-auth.test.ts`, `remote-mewlink-auth.test.ts`, `remote-access-socket-close.test.ts`, and `remote-access-ticket-inbox.test.ts`: 32 passed. Verified per-request login boundaries, password and permission changes, revocation, late-arriving authentication handling, and per-socket error isolation.
- `mewlink/test/connection-screen.browser.test.ts`, `recovery.browser.test.ts`, `startup.browser.test.ts`, `trusted-browser.browser.test.ts`, and `p2p-stability.browser.test.ts`: 20 passed. Verified the actual launcher using mock connections at 390/1100 px in light/dark themes, preservation of the existing iframe and input drafts, and authentication change boundaries. Native P2P checks used isolated Workers and Chromium with actual native RTC to verify browser and host signaling interruptions, persistence for 65 seconds beyond the original 60-second lease, and central renewal and revocation while the browser renewal timer was delayed. These checks did not validate actual external network interruptions or field success rates for the new 5-second wait policy.
- `npx --no-install tsc -b` and `npm --prefix mewlink run check` passed. The full `npm run lint` completed without errors, with existing warnings outside the scope of this work remaining. Impeccable `detect` returned an empty array.
- `npm run check:docs` found no errors in 508 descriptions. The full link check failed on 18 existing links to feature MOC and task documents that had already been deleted before this work. Separate checks of the 5 changed documents using the existing `documentLinkErrors` found no link errors. oxlint on the changed TypeScript files and `git diff --check` also passed.

## Application and limitations

No app or central builds or deployments, or startup, shutdown, or restart of the running server, were performed. The user applies the Mewlink launcher containing the changed browser connection controller. Recovery success rates during actual phone sleep, LTE use, and network switching, and the cause of the production symptoms, are unverified. 5 seconds is the initial policy value; when an actual disconnection persists, starting a new connection may be delayed by that amount.
