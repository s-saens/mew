---
title: "Project switch cancellation work record"
description: "Records the 2026-10-30 fix for rapid project selections: canceling obsolete requests, protecting the latest screen and the displayed root's restoration, regression checks, and the boundary before user build and application."
created: "2026-10-30"
updated: "2026-10-30"
---

## Purpose and result

The root-switch lock discarded project selections made while an earlier switch was pending. A new selection now cancels the obsolete root request and unapplied agent preparation, releases unrelated pending UI metadata, and starts immediately. Late responses, errors, and cleanup cannot replace the latest selection or hide its loading indicator. Selecting the displayed project during a pending switch sends a restoring POST because canceling the earlier response cannot undo a server-side switch.

The displayed root retains its pending restoration until a replacement is confirmed, including when the replacement fails. Duplicate selections of the pending target remain no-ops. Mouse, touch, and Alt+number use the same path. Subproject and worktree mutation locks remain unchanged.

The current contracts are [project selection](../features/projects-files-search/opening-projects-tabs-and-groups.md) and [fast root project switching](../development/ui-contracts.md#fast-root-project-switching).

## Verification and application

- `node --test server/workspace-switch-ui.test.ts src/utils/workspace-snapshot-cache.test.ts src/api/client-file.test.ts`: 17 passed. The rapid-switch fixture holds B's response after the server commits B, then verifies that C starts immediately, B's POST and UI preparation abort, obsolete failures do not show a toast or clear C's indicator, and B never hydrates its tree. Mobile touch and Alt+number verify restoring the displayed root during a pending switch. A failed replacement preserves the displayed root's pending metadata. Existing restoration, permission, task, worktree, keyboard, and swipe scenarios also passed.
- `node --test server/project-switcher-ui.test.ts`: 1 passed, including existing keyboard, touch, current-project no-op, icons, and permission boundaries.
- Two new cache regressions verify selective cancellation, preservation of current-root restoration, immediate retries, and exclusion of late responses when a loader ignores cancellation.
- `npm run check:docs`: passed with 567 descriptions, no metadata errors, and no broken local links. A transient missing work-record link from concurrent work was resolved before this final check.
- Targeted oxlint: no errors; 43 existing warnings remain. The Impeccable detector returned no findings for the changed App and selector.
- `npx tsc -b`: passed. An earlier run was blocked by an unrelated icon import that was corrected by concurrent work before the final check.

The App browser fixture keeps the icon context provider and replaces file/folder artwork with inert components, so unrelated icon work does not prevent verification of project navigation. Dock adjacency accepts the existing one-pixel divider without assuming whether its width is included in the dock bounds.

No app build, deployment, launcher execution, or server start or restart was performed. The user must build and apply these changes to running instances. Isolated browser fixtures do not measure production or physical-device switching latency.
