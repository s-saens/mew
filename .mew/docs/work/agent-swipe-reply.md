---
title: "Agent message swipe reply"
created: "2026-11-17"
updated: "2026-11-17"
description: "Records the agent conversation swipe-to-reply implementation, local verification, and application limits."
---

Agent conversations now let users swipe a text-bearing question or answer left, or choose its Reply button, to add an editable Markdown quote to the composer. This provides context for a follow-up without replacing the existing draft or introducing a separate message transport. The [conversation contract](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#reply-to-a-message) owns the current behavior.

The reply gesture and mobile panel swipe regression tests passed locally. `npm run build` and `npm run lint` passed; lint reported warnings. `npm run check:docs` validated 844 descriptions but failed on 39 existing broken or invalid links. The build updated the local `dist/` assets served by a running instance; no deployment or server lifecycle operation was performed. Physical-device interaction has not been verified.
