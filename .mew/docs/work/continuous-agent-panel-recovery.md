---
title: "Continuous automatic agent-panel recovery"
description: "Records the 2026-11-01 replacement of exhausted agent-panel connection and command-status notices with continuous quiet retries, capped backoff, draft preservation, and scoped permanent failures. Covers passing local build and recovery checks, an existing broader CLI fixture failure, and unverified physical-device and external-network behavior."
created: "2026-11-01"
updated: "2026-11-01"
---

## Purpose and result

The eleven-retry limit could leave agent conversations showing `Could not reconnect.` or `Failed to fetch` until a manual retry. Agent-panel connections and safe command-status reads now continue automatic recovery with loading dots and a retry interval capped at 30 seconds. Returning online or to a visible document and verified transport recovery advance a pending retry. Conversation and composer DOM, drafts, and known CLI records stay in place; recovery does not replay prompts or commands.

Fatal agent events retain their original error and stop reconnecting. Invalid JSON and permanent command-status HTTP 4xx errors other than 408/429 keep a scoped recovery action. Top-level Mewlink, Mewpet assistant, and project command metadata retain their existing retry limits.

Current behavior belongs to the [agent feature](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#waiting-for-connection-and-reconnecting), [session contract](../development/agent-sessions.md#messages-reconnection-and-queues), and [UI contract](../development/ui-contracts.md#automatic-recovery-within-panels-and-menus). [ADR 0110](../decisions/0110-continuous-agent-panel-recovery.md) records the limited reversal of [ADR 0099](../decisions/0099-quiet-automatic-recovery.md).

## Verification

- `server/agent-connection-ui.test.ts` and `server/agent-command-recovery-ui.test.ts` passed in isolated Chromium. Coverage includes recovery beyond eleven failures, the 30-second backoff ceiling, immediate foreground/network/verified-transport retries, duplicate-signal protection, restored fast intervals after synchronization, retained drafts and command records, no write replay, fatal events, HTTP 403, malformed responses, and cleanup. The connection test covers 390px and 1100px in light and dark themes and reduced motion; the command test passed again after adding malformed-response coverage.
- `server/mewlink-background-recovery-ui.test.ts` and `server/agent-prompt-feedback-ui.test.ts` passed, including ten-minute simulated suspension, resumed status reads without remounts, retained focus and drafts, and immediate prompt feedback. No server was started for these fixtures.
- Inspected connection-wait captures at 390px dark and 1100px light: only the shared dots appear over the conversation area and the draft remains editable. The Impeccable detector returned no findings for `src/components/AgentPanel.tsx`.
- `npm run build` passed, including TypeScript checks. Vite reported its chunk-size warning. `npm run lint` exited successfully with existing React warnings. Documentation metadata and local links passed `npm run check:docs`.
- The broader `server/agent-command-ui.test.ts` failed on its existing upload destination expectation: it expects `.mew/assets`, while the committed implementation already sends `.mew/temp/assets`. Exploratory fixture-only adjustments also exposed stale queue-preview and upload-visibility expectations; those adjustments were reverted. This unrelated test remains unchanged and is not claimed as passing.

## Application boundary

No deployment, launcher execution, or server start, stop, or restart is part of this work. Physical-device sleep/wake and external-network recovery remain unverified. These host-panel changes do not alter the separate central Mewlink frontend or its exhaustion behavior.
