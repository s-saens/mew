---
title: "Multi-project mode implementation and verification"
description: "Original design, staged implementation, and local verification of optional desktop multi-project mode. Records scoped requests and execution, retained compact workspaces, fractional zoom sizing, live panel rearrangement, lifecycle regressions, synthetic measurements, operational limits, and selector and header follow-ups."
created: "2026-11-06"
updated: "2026-11-08"
---

# Multi-project mode implementation plan

## Purpose and current state

Add the optional desktop mode described in the [feature specification](../features/appearance-accounts-operations/multi-project-mode.md), using the session architecture accepted in [ADR 0152](../decisions/0152-multi-project-workspace-sessions.md). The user requested design and a maintainable, efficient implementation plan before gradual implementation, then confirmed movement through a dedicated handle and authorized implementation.

On 2026-11-06, the main agent and two read-only reviews inspected the current boundaries. No application files were changed, and no application tests, build, deployment, launcher, or server lifecycle operations were performed during this design stage. The workspace already contained unrelated edits; keep them out of this task's commits.

The referenced `.mew/docs/decisions/README.md` is absent in the current working tree. The existing `decisions/_decisions.md` supplies the current numbering and ownership instructions. This task does not restore or overwrite the unrelated deletion.

## Findings that determine the sequence

| Observed boundary | Implication |
| --- | --- |
| `App.tsx` combines account services and project state; `client.ts` and `contentCache.ts` use mutable project/root defaults | Extract explicit session and cache ownership before mounting multiple workspaces. |
| `account-workspace.ts`, API middleware, and upgrade wrappers resolve the account's active root | A multi-panel UI needs an explicit request context. A layout-only change cannot isolate reads or writes. |
| `workspace.ts` writes account selection and broadcasts on a switch | Separate panel destination resolution from the existing account selection operation. |
| `projectPath` and actual root differ during worktree switching | Preserve both identities across requests, snapshots, caches, and restoration. |
| `live-sources.ts` re-enters account scope during authorization; DB hub keys lack the actual root | Audit ongoing delivery and revocation as well as initial connection setup. |
| Dock, mobile controls, and tools consult viewport media queries; focus helpers search the whole document | Introduce explicit presentation and view ownership before reusing the compact UI on desktop. |
| Single-project geometry and account/project tab ledgers already have separate owners | Add board storage without migrating existing tabs into another source of truth. |

## Original implementation sequence

Stages are dependency ordered. Each stage gets a focused diff, meaningful regression tests, canonical documentation updates, required verification, and a logical commit. Keep the multi-project UI unavailable while its scope prerequisites are incomplete. Review the diff and observed results before advancing; elapsed time is not a completion criterion.

### 0. Design and plan

- [x] Capture required behavior, terminology, and defaults separately from existing implemented behavior.
- [x] Compare duplicate-app, iframe, and scoped-session approaches.
- [x] Review server root/worktree and client state/presentation boundaries independently.
- [x] Define stages and failure-oriented acceptance tests.
- [x] Record documentation-check results below.

### 1. Explicit server workspace context

Introduce a small shared scope representation and one server resolver. Inventory ordinary HTTP, uploads/downloads, raw/image URLs, SSE where used, WebSocket handshakes, collaboration, agent/terminal creation, debugger/Git live sources, and local/Mewlink transport paths before choosing the final encoding.

Keep legacy unscoped account behavior. Explicit requests validate the authenticated user's target and never fall back to another project. Add an operation that prepares a project/worktree scope and workspace snapshot in the same validated context without changing account selection. Check the current `hasProject` derivation as well as path fields. Preserve existing file/task/Git/upload preconditions, reject contradictory scope values, and audit routes that rebind their context internally. Reuse path validation, permissions, and `AsyncLocalStorage`; avoid creating a second project registry.

