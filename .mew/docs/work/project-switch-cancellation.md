---
title: "Project switch cancellation work record"
description: "Records rapid-switch cancellation and the November 5 parallel editor-tab preparation and cached-refresh loading fix. Separates regression/build verification, existing repository documentation errors, and real-instance latency limits."
created: "2026-10-30"
updated: "2026-11-05"
---

## Purpose and result

The root-switch lock discarded project selections made while an earlier switch was pending. A new selection now cancels the obsolete root request and unapplied agent preparation, releases unrelated pending UI metadata, and starts immediately. Late responses, errors, and cleanup cannot replace the latest selection or hide its loading indicator. Selecting the displayed project during a pending switch sends a restoring POST because canceling the earlier response cannot undo a server-side switch.

The displayed root retains its pending restoration until a replacement is confirmed, including when the replacement fails. Duplicate selections of the pending target remain no-ops. Mouse, touch, and Alt+number use the same path. Subproject and worktree mutation locks remain unchanged.

The current contracts are [project selection](../features/projects-files-search/opening-projects-tabs-and-groups.md) and [fast root project switching](../development/ui-project-navigation.md#fast-root-project-switching).

## Verification and application

- `node --test server/workspace-switch-ui.test.ts src/utils/workspace-snapshot-cache.test.ts src/api/client-file.test.ts`: 17 passed. The rapid-switch fixture holds B's response after the server commits B, then verifies that C starts immediately, B's POST and UI preparation abort, obsolete failures do not show a toast or clear C's indicator, and B never hydrates its tree. Mobile touch and Alt+number verify restoring the displayed root during a pending switch. A failed replacement preserves the displayed root's pending metadata. Existing restoration, permission, task, worktree, keyboard, and swipe scenarios also passed.
- `node --test server/project-switcher-ui.test.ts`: 1 passed, including existing keyboard, touch, current-project no-op, icons, and permission boundaries.
- Two new cache regressions verify selective cancellation, preservation of current-root restoration, immediate retries, and exclusion of late responses when a loader ignores cancellation.
- `npm run check:docs`: passed with 567 descriptions, no metadata errors, and no broken local links. A transient missing work-record link from concurrent work was resolved before this final check.
- Targeted oxlint: no errors; 43 existing warnings remain. The Impeccable detector returned no findings for the changed App and selector.
- `npx tsc -b`: passed. An earlier run was blocked by an unrelated icon import that was corrected by concurrent work before the final check.

The App browser fixture keeps the icon context provider and replaces file/folder artwork with inert components, so unrelated icon work does not prevent verification of project navigation. Dock adjacency accepts the existing one-pixel divider without assuming whether its width is included in the dock bounds.

No app build, deployment, launcher execution, or server start or restart was performed. The user must build and apply these changes to running instances. Isolated browser fixtures do not measure production or physical-device switching latency.


## 2026-11-05 — Parallel tab preparation and cached restoration

Project switching waited for the workspace POST before requesting authoritative editor-tab metadata, adding a serial network round trip even when UI and body caches were ready. Explicit selection now starts one fresh editor-tab read alongside the POST. The matching account/project controller consumes that preparation once; later synchronization still reads fresh state. Cancellation, permission and recovery signals, account changes, and scope disposal discard obsolete preparation. The [account tab contract](../development/account-tabs.md#editor-tabs) owns these rules.

Cached tree and body revalidation no longer keeps the whole-workspace loading status visible. Workspace notifications reconcile in the background after initial entry. Cached bodies retain their existing read-only and permission-validation gates. The [fast switching contract](../development/ui-project-navigation.md#fast-root-project-switching) owns display and request ordering.

The App fixture now implements the separate editor-tab ledger in every scenario, including legacy initialization and authoritative fixture updates. Layout checks measure visible panels and use the desktop Dock's current accessibility state; mobile onboarding verifies loaded content independently of the foreground panel.

Verification:

- `node --test server/workspace-switch-ui.test.ts src/hooks/use-account-editor-tabs.test.ts src/utils/account-editor-tabs.test.ts src/utils/workspace-snapshot-cache.test.ts src/api/client-file.test.ts server/editor-file-cache-ui.test.ts server/tab-cache-state-ui.test.ts`: 47 passed. The new App scenario holds the POST while fresh tab metadata completes, verifies single-use hydration, and holds both tree and file responses while the cached destination appears without the workspace status. Hook regressions cover cancellation, account/root isolation, empty authority, recovery invalidation, failure, and cleanup. Existing switching, layout, save, content-cache, and permission checks also pass.
- The broader editor cache check initially failed with the existing invalid `{type: 'leaf', id: 'main'}` fixture layout before any file read. Controlled current/HEAD comparisons reproduced the same failure. Correcting it to `{kind: 'leaf', pane: 'main'}` restored the cached-body, collaboration, and denied-access regression check.
- `npm run build`: passed, including TypeScript project checks; Vite reports its existing large-chunk warning.
- Focused oxlint on the changed source and test files: passed with existing warnings.
- `npm run check:docs`: document descriptions passed; the link phase reports 42 existing missing-target errors, including deleted `.mew/docs/decisions/README.md` and MOC paths. The same repository link checker reports no errors for this task's changed documents. New heading targets were inspected directly.

The workspace POST and fresh tab query remain necessary. Isolated fixtures substitute editor or tool components and do not establish 0.1 ms switching or production latency. The required build updates local `dist/`; no deployment, launcher execution, or server lifecycle operation was performed.
