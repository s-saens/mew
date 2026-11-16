---
title: "Agent duration restoration"
description: "Records fixes for saved agent turn durations lost during ACP transcript reconciliation, including changed question prefixes, local checks, and recovery limits."
created: "2026-11-14"
updated: "2026-11-16"
---

# Agent duration restoration

ACP may replay a different or incomplete answer without a turn ending. Reconciliation previously retained the saved ending only for cancellations, so it could overwrite a recorded duration on restoration. The [session contract](../development/agent-sessions.md#messages-reconnection-and-queues) now preserves saved endings for matching question prefixes while retaining ACP answers and preferring ACP endings.

Local verification: `node --test server/agentTranscript.test.ts server/agentAcp.test.ts src/utils/agentFold.test.ts` passed 69 tests, including repeated SQLite restoration and bubble assembly. `npm run build` passed, including TypeScript checks. `npm run lint` passed with warnings. `npm run check:docs` found no description errors but failed on 39 existing repository link errors. No server restart or deployment was performed.

This cannot recover durations already absent from the stored transcript. Question matching also cannot distinguish a regenerated answer to the same question from a different ACP replay. Actual provider and running-instance behavior was not verified.

## Changed question prefixes

On November 16, restoration was extended to preserve a saved timed ending after an earlier question changes, when the later question is unique, its answer matches, and matching turns retain their order. The [session contract](../development/agent-sessions.md#messages-reconnection-and-queues) describes the matching limits. The latest ACP ending remains authoritative, and missing stored durations cannot be reconstructed.

Local verification: the transcript, ACP, and bubble-fold tests passed 70 tests, including repeated SQLite restoration and duplicate-question and changed-answer cases. `npm run build` passed, including type checks; `npm run lint` passed with warnings. `npm run check:docs` found 39 existing link errors. Actual provider restoration and the running server were not tested; no server restart or deployment was performed.
