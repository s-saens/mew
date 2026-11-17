---
title: "Agent answer status dot wrapping"
created: "2026-11-17"
updated: "2026-11-17"
description: "Records the collapsed agent answer status dot and wrapped summary alignment change, local checks, and application limits."
---

Collapsed answer summaries now place the status dot inline with the first line, allowing the second line to start at the dot's left edge. The [conversation contract](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#task-bubble-status) describes the current layout.

The Chromium history test passed the new line alignment assertions in its first viewport but later failed an existing sticky footer assertion. `npm run build` and `npm run lint` passed with warnings. `npm run check:docs` validated 849 descriptions but reported 39 existing broken or invalid links. The build updated local `dist/` assets; no deployment or server lifecycle operation was performed. Physical-device verification remains open.
