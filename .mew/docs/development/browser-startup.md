---
title: "Browser startup and deferred loading"
description: "Browser routes and current startup contracts for runtime authentication, storage scope, initial workspace snapshots, editor and optional module preparation, failure handling, and chunk boundaries. Separates verification contracts from verbatim historical isolated measurements."
created: "2026-11-03"
updated: "2026-11-03"
---

## Application routes and missing pages

`shared/app-route.ts` classifies the workspace entry (`/` or `/index.html`), valid typed public-share paths, and unknown paths. The browser also accepts the runtime's configured base path for the demo. A Mewlink app frame uses its existing authenticated bootstrap and the `sharePath` supplied by its parent, rather than classifying its opaque resource URL as a workspace path.

Unknown direct paths, including malformed public-share paths, lazy-load `NotFoundPage` before importing the authentication or workspace screens. The production SPA fallback serves the application shell with HTTP 404 for unknown paths; workspace and syntactically valid share entries retain their normal response. Existing API, static-file, and port-preview handlers run before this fallback. An unavailable or revoked syntactically valid share still uses the public-share screen's existing error handling.

The missing-page screen inherits the saved theme and local fonts. Its 404 graphic contains a tilted M, with one short settling animation disabled by reduced-motion preferences. Korean, English, Simplified Chinese, and Japanese copy provides workspace recovery and browser back navigation; back falls back to the workspace entry when no prior history exists. Workspace recovery uses the runtime base path, or the current frame entry without the share query for Mewlink. Controls retain visible keyboard focus and touch targets at least 44px high. The [implementation record](../work/not-found-page.md) covers isolated checks and deployment limits.

## Workspace initialization

### Runtime, authentication, and storage scope

Separately from regular and remote access, `demo.html` prepares an in-memory runtime environment, then loads the same `main`·`AppBootstrap`·`App`. `src/runtime/app-runtime.ts` injects transport, collaboration, initial authentication, and the base path, distinguishing them from actual P2P state. [Browser Demo](demo.md) owns the state, deployment, and verification contract for the demo, which does not duplicate the UI.

`src/main.tsx` applies the saved font/theme and shows the lightweight `StartupScreen`. Start the P2P parent MessagePort, authentication query, and current-path entry download in parallel.

- Load `AppBootstrap`, but render it only after confirming storage scope.
- Use `initialAuth` only when the P2P launcher verified it on the current connection. It sets the local-user/instance storage scope; missing or malformed state requires `/api/auth/me` verification. Do not reuse passed state during reconnection.
- Reuse the initial authentication result in `AppBootstrap` without creating a persistent authentication cache. Clean existing caches after determining storage scope and before workspace React effects save state.

Keep asynchronous startup work inside `startApp()` in `main.tsx`, without module-level await. Grouping entry/shared code can make the authentication chunk reference the startup chunk in return. Waiting for authentication during module evaluation would make each wait for the other. Finish startup module evaluation, then continue asynchronous rendering. Apply the same rule to optional viewport diagnostic imports.

`AppBootstrap` owns authentication queries, expiration, permission changes, user/permission content-cache scopes, and the login modal.

| Entry condition | Screen |
| --- | --- |
| Unauthenticated or temporary-password state in remote/localhost access | Only the existing `LoginPage` |
| Authenticated `?preview=<port>` | Lazy-load `PortPreviewPage` for [Port Preview](port-preview.md), without the full workspace |
| Local access without login | Retain guest document viewing |

P2P account changes restart the app frame. Lazy loading never bypasses server authentication or permission checks.

Dynamically import `App`, including editor, terminal, and task panels, in an effect after authentication, storage scope, content identity, and permission version setup. Keep the startup screen until regular Component state renders the module. This avoids the roughly 300ms top-level Workspace React lazy retry wait without evaluating modules before authentication.

An unfinished import cannot update a mount after account/permission changes or unmount. Retain the loaded public Component across permission updates with current authentication props. Scope import errors to that identity without indefinite retries. Preserve Suspense boundaries for port preview and subordinate tools.

### Initial workspace UI snapshot

