---
title: "Mewlink background-return recovery without stale warnings"
description: "Records the 2026-10-31 fix for suspended Mewlink reads and socket opens exhausting panel retries during background waits, preservation of visible content and drafts, regression verification, and remaining physical-device and application limits."
created: "2026-10-31"
updated: "2026-10-31"
---

## Purpose and resulting behavior

Returning to Mewlink after about ten minutes in the background could leave a red reconnect warning above the agent conversation. The launcher already recovered the connection and retained the iframe, but the app transport immediately rejected reads and socket opens during suspension. Agent command polling could exhaust its retry budget while the launcher was still waiting, leaving an error that required manual retry.

Suspended `GET`/`HEAD` reads and new virtual sockets now wait for verified reconnection. Reads interrupted before response headers can retry on the replacement generation; active response bodies still report interruption to their consumer. Waiters are bounded and released by cancellation or permanent closure. Suspended time does not consume panel retries or request deadlines. Recovery updates the existing screen without remounting it, discarding drafts, or replaying saves and commands. This implements the quiet presentation already accepted in [ADR 0099](../decisions/0099-quiet-automatic-recovery.md); the current contract belongs to [remote access](../development/remote-access-recovery.md#reattaching-the-same-rtc-after-a-brief-signaling-interruption).

## Verification

- `node --test --test-reporter=dot src/utils/remote-*.test.ts server/mewlink-background-recovery-ui.test.ts` passed. Transport regressions cover suspended and interrupted `GET`/`HEAD` reads, admission waits, cancellation, queue bounds, closure, stale responses, preserved write/body interruption, and authentication bootstrap without duplicate reads.
- The new browser fixture passed at 390px and 1100px using the real command polling hook, API client, transport, and `PanelNotice`. Ten simulated hidden minutes produced no error notice or exhausted polling state. Recovery refreshed automatically, retained panel/row/input nodes, drafts, and focus, opened the waiting socket once, and did not repeat the accepted command. A second interrupted read recovered; a real HTTP 403 still stopped polling and displayed its error.
- `node --test server/agent-connection-ui.test.ts server/agent-command-recovery-ui.test.ts` passed both tests. These retain coverage of the actual AgentPanel's loading and draft behavior, eleven-retry limits for actual failures, explicit recovery, operation errors, and reduced motion.
- `npm run build` passed, including the root TypeScript project build. `npx tsc -p mewlink/tsconfig.client.json --noEmit` also passed. Lint completed without errors, with warnings outside the changed files; the build reported bundle-size warnings.
- `npm run check:docs` passed with no description or local-link errors. `git diff --check` passed.

## Application boundary and limitations

The change is in the host-shipped app transport, also imported by the separately built Mewlink launcher. No central-only source change is required. The host build verifies and updates local UI assets; it does not apply a new central frontend bundle. Deployment, launcher execution, and server lifecycle operations remain user actions and were not performed.

The browser regression uses simulated DataChannel frames and a controlled ten-minute clock. It does not establish physical Android Brave sleep behavior, real WebRTC recovery latency, or success over external mobile networks. Genuine permission, authentication, mutation, and exhausted central recovery failures retain their existing recovery paths.
