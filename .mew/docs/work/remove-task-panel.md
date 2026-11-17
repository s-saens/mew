---
title: "Remove the standalone task panel"
description: "Records removal of the task panel from workspace controls and layouts, preservation of task files, verification, and runtime application limits."
created: "2026-11-17"
updated: "2026-11-17"
---

The standalone task panel, dock entry, and shortcut are removed. Saved task groups are dropped when restoring layouts; other panels remain. Existing task Markdown and legacy API data are preserved without database migration. The file AI action continues for ordinary documents. [ADR 0183](../decisions/0183-remove-task-panel.md) records the decision and [the usage guide](../../../docs/guides/projects.md#tasks) describes the remaining path.

Local verification: 32 layout and mobile stack tests passed. The isolated desktop/mobile workspace startup test passed three checks, including a saved task-open state, Alt+T, the absent Dock entry, and no task-list request. `npx tsc -b --pretty false` passed. Targeted Oxlint completed without errors and reported existing React warnings. `npm run check:docs` validated 846 descriptions and reported 39 existing repository link errors. The project build and deployment were disabled for this request; running server assets and server code were not changed.
