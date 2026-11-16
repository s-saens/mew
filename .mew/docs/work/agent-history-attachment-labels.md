---
title: "Attachment labels in agent history"
description: "Records localized attachment labels in agent history results, local checks, and verification limits."
created: "2026-11-16"
updated: "2026-11-16"
---

Replace uploaded attachment references in history titles and excerpts with localized media or file labels. The [conversation contract](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#history-search) defines the display; stored messages and search data remain unchanged. Truncated references without a recognizable extension use the file label.

Local verification: `npm run build` and `npm run lint` passed with warnings. History preview browser tests passed at desktop and mobile widths in both themes, and unit tests covered media types, ordinary document references, truncated titles, and all four UI languages. `npm run check:docs` found no description errors and reported 39 unrelated link errors. No deployment or server restart was performed; physical-device verification remains open.
