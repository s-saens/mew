---
title: "Attachment Circular Indicator Restoration Work Record"
description: "Implementation work record for 2026-10-27 covering the restoration of circular indicators in agent attachment upload tags and the classification of shared logo, three-dot, and circular indicators. Distinguishes verification results from production application status."
created: "2026-10-27"
updated: "2026-10-27"
---

## Purpose and resulting behavior

Restore the three dots used in attachment upload tags to the previous circular indicator and document the three shared indicator types and their selection criteria. Upload-pending tags in new input and pending queue editing use a 12px circular indicator, which changes to a file type icon on completion. User bubble tags retain the completed icons.

The current contracts are owned by [Shared Loading Indicators](../development/ui-contracts.md#shared-loading-indicators) and the [Input and Attachment Feature Contract](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md), and the decision is owned by [ADR 0075](../decisions/0075-attachment-spinner-indicator.md).

## Verification and application

- `node --test packages/ui/src/loading-indicator.browser.test.ts server/agent-composer-attachments-ui.test.ts`: 47 checks passed. Verified the shared circular indicator's size, color, rotation, stopped state, reduced motion, and forced colors, along with circular attachment upload indicators at 1100/390px in light/dark themes, icon restoration after completion, editing, and undo.
- `npx tsc -b` and `npx oxlint` on the 4 changed TypeScript files: passed.
- Rendered 12px circular attachment tags on light/dark backgrounds in isolated Chromium and visually verified them.
- `npm run check:docs`: 488 descriptions passed without errors. The full link check failed due to 17 existing links to deleted feature MOC and task documents unrelated to this work. There are no link errors in the documents changed in this work.

Do not build or deploy the app, or start, stop, or restart the server. The user must apply the changes to the running instance after building; visual verification on actual mobile devices is separate.