The first authenticated read opts into `GET /api/workspace?include=workspace-ui`. Its optional `workspaceUi: { workspacePath, state }` sets `workspacePath` to logical UI root `projectPath ?? path` and `state` to the requesting account's saved object or `null`. Resolve account/root in the same server request context.

| Condition | Response behavior |
| --- | --- |
| Small valid initial snapshot | Include the envelope, removing the sequential UI-state request |
| No selected project, lookup failure, or envelope exceeding 64 KiB in UTF-8 | Omit the optional envelope |
| Ordinary GET or POST | Preserve the existing response |
| Guest | Keep access forbidden |

Seed the client cache only from an accepted initial response with a current request sequence/permission epoch and no newer UI snapshot. Validate the logical root and object/null shape; retain [device-local layout precedence](../features/appearance-accounts-operations/panel-layout-mobile-and-state-restoration.md#device-specific-layouts-and-memotasks-popups-2026-10-06). A `null` state is a successful empty server snapshot; absent/invalid envelopes use the existing UI-state GET. Later workspace changes and broadcasts keep their reconciliation path. The optional field grants no file or editing permissions.

### Pane, engine, language, and collaboration preparation

Before React applies an accepted initial response, `workspace-editor-preparation.ts` projects active files from current, device-restored metadata and prepares their selected engines/languages ahead of pane registration and background agent requests.

- Follow the existing Documents/workspace merge and logical file mapping. Skip unsupported, media, external, diff, and SVG-preview paths; ignore malformed optional metadata.
- Do not prepare for a missing project, closed editor, absent file-read capability, obsolete request, or changed permission epoch.
- Import only public code. File reads, rendering, collaboration handoff, and editing retain their authorization gates.

Prepare the header, file explorer, and dock separately from the editor. `deferred-editor-pane.tsx` imports the editor in an effect and renders regular Component state. Bind each result to account, role, workspace root, guest/collaboration state, and permission version; show `PanelLoading` immediately on scope changes.

Ignore previous-scope successes/failures and completions after unmount. Show existing translated recovery text on load errors. Preserve file, version, and collaboration preparation and server permission checks.

Plain and Hotview load independent engines through `deferred-editor-views.tsx` and regular Component state. Once an authenticated visible pane has an active document, `DeferredEditorPane` prepares only its selected engine alongside pane download/file validation. Prefetch and mounting share one loader promise.

| Pane condition | Preparation and lifetime |
| --- | --- |
| Empty, unsupported, diff, media, SVG-preview, or inaccessible-error branch | Do not prepare an engine |
| Initially closed | Download neither pane nor engine |
| Prepared pane closes in the same scope | Retain mounted state |
| Account/permission scope changes while closed | Never reveal the previous pane |
| View closes or changes during import | Do not mount the delayed result |

Mounted editors receive current file props and refs.

Completed public pane and engine preparations are available synchronously to a newly mounting wrapper, avoiding an additional loading commit for an already downloaded module. This cache contains only component code; each pane still binds the result to its current identity and permission scope, and current file props, refs, parser readiness, and collaboration gates remain required. The deferred-view browser regression checks that an externally prepared engine appears in its first commit.

Plain prepares its selected language family alongside the engine and pane. `code-language.ts` caches matching in-flight and completed preparations; TypeScript/JavaScript and JSX variants remain distinct. Other language families are not downloaded until selected. The loading indicator remains until that language is ready, before mounting the actual `EditorView`; startup never exposes a temporary editable parserless view. Markdown retains its HTML/JavaScript/CSS dependencies and database links, and JSON retains its parser linter. File changes and cancellation cannot mount an earlier file's delayed language result.

For an eligible active file, a separate scope-keyed controller starts the existing `useCollab` connection alongside pane preparation. `editor-collaboration.ts` shares path eligibility between deferred and standalone panes.

- Pass prepared sessions only for matching project/path/account, then disable the pane's duplicate local hook.
- Dispose the old controller/document on account, permission, workspace, project, or path changes. Preserve a prepared same-scope session when its pane closes.
- Earlier synchronization cannot make unvalidated cached text editable or seed it into the room. Keep file-validation and collaboration-handoff gates.
- Standalone `EditorPane` callers retain their own collaboration hook.

Shared utilities use [dedicated package entries](packages.md), keeping Tiptap/ProseMirror out of Plain and CodeMirror/Lezer out of Hotview. The agent panel uses an erased `import type` for editor types, preserving background session restoration without downloading Hotview. The closed database picker and comment UI also remain deferred. Pending comment popovers retain the existing overlay dismissal/history guard while their code downloads; reopening uses the prepared comment module. View switches preserve the existing collaboration, selection, scroll, and save contracts.

### Optional tools and public module scheduling

Once a current workspace UI root is known, prepare public code in this order:

| Owner | Preparation |
| --- | --- |
| Visible document pane | Layout effects start pane/selected-engine preparation before dock registration; `prepareEditorPane` shares the scope-checked wrapper's import promise |
| Agent panel | Regular-state import starts in its passive effect, after the workspace root exists |
| Closed background agent | Schedule the shared public import after at most 250ms |
| Visible agent/terminal, explicit picker/tab/notice request, or unknown initial UI state | Immediately promote that same pending import |

This keeps background agent fanout from occupying every inner transport slot first. Fetch the module once without unmounting an existing panel or waiting for editor completion. Background restoration continues with an editor download pending; initially closed panes retain their download boundary. `src/workspace-startup.browser.test.ts` checks actual App loader order and background preparation with the pane held on desktop/mobile.

App owns urgent UI conditions and keeps the dynamic import literal. `createDeferredModulePreparation` in `src/utils/deferred-module-preparation.ts` owns only the public-module timer, shared promise, and promotion; component lifetimes stay with the caller.

`MentionTextarea` dynamically prepares `AgentComposerInput` only when its image-capable branch renders. Ordinary textarea inputs do not download CodeMirror through the agent panel. While rich input loads, the shared busy indicator is shown; the prepared component receives the latest draft, callbacks, ref, and focus state. Closing or switching input branches ignores the old completion. Background agent session restoration and notifications remain active. The [composer contract](../features/terminals-agents-automation/agent-input-mentions-skills-and-attachments.md#composer-input) owns input behavior.

The agent panel also defers the terminal renderer through `DeferredAgentTerminal` until a session surface renders. Background session metadata alone does not download xterm. Pending renderer cancellation cannot open a socket for an old session, and the prepared renderer uses current props when reopened. The [terminal contract](../features/terminals-agents-automation/tmux-shell-terminals.md#implementation-details) owns session and command behavior.

`deferredComponent` gives panels/settings their own Suspense boundaries, preserving the workspace during slow downloads.

- Download settings, file browsing, login, remote desktop, and history when opened.
- Load search/tasks/notes on first open; retain their components after closing to preserve state. Focus notes on their first mount after download.
- Keep agent session restoration/notifications independent of workspace loading.
- Start the full update check after the workspace has rendered once.

The file explorer's `SearchPanel` uses `deferredComponent(..., undefined, { suspend: false })`. It retains its dynamic import and fallback but renders the loaded component through regular state, avoiding the extra React Suspense retry before the file tree appears. The wrapper ignores completions after unmount, passes current props, and throws current load failures to the existing error boundary. Other deferred tools retain their current Suspense behavior. `src/deferred-component.browser.test.ts` controls the real production React retry timer to compare these paths; authentication and module boundaries are checked by the startup graph and browser regressions.

The regular API's tmux session filter and the explorer's search utilities are imported through [Pure Package Entry Points](packages.md). The command popup's xterm renderer, video viewer for GitHub login, and connection history are downloaded separately when used. The full project icon selection list is also separated from required initial-screen dependencies, and its display size is maintained while waiting for icons. The rationale is recorded in the [Progressive Startup Decision](../decisions/0003-progressive-startup.md).

File icons load the selected pack's registry and only bounded groups needed by current icons, instead of downloading the full artwork collection for one file. Original SVGs and account appearance are preserved; the [file icon contract](../features/projects-files-search/file-folder-exploration-and-operations.md#file-type-icons) owns matching, group generation, fallback, and license verification.

The default IBM Plex font is retained, while external CSS and preconnects for Noto Serif KR, which is not used on the default screen, are removed from the initial HTML. When saved settings or the user's selection specify that font, `applyFontPreferences()` prepares it asynchronously only once. [P2P Static Resource Compression and Preload Paths](remote-access.md) separately reduces transfer costs.

### Failure handling

If the authentication entry download, remote initialization, or storage preparation fails after the startup screen appears, `main.tsx` ends loading and shows the existing translated instruction to reopen the page. Do not substitute login/workspace screens or retry indefinitely.

After parent MessagePort context arrives, allow up to 30 seconds for initial authentication. This covers both the parent-verified result and the compatibility path's direct `/api/auth/me` body fetch. On timeout, cancel waiting/direct requests and notify the parent; clear the timer on success or failure.

`src/app-bootstrap.browser.test.ts` reproduces chunk/remote initialization failures, missing authentication results, stalled bodies, and successful timer cleanup for regular/remote access at desktop/mobile sizes. Stalled static bodies follow the [Remote Resource Transfer Contract](remote-access.md#host-ui-compression-and-revalidation). The [Work Record](../work/startup-failure-recovery.md) separates implementation, verification, and unresolved actual reports.

`AppErrorBoundary` wraps the rendered application in `main.tsx`. React render/effect failures, including rejected lazy imports after startup, show a themed recovery screen. Existing asynchronous startup and workspace-import failures use the same screen.

Provide manual **Refresh**; if the error followed an update, advise restarting the server before refreshing. This is recovery advice, not version-mismatch detection: network failures, missing chunks, and render errors can all reach it. Never reload or operate servers automatically. The boundary does not catch arbitrary asynchronous event-handler failures.

The [drawing board](../features/terminals-agents-automation/agent-drawing-editor.md) has a local error boundary around its lazy import, so drawing failures preserve the surrounding document or agent draft. Its loading and error dialogs can be closed without refreshing. The [runtime failure record](../work/runtime-error-recovery.md) separates isolated regression checks from application to a running instance.

### Chunk and dependency boundaries

`src/api/auth.ts` is an authentication-only API that does not import terminal packages. The regular workspace API, `api/client.ts`, re-exports the same functions and types for compatibility with existing callers. `api/response.ts` shares error and session expiration notifications.

`server/startup-chunks.ts` groups static dependencies by owner:

| Chunk | Dependencies |
| --- | --- |
| `startup` | main's static dependencies |
| `authentication` | `AppBootstrap`'s static dependencies |
| `workspace` | Lower-priority recursive grouping of `App`'s static dependencies |

Keep shared initial/authentication code in its original chunks without duplication or moving it to the workspace. Retain dynamic editor/tool imports. Grouping all editor shared dependencies was rejected because holding its response also blocked settings.

Run startup asynchronously without blocking module evaluation, allowing `main.tsx` in the startup chunk. Deadlock prevention must not depend on group file exclusions. Preserve startup-screen, authentication, and storage-scope order. See the [Connection Preparation and Startup Chunk Decision](../decisions/0050-mewlink-startup-preparation.md) and [Round-Trip and Render Wait Reduction Decision](../decisions/0060-mewlink-startup-handoffs.md).

The workspace group uses `entriesAware: true` and `entriesAwareMergeThreshold: 14 * 1024`. Partition modules by their actual importing entries before merging small compatible groups. This keeps shared public-share code from pulling in the workspace while reducing small critical-path requests.

The final full-source graph preserves 170 deferred edges and reduces critical chunks from 33 to 19. A 16 KiB threshold was rejected after moving 933 bytes of `lib0/eventloop` into eager workspace evaluation. A 14 KiB threshold preserves the boundary at the same critical request count. Keep checks for initial/authentication modules, public-share isolation, every dynamic edge, and caller-ready dependencies. The [initial-offer and rendering decision](../decisions/0122-mewlink-initial-offer.md) and [measurement record](../work/mewlink-subsecond-startup.md) cover the 2026-11-02 changes.

### Verification

| Regression | Contract checked |
| --- | --- |
| `src/app-bootstrap.browser.test.ts` | Actual main, authentication, P2P bridge, and login in an isolated browser: pending-auth startup screen, 0 workspace requests before remote login, 1 initial authentication query, required password changes, identity/permission switches, local guests, and query failures |
| `src/workspace-startup.browser.test.ts` | Actual desktop/mobile header and explorer remain usable with editor/settings responses held; closed tools stay deferred |
| `src/api/client-bundle.test.ts` | API, explorer, and workspace dependency boundaries |
| `src/components/session-terminal-startup.browser.test.ts` | Command-popup renderer waits |
| `src/components/project-icons-startup.browser.test.ts` | Icon size and selection |
| `src/components/shared-memo-startup.browser.test.ts` | Notes focus on first open and reopen |

The user builds and applies `dist/` for the actual installation.

`src/workspace-loading.browser.test.ts`·`src/editor-loading.browser.test.ts` hold the actual production React retry timer and verify mounting after module completion but before timer release. Editor checks compare against the existing `deferredComponent` and also verify account, role, root, and permission version changes, stale completions and failures, unmount, and current load failures. The [Measurement Record](../research/mewlink-startup-latency.md) owns isolated display times for the full source and actual saved files, distinguishing them from timings in these unit checks.

Compare actual full-source `write:false` bundles for identical initial/authentication module sets, existing dynamic boundaries, and no newly eager tools. Allow a tool's new static dependency only when every dynamic caller already has it statically available. Also retain desktop/mobile settings-open checks with the editor response held: graph checks alone cannot guarantee tool independence.

## Historical measurements

In the earlier authentication bootstrap separation, JS dependency chunks for the initial remote screen without login decreased from approximately 4.73MB→0.56MB raw and approximately 1.36MB→0.18MB in the sum of default per-chunk gzip sizes (approximately 87%). At the time, timeouts in 2 additional workspace interaction checks were also reproduced in an isolated fixture using the pre-change App source, and failures remained in existing UI translation text checks. These figures compare JS costs in production define·minify·write:false in-memory bundles with CSS, images, and fonts excluded through shared stubs; they are not network timing improvements for an actual installation.

2026-10-15 Before and after progressive startup were compared using the same production define·minify·write:false in-memory bundles. The union of static dependency chunks for `main`·`AppBootstrap`·`App` decreased from 4,755,197→1,146,627 bytes raw and from 1,365,617→373,973 bytes in the sum of per-chunk gzip sizes (approximately 76%·73%, respectively). Shared code moved between chunks is counted only once. Code needed when opening optional tools remains in separate chunks.

In a fake API and isolated browser serving the same JS with gzip, median first contentful paint (FCP), measured 3 times per version and condition without cache, was 404→72ms locally and 3,968→712ms with 4Mbps, 60ms network latency, and 4× CPU throttling. Header DOM insertion on the actual workspace screen was 391→403ms and 3,945→1,976ms, respectively. Local workspace screen readiness time was nearly unchanged, while the startup loading screen's first display and workspace screen readiness in slow environments became faster. FCP includes the startup loading screen, and header insertion does not mean editor or session restoration has completed. These are synthetic measurements excluding CSS, images, fonts, actual account data, and P2P transfers. They do not reproduce the actual installation's 10-second delay or verify production improvement times.

2026-10-23 In the `write:false` fixture using the same actual main and login code with a mock Workspace, static dependency requests for startup JS decreased from 8 to 3, and the union through login entry decreased from 9 to 4. CSS and the actual workspace screen were excluded; this is not a production dist or total connection time measurement. The same test's Chromium checks verify the startup screen while authentication is pending, 0 Workspace requests before remote login or temporary password change, and identity, permission-change, and local guest boundaries.

`src/workspace-loading.browser.test.ts` controls the actual production React lazy retry timer to reproduce the delay in the existing path and verifies that regular state rendering mounts before timer release with the same module response. It also checks the prohibition on requests before authentication, identity/permission preparation, changes/cancellation, login/password/preview, and load failures. 2026-10-24 Along with the two existing startup checks, 10 checks passed; production installation and timing improvements are verified separately.
