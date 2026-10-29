---
title: "Mewlink host recovery from heartbeat nonresponse"
description: "Records the 2026-10-29 mismatch between central offline and host online status, the initial 60-second heartbeat monitoring fix, and isolated validation. Links subsequent shorter response deadlines and cause-specific recovery to a separate work record."
created: "2026-10-29"
updated: "2026-10-29"
---

This record covers the initial 60-second response monitoring fix. Subsequent faster detection and lightweight offline waiting follow the [follow-up work](mewlink-efficient-recovery.md) and [ADR 0086](../decisions/0086-mewlink-recovery-efficiency.md).

## Investigation and cause

When public device access was checked in a new Chromium context, the central WebSocket repeatedly returned `offline` after the challenge, and the screen continued to display ‘Recovering connection’. The local production server was running. Inspection of the periodic check call stack and variables in the existing production process's debugger showed host status `online`, central socket `OPEN`, and a retry timer that had already ended. Debugger breakpoints were removed and execution resumed; the debugger connection and inspector port were also closed.

The host sent a heartbeat every 20 seconds but did not check whether a central response arrived. As a result, if a disconnected socket remained open without `close` or `error`, reconnection did not start. The status mismatch between the central service and host is consistent with this defect. Whether the initial disconnection was caused by sleep, network switching, or a service issue could not be determined. The browser's generic recovery display also hid the initial error, making causes difficult to distinguish.

## Changes

The [remote access contract](../development/remote-access.md#reattaching-the-same-rtc-after-a-brief-signaling-interruption) owns current behavior. Existing JSON heartbeat responses are checked outside the asynchronous processing queue; after at least 60 seconds without a response, measured using monotonic time, the periodic check forcibly closes the socket and uses the existing reconnection procedure. Send errors are cleaned up through the same path, and the initial WSS handshake is limited to 30 seconds. The central protocol, registration keys, leases, and RTC reattachment policy remain in place.

## Verification and application

- `MEW_DATA_DIR="${TMPDIR:-/tmp}/mew-test-data" node --test server/remote-access-heartbeat.test.ts server/remote-access-agent-startup.test.ts server/remote-access-retry.test.ts server/remote-access-registration-network.test.ts`: 34 passed. Verified nonresponse in the OPEN state, normal responses, send failures, shutdown cleanup, and reconnection after nonresponse termination with authenticated RTC preservation using an actual TLS WebSocket fixture. Unit checks used virtual time; integration checks used manual heartbeat checks and virtual monotonic time.
- `npx tsc -b` and `npm run lint -- …` on 4 changed TypeScript files: passed.
- `npm run check:docs`: failed because the existing `docs/지원서.md` lacks frontmatter. The separately run `node server/document-links.ts --all` also failed on 19 existing README image, feature, and task link errors. Descriptions and local link targets in the 3 documents for this change were checked separately using the existing `readDescription` and `documentLinkErrors` and passed.
- `git diff --check` on changed files: passed.

No app build, deployment, or server startup, shutdown, or restart was performed. This fix must be applied to the host server and does not require central Worker redeployment. This does not mean the existing production process's connection has recovered. Recovery validation after actual sleep and external network switching remains outstanding.