Likely owners: `server/account-workspace.ts`, `server/paths.ts`, `server/workspace.ts`, `server/api.ts`, `server/reqAuth.ts`, `server/live-sources.ts`, affected socket/event sources, and a focused `shared/` scope module. Changes to these files are planned, not an instruction to edit every file.

Exit gate: two concurrent requests by one account can read and mutate identical relative paths under different roots correctly; a simultaneous legacy client's project/worktree changes leave explicit panels fixed; panel resolution leaves account selection unchanged; worktree identity survives subsequent requests; malformed/unauthorized scopes fail explicitly; bound live sources revalidate permissions and stay independent of another panel's selection. Include remote transport and resource URL coverage.

Write-back: [architecture](../development/architecture.md), [access control](../development/access-control.md), relevant live/collaboration owners, and the ADR's finalized scope decision. Record the wire contract once in its shared owner.

### 2. Scoped clients, caches, and subscriptions

Introduce the immutable workspace-client boundary above the shared transport. Convert project-facing API functions and factories incrementally. Keep an explicit single-project compatibility adapter only while migrating call sites; multi-project callers cannot depend on the adapter's mutable defaults.

Make cache operations accept identity and root explicitly while retaining existing storage limits and revision protection. Classify events as account-global, logical-project, actual-root, or view-local. Coalesce account reads and root subscriptions; pin delayed saves, uploads, Git actions, and session creation to the initiating scope.

Likely owners: `src/api/`, `src/runtime/app-runtime.ts`, `src/utils/remote-transport.ts`, `src/utils/contentCache.ts`, account-tab controllers, presence/live adapters, and their focused tests.

Exit gate: two clients in one JavaScript realm remain independent during concurrent reads, saves, delayed responses, cancellation, reconnect, and permission changes. Same-name files and resources never share content by accident. A remaining unscoped project API is inventoried and blocks exposure of the relevant tool in multi-project mode until migrated. Update the demo transport alongside the scope contract.

Write-back: [account tabs](../development/account-tabs.md), [browser storage](../development/browser-storage.md), transport and collaboration owners as affected.

### 3. Separate app services and project sessions in the existing UI

Extract the app shell and focused project session controllers from `App.tsx` while continuing to render the existing single-project workspace. Move global services once; preserve project-specific hooks behind explicit providers or arguments. Keep domain state out of board geometry and DOM state out of server scope.

Introduce the active-view command target and scoped DOM lookup. Preserve shortcut priority, modal dismissal, remote-screen keyboard ownership, and project-scoped menu actions. Do not replace every component or change visible layouts in this stage.

Exit gate: existing project switch, account-tab synchronization, autosave, agent/terminal restoration, editor focus, and single-project layout tests pass. There is one owner of each global service. Pending save/error state remains owned across session handoffs; no broad context update rerenders every workspace.

Write-back: [UI workspace layout](../development/ui-workspace-layout.md), [UI project navigation](../development/ui-project-navigation.md), and the current startup and account-tab owners where boundaries change.

### 4. Reuse compact workspace presentation

Extract the current mobile workspace composition into a compact view that accepts a session and explicit presentation settings. Use it first on actual mobile, then in an isolated desktop container. Audit responsive CSS and `matchMedia` use by responsibility; presentation follows the container, input capabilities follow the device.

Give repeated controls unique IDs, scope tool lookup and drag data to the owning view, and retain one overlay/dismissal system. Project panels expose their local header and X; global header controls remain in the shell. Use one shared page background.

Exit gate: one compact desktop project workspace and the physical-mobile fixture both support file, agent, terminal, Git, task, and browser entry flows permitted by capabilities. Native Browser/login retain one app-owned viewer; invoking it from a second panel must not create competing attachments. Verify mouse and keyboard focus, IME, tab scrolling, dock overflow, popup bounds, safe areas, and continuous gradient surfaces. A compact panel wider than the old mobile breakpoint must still use compact presentation.

Write-back: shared UI layout/input/overlay contracts and the multi-project feature's implemented subset. Preserve status distinctions until the board is complete.

