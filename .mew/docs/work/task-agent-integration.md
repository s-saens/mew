---
title: "Task editor agent integration"
description: "Records the 2026-11-01 task editor brain action, named agent tabs, localized immediate startup requests, isolated regression checks, and runtime application limits."
created: "2026-11-01"
updated: "2026-11-01"
---

Implemented the task editor's rightmost **Run task** brain icon so a task can move directly from its document to an agent conversation. Current behavior belongs to the [task feature contract](../features/projects-files-search/task-panel-list-calendar-and-gantt.md#requirements) and [agent tab contract](../features/terminals-agents-automation/agent-sets-and-tab-creation.md#scope); everyday use is in the [project guide](../../../docs/guides/projects.md).

The action saves pending editor changes, preserves the task title as the new tab name, and submits a document reference with predefined instructions in all four UI languages. Initial messages enter the existing startup queue and wait for the session. The transient seed is removed before tab persistence, preventing restored tabs from repeating the request. Duplicate presses during preparation are blocked, and failures remain retryable. The launch resolver follows the stable task ID across title changes and completion moves, synchronizes the resulting editor paths, and stops on deletion, save failure, or project switching.

## Verification

- `npm run build` passed, including TypeScript compilation. Vite reported the existing chunk-size advisory.
- `node --test src/utils/task-agent.test.ts src/utils/task-agent-launch.test.ts src/utils/agentTabs.test.ts src/utils/agent-startup-queue.test.ts packages/ui/src/i18n.test.ts server/task-agent-ui.test.ts server/task-agent-session-ui.test.ts` passed all 36 tests, including rename/completion resolution, duplicate titles, failure cleanup, and project switching.
- `node --test server/task-agent-ui.test.ts` passed desktop dark and mobile light scenarios, four translated labels, toolbar order, current content, pending and failure recovery, and visibility/access boundaries.
- `node --test server/task-agent-session-ui.test.ts` passed initialization ordering, a single automatic submission, inherited display settings, retained tab title, transient metadata, and restoration without resubmission.
- Targeted Oxlint passed with warnings in the existing React components. The design detector reported no findings. Inspected isolated 1100px dark and 390px light screenshots; the brain action remained the final toolbar control and fit both viewports.
- `node --test src/utils/task-document-sync.test.ts` passed all 5 existing task-document synchronization regressions.
- `npm run check:docs` passed metadata and local-link checks.
- The wider `src/ui-localization.test.ts` run failed its repository-wide Korean-literal scan on existing strings outside this task; its language-switch/cache test passed.

No deployment, launcher, or server lifecycle commands were run. Browser checks used intercepted requests and an in-memory WebSocket fixture; they did not execute an actual agent provider or verify a physical device. The user applies server-side code through the normal operating procedure.
