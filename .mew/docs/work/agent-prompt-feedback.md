---
title: "Immediate agent message and reply feedback"
description: "Records the 2026-10-30 fix for delayed sent-message bubbles, local question and reply waiting feedback, server reconciliation, verification results, and the boundary before user build and application."
created: "2026-10-30"
updated: "2026-10-30"
---

Removed the wait for a server echo before showing an idle agent submission. The local question and a response bubble with the shared three-dot indicator appear immediately. The indicator continues through server confirmation and ends when answer text, completion, cancellation, approval waiting, or failure arrives. Closed or failing socket sends preserve the draft and attachments.

The current behavior belongs to [agent conversations](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#immediate-message-and-reply-feedback), and the display-only state boundary belongs to [conversation storage](../development/conversation-storage.md#incremental-screen-updates). Local feedback does not modify provider prompts, stored transcripts, history cursors, or queue execution.

Verification results:

- `node --test server/agent-prompt-feedback-ui.test.ts server/agent-control-latency-ui.test.ts server/agent-work-details-ui.test.ts src/utils/agentFold.test.ts src/utils/agent-event-state.test.ts src/utils/agent-startup-queue.test.ts`: All 31 tests passed, with none skipped. The new isolated Chromium regression covers immediate display before any server response, echo handoff, repeated identical prompts, rapid queue acknowledgment, expanded waiting replies, cancellation, errors, startup waiting, and draft retention after socket send failure. Desktop dark and mobile light captures at 1100/390px showed visible dots and no clipping.
- `npx tsc -b`: Passed.
- Targeted `oxlint` for the changed TypeScript files: Completed without errors; React warnings remain in `AgentPanel.tsx`.
- `npm run check:docs`: Passed description and local-link checks.
- Broader existing UI checks in `agent-command-ui.test.ts` and `agent-connection-ui.test.ts` failed on an old `.mew/assets` upload expectation and the removed `세션 ID` field. Both failures also reproduced using the pre-change `HEAD` version of `AgentPanel` in temporary isolated fixtures. Those tests and the live source were not changed for the baseline check; temporary fixtures were removed.

No app build, deployment, server startup, or restart was performed. Actual provider latency and physical-device behavior remain unverified; the user must build and apply the source changes.
