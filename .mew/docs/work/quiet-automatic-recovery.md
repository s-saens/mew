---
title: "Quiet loading feedback during automatic recovery"
description: "Records the 2026-10-30 changes to Mewlink, agent, command-menu, memo, and terminal recovery feedback; bounded retries and draft preservation; isolated verification; and pending host/central application."
created: "2026-10-30"
updated: "2026-10-30"
---

## Purpose and result

Temporary reconnections and metadata reads previously displayed connection warnings or red failures while the next automatic attempt could succeed. The UI now shows only the shared loading dots during that wait, retaining existing conversations, command rows, memo contents, and terminal drafts. Genuine operation failures remain visible and are not replayed or erased by successful polling.

Mewlink, agent sessions, the Mewpet assistant, project command metadata, and agent command polling allow eleven automatic retries after the initial failure. Exhausted component recovery has a scoped retry control. Exhausted Mewlink recovery stops automatic requests and covers the page with a themed error containing the cause and reconnect action. The app iframe remains inert behind it; explicit retry reconnects the same frame, preserves unsent input, verifies identity, and restores the title and keyboard focus. Hidden/offline waits and canceled Mewlink preparation or authentication do not consume the retry allowance. Memo and terminal retry lifetimes are unchanged.

Current behavior belongs to [UI contracts](../development/ui-recovery-feedback.md#automatic-recovery-within-panels-and-menus), [remote access](../development/remote-access-recovery.md#reattaching-the-same-rtc-after-a-brief-signaling-interruption), the linked feature documents, and [ADR 0099](../decisions/0099-quiet-automatic-recovery.md).

## Verification

- The focused remote suite passed 73 tests: `src/utils/remote-recovery.test.ts`, `src/utils/remote-reconnect.test.ts`, and local `mewlink/test/{startup,connection-screen,recovery,trusted-browser}.browser.test.ts`. Coverage includes eleven failed retries, no premature error screen, stopped background requests after exhaustion, draft-preserving manual retry, title restoration, hidden authentication cancellation, offline waiting, stale responses, identity checks, and no write replay.
- Inspected full-screen error captures at 1100px light and 390px dark, with additional layout assertions at both widths in both color schemes. The screen uses the existing connection background, compact content, and clear recovery actions. Reduced motion remains supported.
- Command metadata/status and keyboard checks passed: `src/api/response.test.ts`, `server/command-button-recovery-ui.test.ts`, `server/command-button-menu-ui.test.ts`, `server/cmd-button-workspace-ui.test.ts`, and `src/utils/command-menu-keyboard.test.ts`. They cover cached rows, retry exhaustion, permission errors, manual retry, nonoverlapping slow requests, preserved operation failures, workspace targeting, and keyboard navigation.
- Agent checks passed: `server/agent-connection-ui.test.ts`, `server/agent-command-recovery-ui.test.ts`, `server/mewcat-assistant-reconnect-ui.test.ts`, and `server/mewcat-assistant-ui.test.ts`. They cover neutral loading, preserved drafts and records, retry limits, manual recovery, fatal failures, idempotency, and no prompt replay. The connection fixture also uses the current history search controls and shared notice styling.
- Memo and terminal checks passed: `src/components/shared-memo-startup.browser.test.ts` and `server/terminal-keybar-ui.test.ts`, including initial waiting, recovery, contents/drafts, read-only memo behavior, and mobile terminal controls.
- Root `npx tsc -b` and central frontend `npx tsc -p mewlink/tsconfig.client.json --noEmit` passed. `npm run lint` completed with warnings and no errors. `npm run check:docs` passed with 584 descriptions, no metadata errors, and no local link errors. No app build or production application is part of these checks.

## Application boundary

The user applies the host build and central frontend separately. Mewlink source remains private and Git-excluded: local changes are in `mewlink/src/connection-parent.ts`, `mewlink/src/launcher.css`, `mewlink/test/startup.browser.test.ts`, and `mewlink/test/connection-screen.browser.test.ts`. They are not force-added to the public repository. Actual recovery after phone sleep or ten minutes away on external networks remains unverified. Initial bootstrap and explicit authorization/configuration failures retain their existing immediate error handling.