### 5. Add the board and mode control

Implement a pure board reducer/normalizer with column widths, weighted rows, stable panel IDs, and independent versioned persistence. Add the two mode choices to the existing Layout control. Reuse existing icon, tooltip, pointer-drag, and focus primitives; keep board identity separate from tool Dock groups.

Connect add/replace intent to the project selection panel. Implement the one-panel initial state, empty-board state, independent tool selection, title movement, keyboard movement, boundary resizing, active-panel targeting, and close lifecycle. Use the feature's duplicate-project policy. Preserve single-project presets and all mobile records.

Exit gate: the supplied one-panel layout and a usable multi-row layout are reproducible; adding, replacing, moving, resizing, closing, and reloading affect the intended panel; draft/save queues and editor selection/undo survive mode changes. Missing/corrupt storage normalizes safely; another account cannot inherit the board. Project removal and permission revocation recover locally.

Write-back: feature requirements/status, UI layout/navigation contracts, affected public guides, translations, and ADR status. Add current usage instructions only when the controls exist.

### 6. Integration, efficiency, and completion

Run the integrated scenarios below against the assembled feature. Measure the documented one-, three-, and ten-panel fixtures with representative editors and agents; compare against the single-project baseline. Track requests, heavy tool mounts, subscriptions/listeners, memory, and interaction timing. Record observed figures and environment; do not declare a performance target met from architecture alone.

Complete `npm run build`, applicable type checks and lint, focused automated regressions, browser checks, and `npm run check:docs`. Fix build failures and rerun. The required build updates assets in `dist/`; it does not authorize deployment, launcher execution, or starting, stopping, or restarting a server. Runtime application and physical-device verification remain distinct user-owned steps under the [execution rules](../development/getting-started.md).

Exit gate: every required feature criterion has actual evidence or an explicit blocker. Remove temporary compatibility paths only after all callers have migrated and their regression tests cover the replacement.

## Integrated verification matrix

| Scenario | Required evidence |
| --- | --- |
| Two roots with `notes.md`, the same image name, and identical DB IDs | Reads, edits, saves, resources, collaboration, DB events, presence participants, and tree delivery remain root-correct. |
| A legacy single-project client changes roots/worktrees on the same account | Explicit panels keep their scopes while still receiving relevant account tab/catalog changes. |
| A slow save from A while B gains focus or A switches to C | The write stays bound to A; late replies cannot replace C's state. Save failures retain recovery state. |
| Worktree changes in one panel | Logical-project tab ownership remains stable; file/Git/task requests use that panel's actual worktree. |
| Modes and mobile | Single → multi → single → multi, refresh, viewport change, and actual mobile restoration preserve their separate layouts and drafts. |
| Focus and overlays | Shortcuts fire once in the intended view; local and global popups preserve their owner, focus return, keyboard, Esc/Back, and remote-input priority. |
| Close and teardown | Agent/terminal jobs continue; subscriptions and view listeners are released; pending writes are retained or completed safely. |
| Project deletion and access loss | Every affected open panel stops unauthorized access and rejects late live responses; unrelated panels remain usable. |
| Local and Mewlink | HTTP, resource URLs, sockets, reconnect, and identity changes retain the same scope and cleanup behavior. |
| Theme and geometry | One background, no duplicate global controls, usable one-panel and multi-row sizes, keyboard resize/movement, dark/light themes, and reduced motion. |
| Efficiency | Global collectors and browser-session identity remain singular; hidden tool work is bounded; repeated open/close cycles do not accumulate listeners or subscriptions. |
| Native Browser and login | Multiple project Dock actions share the existing account viewer; changing the invoking panel cannot repeatedly replace another viewer. Localhost app tabs retain their separate behavior. |

