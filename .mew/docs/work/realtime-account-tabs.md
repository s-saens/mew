---
title: "Real-time account tab synchronization"
description: "Records the November 4 implementation of account-shared editor, agent, and terminal tabs, migration, concurrency safeguards, and local verification. Separates automated checks from application to the running server and physical-device validation."
created: "2026-11-04"
updated: "2026-11-04"
---

## Purpose and result

Share open tabs and selection between devices using the same account. Editor metadata now has a separate account ledger and live invalidation. Agent and terminal tabs subscribe to live account changes and merge local deltas without deleting concurrent additions. Panel geometry remains device-local. The [current contract](../development/account-tabs.md) owns API, migration, preservation, and recovery behavior; [ADR 0133](../decisions/0133-realtime-account-tabs.md) records the ownership change.

## Verification

- Passed 60 tests across `server/agent-tab-state.test.ts`, `server/userUiState.test.ts`, `server/user-ui-routes.test.ts`, `server/editor-tabs-sync-ui.test.ts`, the account/agent/editor tab state utilities, device layout, editor navigation/files, and demo client contracts. The hook integration uses React StrictMode and happy-dom without starting an application or browser service. It checks authoritative restoration against stale device caches, workspace migration, live open/select/close without echo writes, successful and failed draft saves during a remote close, hydration recovery, and scope filtering.
- Passed 2 focused demo transport tests for independent editor-tab storage and existing workspace settings. The complete `src/demo/transport.test.ts` run passed 17 tests and failed its existing pet sprite test (`Cannot read properties of undefined (reading 'width')`). Running that same test from the unchanged HEAD source reproduced the failure.
- `npm run build` passed, including TypeScript project checks. Vite reported its existing large-chunk warning.
- Targeted `oxlint` passed with no errors. Existing App/AgentPanel React warnings remain; the new synchronization modules and editor hook pass without warnings.
- `npm run check:docs` passed description validation but failed link validation. Other concurrent work renamed/deleted documentation entrypoints, leaving unresolved incoming links, including the root README/AGENTS decision-index link. These unrelated documentation changes were preserved. New account-tab contract, decision, and work-record links were inspected against existing targets.
- `git diff --check` passed for this task's changes.

## Application boundary

No deployment, launcher execution, or server start, stop, or restart is performed. The user must apply server-side changes through the project's normal lifecycle. Physical A/B-device behavior is not yet verified. Builds update `dist/` assets served by the existing instance and do not reload server code.
