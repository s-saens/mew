---
title: "Automatic retry for insufficient model capacity: implementation and verification"
description: "Records per-account retry settings for temporary model capacity shortages, implementation of same-turn requests, cancellation, and queue preservation, and results of type, settings API, isolated UI, and document checks. Distinguishes existing link errors from the status of no app build and not applied to production."
created: "2026-10-26"
updated: "2026-10-27"
---

Implementation and verification record for 2026-10-26~27. The current contract follows the [session contract](../development/agent-sessions.md#automatic-retry-for-insufficient-model-capacity) and [conversation feature document](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#automatic-retry-for-insufficient-model-capacity), configuration follows the [usage guide](../../../docs/guides/project-setup.md#model-congestion-retries), and the rationale follows [Decision 0074](../decisions/0074-agent-capacity-retry.md).

## Purpose and implementation

Allows work to continue automatically when the provider lacks capacity for the selected model, independently of the user's remaining quota. Adds per-account wait time and maximum retry count to the default guidance, with defaults of 30 seconds and 20 retries. Stores them as metadata in the same account's guidance file and excludes them from the text sent to the agent.

Retries only explicit temporary capacity shortages in ACP chat within the same logical turn. Handles both RPC failures and provider paths that send a capacity error at the end of a response and then terminate normally. Preserves busy status, the transcript, and the queue while waiting, displays the remaining time and retry count, and requests continuation after a partial response. User interruption or tab closure cancels retries; actual user quota, authentication, or billing errors and exhausted retries keep the queue on hold. Official TUIs, regular terminals, and CLI commands are not automatically rerun.

## Verification

- `npx tsc -b` passed.
- `server/agent-guidance-ui.test.ts` passed. Verified settings entry, saving, retrieval, and draft preservation in isolated Chromium using the current source at 1100, 390, and 320px screen widths.
- `server/agent-capacity-retry-notice-ui.test.ts` passed. Verified the wait countdown, interruption behavior, and prevention of horizontal overflow in 4 UI languages at 1100 and 320px screen widths.
- Passed 39 automated settings and branch checks and 4 additional metadata preservation regression checks. Also passed 1 API access policy check.
- Passed 20 automated capacity error classification and ACP retry checks. These included interruption and termination while waiting for the retry settings RPC response, races between model changes for the next message and final settings restoration, and memory pressure while waiting to retry.
- Of 55 existing regression checks for `agentAcp`, `agent-memory`, `agent-clear`, and `agent-queue-attachments`, 53 passed, 2 optional systemd/OOM checks were skipped, and 0 failed.
- Targeted linting of 14 changed TypeScript and TSX files passed with exit code 0. Existing React warnings in `AgentPanel.tsx` remain.
- After the final race condition fixes, oxlint on 4 changed server files, `npx tsc -p tsconfig.node.json --noEmit`, and `git diff --check` passed.
- Impeccable `detect` returned an empty array for the 4 changed UI files.
- The 485 description checks in `npm run check:docs` passed with 0 errors. The full link check failed with 17 errors in total: 16 incoming links to `docs/features/MOC.md`, which had been deleted before this work, and 1 link to a deleted marketing task document. Those user-modified files were not changed in this work. Separate description and local link checks on the 5 documents changed here found 0 errors.

## Production application and limitations

No app build, deployment, or server startup, shutdown, or restart was performed. The user will apply the changes to production. No tests that induce actual provider overload were performed, and restoration of wait timers after server or independent supervisor termination is not included.
