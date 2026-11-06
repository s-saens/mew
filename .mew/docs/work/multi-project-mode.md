---
title: "Multi-project mode design and implementation plan"
description: "Design-stage record and phased implementation plan for optional desktop multi-project mode. Maps request, state, compact UI, board, and integration work to regression gates; records read-only findings, pending implementation, and documentation verification separately from runtime application."
created: "2026-11-06"
updated: "2026-11-06"
---

# Multi-project mode implementation plan

## Purpose and current state

Add the optional desktop mode described in the [feature specification](../features/appearance-accounts-operations/multi-project-mode.md), using the session architecture proposed in [ADR 0152](../decisions/0152-multi-project-workspace-sessions.md). The user requested design and a maintainable, efficient implementation plan before gradual implementation.

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

## Implementation sequence

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

Read-only inspection and two independent architectural reviews are complete. Application implementation and runtime verification are pending.

- `npm run check:docs`: description validation passed for 747 documents with zero errors. Link validation failed with 39 missing-target errors outside this task's five changed documents, including existing MOC references and the absent decisions README. These unrelated links remain unchanged.
- `git diff --check`: passed after the initial design edits. Recheck the final staged diff before committing.
- The existing link checker, filtered to the five changed documents, reported zero local link errors. No existing heading anchors were renamed; new anchor links were inspected against their target headings.
- No application tests or build ran: this stage changes documentation only. Future implementation must satisfy each stage's tests and the required build.
