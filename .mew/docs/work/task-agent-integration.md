---
title: "Task editor agent integration"
description: "Records the task editor brain action and its 2026-11-02 change from automatic submission to runtime selection and editable prompt drafts, with isolated regression checks and runtime application limits."
created: "2026-11-01"
updated: "2026-11-02"
---

Implemented the task editor's rightmost **Run task** brain icon so a task can move directly from its document to an agent conversation. Current behavior belongs to the [task feature contract](../features/projects-files-search/task-panel-list-calendar-and-gantt.md#requirements) and [agent tab contract](../features/terminals-agents-automation/agent-sets-and-tab-creation.md#requirements); everyday use is in the [project guide](../../../docs/guides/projects.md).

## Initial implementation (2026-11-01)

The original action saved pending editor changes, preserved the task title as the new tab name, and submitted a document reference with predefined instructions in all four UI languages. Initial messages enter the existing startup queue and wait for the session. The transient seed is removed before tab persistence, preventing restored tabs from repeating the request. Duplicate presses during preparation are blocked, and failures remain retryable. The launch resolver follows the stable task ID across title changes and completion moves, synchronizes the resulting editor paths, and stops on deletion, save failure, or project switching.

## Initial verification (2026-11-01)

- `npm run build` passed, including TypeScript compilation. Vite reported the existing chunk-size advisory.
- `node --test src/utils/task-agent.test.ts src/utils/task-agent-launch.test.ts src/utils/agentTabs.test.ts src/utils/agent-startup-queue.test.ts packages/ui/src/i18n.test.ts server/task-agent-ui.test.ts server/task-agent-session-ui.test.ts` passed all 36 tests, including rename/completion resolution, duplicate titles, failure cleanup, and project switching.
- `node --test server/task-agent-ui.test.ts` passed desktop dark and mobile light scenarios, four translated labels, toolbar order, current content, pending and failure recovery, and visibility/access boundaries.
- `node --test server/task-agent-session-ui.test.ts` passed initialization ordering, a single automatic submission, inherited display settings, retained tab title, transient metadata, and restoration without resubmission.
- Targeted Oxlint passed with warnings in the existing React components. The design detector reported no findings. Inspected isolated 1100px dark and 390px light screenshots; the brain action remained the final toolbar control and fit both viewports.
- `node --test src/utils/task-document-sync.test.ts` passed all 5 existing task-document synchronization regressions.
- `npm run check:docs` passed metadata and local-link checks.
- The wider `src/ui-localization.test.ts` run failed its repository-wide Korean-literal scan on existing strings outside this task; its language-switch/cache test passed.

No deployment, launcher, or server lifecycle commands were run. Browser checks used intercepted requests and an in-memory WebSocket fixture; they did not execute an actual agent provider or verify a physical device. The user applies server-side code through the normal operating procedure.

## Runtime selection and editable drafts (2026-11-02)

Changed the task action to open the existing runtime/agent set picker before creating a conversation. After selection, the task title remains the tab name and the localized document reference and instructions appear in the composer. The existing input-draft storage retains edits; the user submits the prompt. Removed the automatic startup-message seed. Direct external requests with a selected runtime, including Mewcat work drafts, keep their existing flow.

The pending request stays outside the tab ledger and is discarded on project/account changes or when an existing conversation is activated. Working-directory validation failures leave the picker retryable; late results cannot apply a pending task to another project. The [task feature contract](../features/projects-files-search/task-panel-list-calendar-and-gantt.md#requirements) and [agent tab contract](../features/terminals-agents-automation/agent-sets-and-tab-creation.md#requirements) own the current behavior.

Local verification:

- `node --test src/utils/task-agent.test.ts src/utils/task-agent-launch.test.ts src/utils/task-document-sync.test.ts src/utils/agentTabs.test.ts src/utils/agentInputDrafts.test.ts src/utils/agent-startup-queue.test.ts server/task-agent-ui.test.ts server/agent-new-tab-ui.test.ts` passed all 42 tests. This includes task resolution and save boundaries, draft storage, startup queues, translated editor actions, runtime selection, and existing tab/shortcut behavior.
- `node --test server/task-agent-session-ui.test.ts` passed all 4 tests across desktop runtime selection, mobile agent set selection, and a split dock whose existing conversation is in a secondary group. Verified deferred tab/connection creation, editable drafts, no automatic submission on session readiness or rerender, explicit submission of edited text, restoration without replay, and cancellation when selecting an existing tab or switching projects, and revealing the task picker in an empty primary dock group.
- `npm run build` passed TypeScript compilation and the production build, with the existing chunk-size advisory.
- Targeted Oxlint passed with React warnings in the existing components. The UI detector reported no findings.
- `npm run check:docs` passed description and local-link checks; `git diff --check` passed.

No deployment, launcher, or server lifecycle operations are part of this change. Browser fixtures intercept HTTP and WebSocket traffic; actual provider execution and physical-device behavior require separate verification.
