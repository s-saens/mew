---
title: "Attachment labels in agent history"
description: "Records localized attachment and document labels in agent history results, local checks, and verification limits."
created: "2026-11-16"
updated: "2026-11-16"
---

Replace uploaded attachment references in history titles and excerpts with localized media or file labels. The [conversation contract](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#history-search) defines the display; stored messages and search data remain unchanged. Truncated references without a recognizable extension use the file label.

Local verification: `npm run build` and `npm run lint` passed with warnings. History preview browser tests passed at desktop and mobile widths in both themes, and unit tests covered media types, ordinary document references, truncated titles, and all four UI languages. `npm run check:docs` found no description errors and reported 39 unrelated link errors. No deployment or server restart was performed; physical-device verification remains open.

## Document reference follow-up

History titles and excerpts also display document references as localized document labels, including titled and legacy references. Existing attachment labels and search data remain unchanged. Local verification on November 17: `npm run build` and `npm run lint` passed with warnings; focused unit and history preview UI tests passed at desktop and mobile widths in both themes. `npm run check:docs` reported no description errors and 39 unrelated link errors. No deployment or server restart was performed; physical-device verification remains open.
