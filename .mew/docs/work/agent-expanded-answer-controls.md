---
title: "Expanded agent answer controls"
created: "2026-11-17"
updated: "2026-11-17"
description: "Records the expanded agent answer control layout changes, local verification, and application limits."
---

The initial change placed status, duration, a centered collapse icon, and an in-progress stop control in one bottom bar, with copy and reply controls to the right of a narrower bubble. The [conversation contract](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#task-bubble-status) owns the current behavior.

The Chromium conversation history test passed at desktop and mobile widths in light and dark themes, including the footer, controls, reply draft, stopping, and scrolling. The swipe reply and mobile panel gesture tests, type check, `npm run build`, and `npm run lint` passed; lint and build reported warnings. `npm run check:docs` validated 850 descriptions but reported 39 existing broken or invalid links. The build updated local `dist/` assets; no deployment or server lifecycle operation was performed. Physical-device verification remains open.

The follow-up restores the full bubble width and a sticky top bar with status, duration, and independent copy, reply, and stop controls. Both sticky bars collapse the answer when activated outside their action buttons. The Chromium history test passed at desktop and mobile widths in both themes, covering bar activation, independent actions, and sticky positioning. Swipe and mobile panel gesture tests, `npm run build`, and `npm run lint` passed; build and lint reported warnings. `npm run check:docs` validated 854 descriptions but reported 39 existing broken or invalid links. The build updated local `dist/` assets; no deployment or server lifecycle operation was performed. Physical-device verification remains open.