Use existing Node unit/integration tests and test-owned Chromium fixtures through `connectTestBrowser`. Do not start an application server for these checks. Isolated Postgres tests require the explicit test database documented in the execution rules. Browser fixtures and mocked transports do not establish physical-device or live-provider behavior.

## Design-stage evidence

At the design checkpoint, read-only inspection and two independent architectural reviews were complete; application implementation and runtime verification were still pending. Preserve the following results as evidence of that checkpoint.

- `npm run check:docs`: description validation passed for 747 documents with zero errors. Link validation failed with 39 missing-target errors outside this task's five changed documents, including existing MOC references and the absent decisions README. These unrelated links remain unchanged.
- `git diff --check`: passed after the initial design edits. Recheck the final staged diff before committing.
- The existing link checker, filtered to the five changed documents, reported zero local link errors. No existing heading anchors were renamed; new anchor links were inspected against their target headings.
- No application tests or build ran: this stage changes documentation only. Future implementation must satisfy each stage's tests and the required build.

## Implementation record — 2026-11-07

The implementation followed the dependency order above: validated server scopes, immutable clients and scoped cache/queue ownership, account services and project views, compact presentation, board geometry, then assembled-App regressions. Independent agents implemented or reviewed the server boundary, client isolation, pure board model, and real browser integration. The original single-project mode remains the default.

The design checkpoint was committed separately. The source changes form one integrated feature commit so the request, client/provider, and rendering contracts ship together after their focused stage checks.

