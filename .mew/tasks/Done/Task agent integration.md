---
title: "Task agent integration"
description: "Completed implementation of the task editor brain action, named agent conversations, localized immediate document-first requests, and regression verification."
done: "true"
tags:
  - 기능
assignees:
  - songsh5775@gmail.com
---

Add a brain icon matching the agent panel at the far right of the task editor's floating toolbar. Clicking it opens a new agent tab named after the task, references the task document, and immediately submits a predefined instruction in the current UI language: organize the task document first, then implement its contents.

Implemented with pending-editor saves, stable task identity across renames and completion moves, access checks, duplicate-press protection, and a one-shot startup queue that does not replay requests when tabs are restored.

See the [feature contract](../../docs/features/projects-files-search/task-panel-list-calendar-and-gantt.md#requirements) and [implementation and verification record](../../docs/work/task-agent-integration.md). Local verification is separate from user-owned runtime application.
