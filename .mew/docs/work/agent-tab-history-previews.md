---
title: "Saved history previews for agent tabs"
description: "Records the November 5 separation of first-visit agent transcript display from ACP startup through bounded account-tab previews and late IndexedDB display. Tracks local verification separately from running-server application and real restart latency."
created: "2026-11-05"
updated: "2026-11-05"
---

## Purpose and result

Address slow first visits to inactive agent tabs after reopening Mew. Previously, unopened tabs began their connection on selection, and their early server preview depended on that connection. A valid IndexedDB read arriving after the 25ms connection gate could also miss the opportunity to display saved text.

After authoritative account tab synchronization, the browser prepares saved recent transcripts for ACP tabs through an account-owned read-only API, without opening their agent connections or starting their runtimes. Matching previews supply temporary bubbles on first visit while actual restoration proceeds. Late valid IndexedDB reads can also supply temporary display before authoritative history arrives. Sending, approval, and earlier-history retrieval remain blocked during this display.

The [conversation storage contract](../development/conversation-storage.md#saved-previews-for-unopened-tabs) owns the API, isolation, budgets, and authority boundaries. The [feature contract](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#read-history-content-first) owns visible behavior. [ADR 0141](../decisions/0141-agent-tab-history-previews.md) records the additional retrieval path and alternatives.

## Verification

- `npm run check:docs` passed description validation for 719 documents, with 0 metadata errors. Link validation failed with 42 unresolved links to existing missing documentation indexes, including `.mew/docs/MOC.md`, `.mew/docs/decisions/MOC.md`, and `.mew/docs/decisions/README.md`. None of the four documents changed for this task appeared in the failures. Those unrelated edits were preserved.
- `git diff --check` passed for the changed conversation storage and feature contracts, decision, and work record.
- Direct local inspection of all four task documents found no missing link targets; all six references to the two new or reused topic anchors resolve to their headings.
- The focused nine-file regression run passed all 39 tests: saved-tab API and account isolation, preview Worker boundaries, preview scheduling, desktop/mobile first visits, late device-cache display, existing WS early display, relay reconnection, startup, and account UI routes. The API fixture forbids process spawning while retrieving saved text. The browser fixtures hold ACP responses until explicit synchronization and verify that unopened tabs create no agent connections, previews remain read-only, final history replaces them, and drafts survive.
- After the final hook scope cleanup, the two new browser fixtures and scheduler unit tests passed all 9 tests. Device-cache tests deterministically cover a result within the 25ms gate, one after the socket starts, and one after authoritative synchronization; only the first supplies a reconnect cursor. The broader history fixture now accepts either actual IndexedDB timing while the deterministic fixture verifies both contracts.
- An exploratory broader run encountered an existing automatic-approval tab-selection assertion failure in `agent-connection-ui.test.ts`; the same assertion failed with the captured pre-change `AgentPanel.tsx`. The broader `agent-history-ui.test.ts` later failed at the existing `photo.png` media-dialog accessible-name expectation under concurrent media changes. Neither entire fixture is reported as passing. Temporary connection-fixture experiments were removed.
- `npm run build` passed, including TypeScript checks, after concurrent login/MCP type errors were corrected by their owning work. Vite retained its existing large-chunk warning. `npm run lint` passed with React warnings. These checks cover the local working tree, which also contains unrelated work; no unrelated source edits are included in this task.

## Application and remaining limits

No deployment, launcher execution, or server start, stop, or restart is performed. A build updates served `dist/` assets but does not reload server-side routes; the user applies server changes through the normal lifecycle.

Actual restart-to-first-click latency, real-provider initialization, and external-network performance are not yet measured. Missing Mew transcripts, preview budgets, read failures, and visits before prefetch completion retain the normal restoration path. The saved preview can lag external CLI changes until provider synchronization, and it does not make the agent ready to accept work sooner.