| Area | Result and owning contract |
| --- | --- |
| Requests and live sources | Added actual/logical workspace scope to HTTP, resources, sockets, task streams, collaboration, presence, watchers, and authorization. Panel destinations resolve without changing account selection or depending on an unavailable originating root. Server version advertisement gates restoration and exposure of the board; an older server retains the legacy single screen without sending explicit requests. [Workspace sessions](../development/workspace-sessions.md) owns the wire and permission contract. |
| Client state | Bound delayed saves, images/downloads, editor cache, task-document coordination, agent commands, drawing, and debugger clients to the initiating root. Account tab ledgers retain logical-project ownership. |
| App composition | Extracted account services, one presence connection, one Mewpet, and one shared native Browser above retained project hosts. Compact tools use explicit presentation and owning DOM roots. Global shortcuts and project command menus target the active view. |
| Geometry and restoration | Added the optional mode control, dedicated movement handles, columns/weighted rows, accessible resize boundaries, and separate device/account mode and board records. A shared hydration guard prevents outgoing geometry from overwriting incoming compact/single/mobile records. [UI workspace layout](../development/ui-workspace-layout.md#multi-project-board-and-compact-presentation) owns the implementation contract. |
| Handoffs | A panel becomes inert before the save barrier and remains protected through project replacement or close. Failed transitions restore interaction. Legacy selection is confirmed before binding an unscoped client; responsive fallback retains the single selection independently of board replacement. Shared assistant actions wait for the destination controller to become ready. |
| Input and execution | Scoped unsent drafts and history by account plus logical/actual roots. Added regressions for identical tab IDs and delayed old-view setters. Terminal and CLI identity changes are documented in [Workspace sessions](../development/workspace-sessions.md). |
| Shared overlays | Fixed asynchronous History-guard removal consuming a newly opened tool. Added explicit dialog focus-return ownership so choosing an existing project cannot focus the invoking panel again. [Overlay dismissal](../development/ui-overlays.md#overlay-dismissal-rules-useoverlaydismiss) owns those rules. |

### Local verification

Checks below use isolated fixtures and test-owned browsers, without starting an application server. Counts are per command/group and can overlap; they are not a summed coverage claim.

| Check | Observed result |
| --- | --- |
| `node --test src/api/client-scope.test.ts src/utils/contentCache.test.ts src/utils/database-page-mutations.test.ts src/utils/task-document-sync.test.ts src/demo/collaboration.test.ts` | 27 tests passed in the final run. Covers captured roots, advertised support, canonicalized paths, delayed responses, resources/sockets, cache separation, root-scoped mutation/task queues, and demo collaboration. |
| `node --test src/hooks/use-root-project-tabs.test.ts src/workspace-loading.browser.test.ts` | 10 tests passed. Covers account-global project shortcuts and lazy authenticated startup. |
| `node --test src/utils/device-layout.test.ts src/hooks/use-device-layout.test.ts src/workspace/workspace-presence.test.ts` | Focused checks passed independently: four geometry cases, retained-editor hydration/selection, and single-connection root event/focus routing. Presence also deduplicates running-agent counts by actual root. |
| Board, compact view, focus, panel dismissal, shared overlay, and browser History regressions | 38 tests passed in the board agent's focused group. Covers mouse/touch handles, cancellation, keyboard movement/resizing, stable hosts, unique IDs, active shortcut routing, and overlay cleanup. |
| New server scope and execution checks | Earlier scope/live/watcher/file/task/DB guard group: 44 passed. Final terminal/command/scope/account/worktree group: 19 passed. Version/snapshot regressions: 7 passed. New authenticated execution retains the same qualified identity in both modes; unknown-root older artifacts remain legacy-only. |
| Two real scoped AgentPanels and resource viewers | Resource/draft group: 14 tests passed; task-agent input/draft matrix: 4 passed; existing Mewpet App action fixture: 1 passed. Covers identical tab IDs, active-only references, scoped links/images/CSV/downloads, socket roots, preserved unsent text, and stale-setter rejection. |
| `node --test server/workspace-tabs-scope-ui.test.ts` | Passed. Real tab/cache/save controllers keep same-name files and delayed writes independent across roots. |
| `server/agent-command-recovery-ui.test.ts` | Passed after adding a scope-change regression for cached command records, including late-read cancellation and removal of records from the previous scope. |
| Existing deferred-dialog and PDF fixtures | Both passed. Deferred settings retain their requested outer layer and close/retry/focus behavior; the PDF fixture retains its existing 500-page virtualization check. |

The assembled-App fixture mounts the real shell/controllers, account-tab and save hooks, compact CSS, project selection, command menu, and shared overlay code. Its editor, agent, and Git bodies use small test substitutes. It verifies distinct same-name files, delayed autosave under another active project, independent tools, project-name selection, one active command shortcut, mode changes without editor remount, separate saved chrome, empty/no-project recovery, old-server fallback, and shared assistant delivery after a destination handoff. Final results: shell 12/12 and assembled App 4/4 passed. Startup 3/3, catalog UI 1/1, and the earlier Add/Switcher group 12/12 also passed. The catalog is deferred through one shared component, including existing selection/setup consumers, so a closed catalog does not download during startup.

### Synthetic efficiency sample

One run of the assembled-App fixture in test-owned Chromium used a 1700px desktop viewport, mocked HTTP/socket transport, and substituted tool bodies. Measurements include Playwright overhead and two animation frames; they are observations rather than performance budgets. Explicit garbage collection preceded heap/listener sampling.

| Open project panels | 1 | 3 | 10 |
| --- | --- | --- | --- |
| Cumulative mocked API requests | 29 | 70 | 190 |
| DOM elements | 156 | 346 | 1011 |
| Event listeners | 877 | 1555 | 3928 |
| Heap, approximately MB | 10.8 | 12.0 | 14.9 |
| Pointer selection plus two paints, ms | 95 | 74 | 78 |
| Single/multi mode round trip, ms | 249 | 350 | 369 |

At every sample there was one global menu and one presence socket, with exactly one editor mount per project and no editor unmount during mode changes. Closing all ten board panels removed their views and Docks, unmounted ten editors, and reduced the sampled listener count to 487. Remaining listeners belong to the still-mounted app/account shell. These figures do not measure live providers, terminal/GPU work, real editor engines, physical IME, or production Mewlink behavior; later source changes can alter request and allocation counts.

Light and midnight-gradient browser fixtures also confirmed three 400px panels, 44px bottom Docks, transparent panel backgrounds, and one continuous backdrop. Tool bodies in those images are substitutes; screenshots were temporary verification artifacts.

### Limits and operational application

- Explicit-scope Postgres remains disabled; DB-bound Markdown saves fail before a write. Ordinary files and Markdown are supported, and the existing database workflow remains in single-project mode. The [canonical restriction](../development/workspace-sessions.md#current-postgres-restriction) specifies the exact boundary.
- The existing `server/agent-command-ui.test.ts` reached an unrelated composer minimum-height assertion and failed because it expected 117px while the current composer measured 121px. The calculation and associated layout match the saved pre-task AgentPanel content. This task does not rewrite that separate composer change or claim the test passed.
- An earlier combined startup check exposed the new shell's handling of optional `hasProject` and an account-hook fixture dependency; both were corrected. Account/lazy startup and final real-shell startup then passed.
- No production database, external AI provider, physical mobile device, Windows host, or deployed Mewlink session was used to establish these results. Automated checks do not establish undo/IME behavior of every real editor engine.
- No deployment, launcher execution, or application server start/stop/restart was performed. The required build changes browser assets; loading changed server code remains an operator action.

### Completion checks

- `npm run build`: passed in the working checkout and in a separate source export containing only this task's intended commit. Both app and server TypeScript projects were checked by `tsc -b`; Vite retained its chunk-size advisory.
- The first task-only export exposed two incomplete contracts already referenced by HEAD: `DialogFrame.overlayClassName` in the deferred-dialog caller and one missing agent scroll-label translation. The minimum shared option/label definitions are included as build prerequisites. Other pending image-editor/media changes remain outside this task. The task-only export then built successfully.
- `npm run lint`: passed with no errors; React and other advisory warnings remain. Focused new fixture lint and `git diff --check` also passed.
- `npm run check:docs`: 751 descriptions passed with zero metadata errors. Global link validation remains blocked by 37 preexisting missing MOC/README targets outside this task's changed documents. The changed documents' local links were checked separately.
- Final task-path and staged-diff review exclude unrelated work. The commit includes the feature's source, regression tests, canonical contracts, ADR update, user guide, and this work record. No push or operational application is part of the task.

## Panel movement follow-up — 2026-11-08

The user reported that moving project panels felt abrupt and requested animation. The follow-up makes the dragged panel follow the pointer, animates settling and rearrangement after release, cancellation, or keyboard movement, and honors reduced-motion preferences. The current interaction contract belongs to [UI workspace layout](../development/ui-workspace-layout.md#multi-project-board-and-compact-presentation) and [Multi-project mode](../features/appearance-accounts-operations/multi-project-mode.md#project-selection-movement-and-resizing).

Local verification passed: the project-board browser tests (7), board model tests (10), `npm run build`, and `npm run lint` (with advisory warnings). The browser tests cover direct tracking, drop and cancellation animation, keyboard movement, reduced motion, and scroll-aware placement. `npm run check:docs` passed all 761 descriptions but reported 37 preexisting missing links outside the changed documents; the changed documents' links passed separately. The build reported its existing large-chunk warning. These checks did not deploy or restart the application.

## Panel-scoped project selector — 2026-11-08

The project selector in multi-project mode previously covered the entire viewport. It now covers the invoking project panel, including its header, while other panels remain interactive. Activating another panel closes the selector; Esc closes it and restores focus to the project name. The [feature contract](../features/appearance-accounts-operations/multi-project-mode.md#project-selection-movement-and-resizing) owns the current behavior.

Local Chromium checks passed in `src/workspace/multi-project-app.browser.test.ts` (4 tests), including panel bounds, another panel's editable input, Esc and focus restoration, and project selection. `src/workspace/workspace-view.browser.test.ts` passed (1 test). `npm run build` and `npm run lint` passed with advisory warnings. `npm run check:docs` checked all descriptions without errors but reported 37 preexisting missing links outside these changes. The checks use mocked workspace transport and do not establish physical-device behavior. No deployment or server lifecycle operation was performed; the build updates the assets served by a running instance.


## New panel selection — 2026-11-08

The board's add action now creates an unselected panel first and shows the My/All project selector and setup action inside it. Selection opens the project in that slot; cancellation removes the temporary panel, and a duplicate selection focuses the existing project. Temporary panels are excluded from saved layouts. The [feature contract](../features/appearance-accounts-operations/multi-project-mode.md#project-selection-movement-and-resizing) owns the current behavior.

Local Chromium checks passed in the multi-project application and workspace application fixtures (17 tests), covering the panel bounds, other-panel editing, cancellation, duplicates, selection, reload, and adding to an empty board. Project-board browser and model tests passed (17 tests). `npm run build` and `npm run lint` passed with advisory warnings. `npm run check:docs` passed description validation but reported 37 existing missing links outside these changes. Browser fixtures use mocked transport; physical-device behavior was not checked. No deployment or server lifecycle operation was performed. The build updates the assets served by a running instance.


## Project header hover surfaces — 2026-11-08

The project title and command action now use compact rounded hover surfaces consistent with the close button. The title retains its header-height click target and truncates long names; the command and close buttons remain aligned. The [feature contract](../features/appearance-accounts-operations/multi-project-mode.md#shared-and-local-controls) owns the current behavior.

The multi-project application Chromium fixture passed all 6 tests, including narrow-panel hover geometry, long-name truncation, and title and command actions. A local hover capture was inspected. `npm run build` and `npm run lint` passed with advisory warnings. `npm run check:docs` validated descriptions but reported 37 existing missing links outside these changes. The browser fixture uses mocked transport; physical-device behavior was not checked. No deployment or server lifecycle operation was performed. The build updates the assets served by a running instance.

## Live panel rearrangement — 2026-11-08

The panel movement follow-up previews the target arrangement during dragging, so surrounding panels move as the pointer crosses targets. Release commits the preview; Esc and pointer cancellation restore the original layout. The [feature contract](../features/appearance-accounts-operations/multi-project-mode.md#project-selection-movement-and-resizing) owns the interaction, and [UI workspace layout](../development/ui-workspace-layout.md#multi-project-board-and-compact-presentation) owns its implementation boundaries.

Local verification passed: eight project-board browser tests, ten board model tests, six assembled multi-project browser tests, `npm run build`, and `npm run lint` with advisory warnings. The board tests cover live row and column previews, commit and cancellation, scrolling, reduced motion, and retained drafts. `npm run check:docs` validated 763 descriptions but reported 37 existing missing links outside the changed documents; the changed documents' links passed separately. The build retained its large-chunk advisory. The browser fixtures use mocked transport; physical-device behavior was not checked. No deployment or server lifecycle operation was performed. The build updates the assets served by a running instance.

## Fractional board sizing — 2026-11-09

The board previously rounded its available size to integer CSS pixels before assigning the surface and panel geometry. At fractional sizes this left a gap or overflow at the panel edge. It now uses the observed content-box dimensions and ignores unchanged measurements. The current geometry contract is in [UI workspace layout](../development/ui-workspace-layout.md#multi-project-board-and-compact-presentation).

The new isolated Chromium regression failed before the change and passed afterward at CSS zoom 140% and 150%, sampling multiple frames and checking panel alignment and unwanted vertical scrolling at two fractional heights. All 25 project-board browser, board model, and assembled multi-project browser tests passed. `npm run build` and `npm run lint` passed with advisory warnings. `npm run check:docs` validated 764 descriptions and reported 37 existing missing links outside these changes. The fixture uses CSS zoom and mocked content; it does not establish the behavior of the reported live browser session. No deployment or server lifecycle operation was performed. The build updates assets served by a running instance.
