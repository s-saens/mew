---
title: "Shared Loading Indicator Work Record"
description: "Records circular attachment indicator restoration on 2026-10-27 and continuous logo highlight rotation across React loading-stage replacements on 2026-10-30. Distinguishes isolated verification from application to the running instance."
created: "2026-10-27"
updated: "2026-10-30"
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

## Continuous logo rotation — 2026-10-30

Loading-stage changes replaced the React logo element, restarting its highlight at zero. `LoadingIndicator` now aligns each running logo animation to the document timeline origin in a layout effect before paint. Startup, authentication, workspace preparation, and restoration indicators therefore share the same rotation phase within the page. The existing 2.4-second CSS transform animation continues without a JavaScript frame loop. Paused indicators, reduced motion, dots, and circular spinners retain their existing behavior.

The regression fixture replaces the logo three times at desktop and mobile widths, comparing its animation time and phase against a continuously mounted logo. The original implementation failed the initial regression check; the corrected implementation passed the shared indicator, workspace-loading, and editor-loading browser tests (12 tests total). The refined regression assertions also passed in a separate shared-indicator test run.

- `npx tsc -b`: passed.
- `npx oxlint packages/ui/src/loading-indicator.tsx packages/ui/src/loading-indicator.browser.test.ts`: passed.
- `npm run check:docs`: 559 descriptions and all document links passed.
- Impeccable's detector reported no findings for the changed component; `git diff --check` passed.

This change has not been built or applied to the running instance. Separate Mewlink launcher documents and frame transitions are outside this page-local synchronization.
