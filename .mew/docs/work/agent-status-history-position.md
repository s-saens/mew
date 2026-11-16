---
title: "Agent status beside History"
description: "Records the mistaken response-status move, its reversal, and the relocation of recovery loading dots beside History."
created: "2026-11-16"
updated: "2026-11-16"
---

Move the response status circle from each answer to the History control in the session toolbar. The circle shows the latest response state; the [conversation contract](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md) defines the behavior.

Local verification: `npm run build` and `npm run lint` passed, with lint warnings. The history UI test passed at desktop and mobile widths in both themes. The connection UI test reached the new approval and running status checks, but failed its later automatic tab switching preference assertion. `npm run check:docs` found no description errors and reported 39 missing or invalid links elsewhere in the working tree. No deployment or server restart was performed; physical-device verification remains open.

## Correction

The requested indicator was the recovery loading dots. Restore each answer's status circle and move the connection and command recovery dots from the top of the conversation body to beside History. The [conversation contract](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md) owns the current behavior.

Correction verification: `npm run build` and `npm run lint` passed with warnings. The restored history UI test passed across desktop and mobile widths in both themes. The connection UI test verified the recovery dots and restored approval status before failing the same automatic tab switching preference assertion recorded above; it stopped in the first viewport/theme combination. `npm run check:docs` passed description validation and reported 39 unrelated link errors. Physical-device verification and deployment remain open.
