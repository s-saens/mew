---
title: "Improved Loading Termination on Initial Connection Failure"
description: "Work record for 2026-10-29 covering investigation of reported delays on the first desktop connection to Mewlink, failure displays for initial downloads and remote initialization, and cancellation when initial authentication or static UI response bodies stall. Distinguishes isolated validation from the actual report, which was not reproduced, and changes not applied to production."
created: "2026-10-29"
updated: "2026-10-29"
---

## Purpose and results

Investigated a report that the screen took a long time to appear on the first desktop visit through Mewlink, while subsequent visits were faster due to caching. In a fresh Chromium context in the investigation environment, reaching the login screen took 1.9 seconds on the first desktop visit and 1.4 seconds on a repeat visit, and 1.4 seconds on the first visit with mobile emulation and 1.3 seconds on a repeat visit; the reported 30-minute delay was not reproduced. These connection results came from the same investigation environment as the host and do not replace validation on the friend's PC, an external network, or the workspace UI after login.

Addressed separately confirmed failure paths. When downloading the authentication entry point or remote initialization fails, paths that previously left the startup screen displayed now end with the existing recovery message. If the initial authentication result expected from the parent or the directly fetched authentication body never completes, cancel the wait and direct request after at most 30 seconds. Static UI responses previously had no timeout if body transfer stalled after headers arrived; now cancel if no response arrives for 30 seconds after requesting the next data. Preserve active downloads, consumer backpressure, and long-running regular API streams. The current requirements are owned by [Browser startup](../development/architecture.md#initial-browser-startup) and [Remote resource transfer](../development/remote-access.md#host-ui-compression-and-revalidation).

## Validation and Limitations

- Before the fix, the initial download failure regression check failed because the recovery message was not displayed. After the fix, verified standard and remote import failures, remote initialization failures, initial authentication stalls, and timer cleanup after normal completion at desktop and mobile sizes.
- `node --test src/app-bootstrap.browser.test.ts server/remote-resource-worker.test.ts server/remote-ui-resource-browser.test.ts server/remote-flow-control-ui.test.ts`: 13 passed, none skipped. Verified startup dependencies and authentication boundaries; body stalls, progress, backpressure, SSE, and cleanup with a virtual clock; and compression, caching, dynamic import, and receive windows in real Chromium.
- `node --test src/utils/remote-reconnect.test.ts`: 17 passed. Verified shared initial authentication, connection recovery, late responses, and permission revocation boundaries.
- `npx tsc -b` and `npx oxlint` on the 5 changed code and test files: passed. `git diff --check` also passed for the paths changed in this work.
- The automated UI check reported no findings with `impeccable detect --json src/main.tsx`.
- `npm run check:docs`: 520 descriptions passed without errors. The full link check failed due to 18 existing links to deleted feature MOC and task documents unrelated to this work. Separately used the existing check function to confirm no link errors in the 3 documents changed in this work.

The cause of the actual report has not yet been determined. These changes prevent the confirmed failures and transfer stalls from leaving loading active indefinitely. No app build, deployment, or server start, stop, or restart was performed. Applying the changes to production requires the user to build and restart the host and update the resource worker at the central app origin. After production application, verification must be repeated in the browser and network environment on the friend's PC.
