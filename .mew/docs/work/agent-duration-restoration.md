---
title: "Agent duration restoration"
description: "Records the fix for saved agent turn durations lost during ACP transcript reconciliation, local checks, and recovery limits."
created: "2026-11-14"
updated: "2026-11-14"
---

# Agent duration restoration

ACP may replay a different or incomplete answer without a turn ending. Reconciliation previously retained the saved ending only for cancellations, so it could overwrite a recorded duration on restoration. The [session contract](../development/agent-sessions.md#messages-reconnection-and-queues) now preserves saved endings for matching question prefixes while retaining ACP answers and preferring ACP endings.

Local verification: `node --test server/agentTranscript.test.ts server/agentAcp.test.ts src/utils/agentFold.test.ts` passed 69 tests, including repeated SQLite restoration and bubble assembly. `npm run build` passed, including TypeScript checks. `npm run lint` passed with warnings. `npm run check:docs` found no description errors but failed on 39 existing repository link errors. No server restart or deployment was performed.

This cannot recover durations already absent from the stored transcript. Question matching also cannot distinguish a regenerated answer to the same question from a different ACP replay. Actual provider and running-instance behavior was not verified.
