---
title: "Browser demo using the shared UI"
description: "Defines the full public file list, initial copy, on-demand body loading, and size budgets for the browser demo using the actual Mew UI, along with the task, virtual host, account theme, and in-memory storage contracts after removal of the feature panel. Explains static files, origins, CSP, test boundaries for using verified public materials when pinned Git objects are unavailable, and user deployment procedures."
created: "2026-10-19"
updated: "2026-10-26"
---

# Browser demo using the shared UI

The demo is a separate entry point for trying Mew without logging in or running a host. It prepares the demo environment through `demo.html` → `src/demo-main.tsx`, then loads the regular `src/main.tsx`, `AppBootstrap`, and `App` unchanged. The UI is not copied, and changes to the editor, tabs, docking, settings, agent, and Git panel are reflected in the next demo build. When adding an API or feature, its demo behavior must also be implemented. The rationale is recorded in [ADR 0020](../decisions/0020-browser-demo-runtime.md).

## Runtime environment contract

`src/runtime/app-runtime.ts` owns transport, collaboration providers, initial authentication, base paths, and header manipulation selected before importing the app. Normal execution uses the existing server connection. The demo's `initialize.ts` combines in-memory storage, `DemoWorkspaceStore`, an HTTP adapter, a local event channel, and a collaboration provider.

- `mewFetch` and `openMewSocket` use the selected runtime's transport. The existing `activeRemoteTransport` and `isRemoteMode` refer only to actual P2P connections. The demo is not treated as a remote connection.
- Shares `EditorApi`, `EditorCollab`, and the existing agent event and Git subscription contracts. Demo document rooms use actual Yjs documents and the shared editor schema, without imitating the server synchronization protocol.
- The shared Hotview creates the editor after the React commit using `useEditor({ immediatelyRender: false })`. Effects do not reuse speculative render instances discarded during lazy loading or Suspense reconnection.
- URLs opened directly by the DOM, such as images and downloads, also go through `appResourceUrl`. The demo provides Blob URLs for virtual files or static resource URLs from the pinned commit, and revokes created Blob URLs when the resource lifecycle ends.
- The runtime environment's `basePath` is the basis for project URL interpretation and address normalization. Do not interpret the demo's `/demo/` as a project name or replace it with `/`.
- Do not scatter demo conditions throughout the shared UI. Select the environment at startup and display available panels according to existing capabilities. The runtime provides the header's `Demo` and reset button.
- Demo visitors receive all capabilities, exposing features in the hamburger menu, dock, and settings. Features that require a host can also be tried with dummy data in the same UI. The `desktopConnection` provider is selected before actual connection preparation or WebRTC creation, while preserving the normal execution connection path.

## Single virtual workspace

`src/demo/workspace-store.ts` owns the files, folders, settings, document DB, and virtual Git history for one visitor tab. `.workspace` is the root of the currently open virtual project, and `docs` is a view under that project's `docs/`. HTTP responses, open editors, agent edits, and Git subscriptions read the same state.

| Feature | Demo behavior |
| --- | --- |
| Documents and code | Actual editing, autosave, tabs, and view switching; creating new files and folders in Files; creating, moving, copying, renaming, deleting, and searching documents and subdocuments in Documents |
| Tasks | Adding, editing, completing, and deleting example tasks; tags, colors, assignees, dates, calendar, Gantt, and opening Markdown documents |
| Projects | Creating, opening, and switching folders; adding, renaming, deleting, and arranging projects; initializing and cloning virtual Git repositories |
| Agent | Uses the existing send, wait, and cancel UI and event display, and generates responses that modify example documents |
| Terminal | Creating, renaming, deleting, and reconnecting sessions; preserving working directories and history; interpreting file and Git commands locally. Package installation, development, and test commands provide example output |
| Git | Computes changes, diffs, selective commits, history, and reverts from the same files. Does not modify actual Git repositories |
| Document DB, comments, and chat | Uses example data in per-visitor memory and the existing UI |
| Remote desktop | Two 960×600 virtual screens; keyboard, paste, virtual clipboard, and pointer input; screen selection, rotation, and settings UI |
| System resources | Dummy CPU, memory, GPU, temperature, and process values, with graphs that change over time |
| Android | SDK and virtual device status; Home, Notes, and Settings on a local HTML phone; virtual command execution and terminal output |
| Scheduled tasks | Editing, adding, and deleting example schedules and prompts, execution history, and in-memory state changes from the virtual terminal and scheduled prompts |
| Updates and commands | Dummy versions, completion status, and execution logs; simulates command buttons and agent runtime installation, removal, and logout |
| Account management and Mewlink | Changing example account, feature, and file permissions; approving, rejecting, and disconnecting example access requests; changing device registration status |
| Debugger | Virtual stacks, variables, watch expressions, breakpoints, stepping, continue, and pause; in-memory settings storage |

The file list and original content are generated from a pinned Mew commit and contain no actual user accounts or credentials. Agent responses and terminal commands do not connect to external models or CLIs. APIs and sockets that are not implemented fail explicitly and do not fall back to the actual server.

### Scope of host feature demos

`http-host.ts` and `host-fixtures.ts` own dummy responses for system resources, Android, scheduling, updates, and device registration. `http-admin.ts` and `http-debugger.ts` own virtual admin and debugger state. Execution results use Demo and simulation labels. They do not run actual processes at scheduled times or change the OS, crontab, accounts, firewall, or installation state. Permission edits in the admin screen apply only to example account state, while demo visitors retain access to try all features.

`desktop.ts` draws screens with Canvas and applies input from the shared `desktopInput` to local notes and pointers. It does not use actual screen capture, external media, installed assets, remote sockets, or WebRTC. Browsers that do not support `VideoFrame` display a local stream from the same Canvas. Frames are released immediately after drawing, and timers, stream tracks, and connections are cleaned up on close, reset, or page exit. Video resolution and FPS settings let visitors try the existing UI without changing virtual screen dimensions or actual transmission quality.

The Android screen is Blob HTML without external resources or scripts. The app CSP permits only `frame-src blob:` and continues to block external frames. Changing SDK or gateway addresses does not connect to actual addresses. Remote device registration shows only example addresses and does not issue actual connection addresses. Actual server-browser login, running local port services, and advanced debug adapter requests cannot be executed. Related features are exposed in existing settings, permissions, and tools, and requests that are not implemented return errors explaining the demo's scope.

### Full file list and on-demand body loading

The explorer shows files from a pinned public Mew commit. The initial screen is prepared with paths, sizes, types, and body identifiers from `src/demo/repository-index.json` and a small text copy from `repository-snapshot.json`. `fixtures.ts` adds the demo guide `docs/welcome.md` to this copy. File and folder listings and filename searches use only the index and do not download bodies. The rationale is recorded in [ADR 0027](../decisions/0027-demo-lazy-repository.md).

The small copy contains files needed to start the existing demo immediately, including the README, [security canonical source](../../../docs/operations/security.md), usage guides, features, tasks, and shared code. Other text, images, and attachments are loaded when opened from `/demo/repository/` static files on the same demo origin. Text bodies are served as JSON identified by SHA-256, and media is served as separate static resources readable by existing viewers. It does not access GitHub, actual Mew APIs, or the host file system. The welcome document displays the reference commit, explains on-demand loading of additional bodies, and states that changes are not saved permanently.

`tools/demo-snapshot.mjs` reads the file list and blobs from the specified Git commit to update the index and copy. It does not read or modify content in the working tree, staging area, or untracked files. It includes public code, documents, media, and committed hidden settings, history, research, and vendor files. It excludes actual secret settings, personal data, private central code, runtime-generated data, dependencies, build artifacts, and the generated index itself. Task assignee accounts are removed before bodies are served; other properties and bodies are preserved. Local files not tracked by Git are also excluded from the index.

The initial text copy is limited to 768KiB uncompressed and 160KiB gzipped; the full file index is limited to 512KiB uncompressed and 128KiB gzipped. Feature documents are limited to 16KiB per file, tasks to 8KiB, and specified entry files and similar files to at most 48KiB. Files are not truncated, and generation fails if a budget is exceeded. The body sizes of all files are not added to the initial transfer size. Index and copy sizes are distinguished from the transfer size of the entire actual app bundle.

Generation from commit `a7bae991` produced an initial copy of 111 files, 545,068 bytes of JSON, and 159,640 bytes gzipped, and an index of 2,003 files, 286,318 bytes of JSON, and 104,419 bytes gzipped. All bodies total about 30.1MB but are not downloaded together on initial entry. The index includes verification data such as SHA-256 in addition to paths and sizes, adding about 102KiB gzipped. These values are compressed sizes of the generated JSON, not measurements of actual deployment bundles or browser transfers.

Requested bodies are reused from an 8MiB LRU cache within the tab. This limit is the sum of original UTF-8 and binary bytes, not a limit on total browser memory usage. Original content evicted from the cache is loaded again when reopened, while edits and virtual Git history are maintained as separate state. Body loading or cache cleanup alone does not change file modification times or Git status. Edits and the app's in-memory cache disappear on refresh, reset, logout, or exit. It does not preload all files or open an IndexedDB body cache. The browser HTTP cache for public static assets is separate from the app's edit and settings storage.

Edited files separately preserve the content needed for comparison with the original. Git status remains unchanged when opening a diff for a file overwritten before its original content was received, or when evicting the original from the LRU after reverting to it. Collaborative editing also reuses the restored original rather than replacing it with an empty body.

Full-content search and folder downloads request files within the user-selected scope in batches of up to 6 and propagate cancellation signals. When multiple operations await the same original content, they share the request, and the transfer stops when the last waiter cancels. Content search excludes binary files and files larger than 2MB, returning at most 100 files and 1,000 matching lines. Folder downloads allow up to 64MiB of total body content in the selected scope and preserve binary files in the ZIP. Searches and downloads over large scopes may receive substantial data during those operations, but do not start on initial entry or filename search.

Downloads of individual files referencing static originals use static URLs directly without adding content to the app's body cache. Downloads of the initial copy, edited files, and folder ZIPs create Blob URLs at download time and revoke them 1 second after download starts. URLs that miss the post-start revocation path also expire 60 seconds after creation, and reset or exit cleans up all remaining URLs and timers.

The feature panel and its dedicated APIs and execution substitutes are not provided, in accordance with the [removal decision](../decisions/0065-remove-feature-panel.md). The index's gzip limit was adjusted to 128KiB to reflect growth in the current public file list. To maintain the initial copy's compression budget, the selection-field implementation example is provided through on-demand original-content loading.

Update the index and copy with the following commands. They do not build the app, run a server, or deploy. Before deployment, review the reference commit, exclusions, sizes, and changes, and commit the generated files together.

```bash
node tools/demo-snapshot.mjs
node --test tools/demo-snapshot.test.mjs src/demo/fixtures.test.ts
```

The task panel reads actual Markdown from the same virtual files. It reuses the small initial copy and requests only missing bodies from the relevant document folder. It uses original completion states, tags, and schedules without creating virtual tasks adjusted to the demo date. Opening the panel alone does not download bodies for the entire repository. Modified properties and bodies are reflected in the same virtual files, panels, and Git, and disappear on refresh, reset, or exit. The document DB's default table is also a separate editable copy made from these tasks and does not write to the original tasks or actual DB.

`fixtures.test.ts` checks that only the welcome document is added to the copy, along with size budgets, document properties, welcome links, account exclusion, visitor isolation, reset, and new-project seeding. `tools/demo-snapshot.test.mjs` verifies index and original-content generation and the exclusion of uncommitted content and excluded areas in an isolated Git repository. Installation, development, and test commands in the virtual terminal and agent responses are for demonstration and do not run or modify actual Mew.

Documents uses `/api/docs/pages/*` separately from the general file creation API. The demo also handles this contract, reflecting representative-document switching and document link changes caused by adding or deleting subdocuments in the same virtual files. Feature and task documents are seeded as initial files along with the repository copy, so merely opening a panel does not create Git changes. Feature requests immediately complete with dummy results and add or update feature documents. Task property changes are saved while preserving the YAML and body in `.mew/tasks/`.

New projects are virtual folders under `/demo/mew-playground`. Opening an empty folder or cloning a virtual repository prepares the same Mew file index, small copy, and welcome document. Switching projects preserves each root's files, screens, tasks, features, and document DB state. Git changes and history track all of the visitor's virtual files together. Clone URLs are stored only as example metadata, without connecting to remote repositories.

The virtual terminal's `pwd`, `cd`, `ls`, `cat`, `touch`, `mkdir`, file output from `echo`, `cp`, `mv`, `rm`, and similar operations query and modify the same virtual files. `cat`, `head`, `tail`, `wc`, appended output, and Git diff request only files they need to read, while `ls` and `touch` on existing files neither fetch nor overwrite bodies. When reading multiple files, results are retained after each body is received so output is not lost even if originals are evicted from the cache. Subsequent commands wait in order during loading, and Ctrl+C, reset, or session termination cancels pending execution and subsequent file writes.

Changes propagate to the explorer, editor, and Git. Shell input and command history remain in the session. It does not run an OS shell, package manager, or development server, or send external network requests included in commands.

The account theme's `GET/PUT /api/user-ui/theme` is also stored in each visitor's `DemoWorkspaceStore`, providing conditional initial migration and the `theme` presence signal. It does not write to actual accounts or server storage. Browser settings, drafts, and caches use the in-memory backend of `setBrowserStorageScope`. Global themes, fonts, shortcuts, and sessionStorage break progress and window identifiers are also isolated in memory, and persistent IndexedDB caches are not opened. Refresh, reset, logout, or tab closure starts a new fixture. Browser storage from actual use is neither read nor cleared. Pages temporarily retained in BFCache are not closed, so they continue working after restoration through back navigation. The shared storage contract follows [Browser storage](browser-storage.md#demo-memory-storage).

## mew.run/demo and deployment boundaries

The public central route `https://mew.run/demo` opens the demo app at `APP_ORIGIN/demo/` in an iframe without login. The central login origin is separate from the running app origin, and the demo app receives no P2P connection or authentication material for actual Mew hosts. `demo` is a reserved username, and deployment stops if an existing username or alias occupies it. Existing account addresses are not changed automatically.

The public `shared/mewlink-demo.ts` owns routing, static paths, CSP, and reserved-name checks. The Git-excluded central `mewlink/src/worker.ts` and `username.ts` connect it, while `scripts/deploy.mjs` and `package.json` connect the demo deployment flow. These private integrations must also be preserved when moving the central copy. Do not include central source files or patches in public repository commits.

`vite.demo.config.ts` builds the shared UI's demo entry point into `dist-demo/` without normal server plugins. `tools/demo-repository-plugin.mjs` reads original objects from the index's pinned commit and includes per-file static artifacts. It fails if original hashes, sizes, or types differ from the index. The development server uses the same generator and does not substitute working-tree files.

Central deployment copies demo artifacts to the central `dist/demo/` and renames `demo.html` to `index.html`. `tools/demo-distribution.mjs` checks source hashes before and after the build and the artifact manifest, including original-content files. Deployment fails for stale or modified artifacts. After modifying the Mew UI, central demo deployment must also be completed to update the public screen.

The user runs the commands below. The agent does not build the app, run a server, or deploy.

```bash
# 데모 전용 개발 서버: 기존 Mew 서버·API를 띄우지 않음
npm run dev:demo
# http://127.0.0.1:4998/demo/

# 데모 타입 검사·정적 산출물·배포 manifest 생성
npm run build:demo

# 설정된 중앙 서비스의 기존 배포 절차: 데모 빌드·검증을 포함
npm --prefix mewlink run deploy
```

Actual production rollout follows [Central deployment](../operations/remote-central.md). Source changes and passing local isolated tests do not mean deployment to the public service is complete.

## Validation and maintenance

The fixture, store, transport, real-time, collaboration, and storage tests in `src/demo/` check the scope and size of the actual Mew copy and welcome links, consistency between file saves and Git changes, document operations in Documents, feature and task document synchronization, project switching and state preservation, terminal commands and session lifecycles, and blocking external requests. `src/demo/demo.browser.test.ts` loads the actual shared workspace UI in Chromium without a server to validate desktop and mobile interactions. It does not modify the normal app bundle or running servers.

For this browser check, `server/demo-repository-fixture.mjs` first uses the original Git-tree validation generator if the snapshot revision exists in local Git. Only in checkouts lacking the pinned revision object does it verify the exact SHAs and original size limits of the checked-in index and initial copy, then read public `dist/demo` or `mewlink/dist/demo` materials from the registered primary checkout. It verifies every body's content address, size, binary format, and consistency with the initial copy before serving it from memory. Missing other revisions, tampering, or missing materials cause failure; it neither downloads from the network nor regenerates the snapshot. This path verifies the integrity of pinned public data and is not described as passing the original Git tree validation. The actual UI is compiled in memory from current source and does not execute historical public JS.

The demo host flow checks the example visitor's approve and reject buttons in account management's Mewlink access requests, and checks the device name in the separate Mewlink settings in the owner menu. Do not look for example values from different APIs in the same dialog. The original snapshot tools and separate regression tests continue to own generation and size checks for pinned materials.

`host.test.ts` checks all capabilities, state changes for dummy resources, schedules, updates, admin, and debugger, visitor isolation, reset, Android Blob revocation, and virtual execution logs. `server/demo-host-browser-flow.ts` integrates full hamburger-menu visibility, resource popups, virtual desktop input, settings, scheduled execution, admin, and Android note operations on desktop and mobile into the shared browser check.

`server/mewlink-demo.test.ts` checks routing, static paths, CSP, and reserved-name conflicts across both origins. `tools/demo-distribution.test.mjs` uses temporary artifacts and an injected build function without running actual app builds or deployments. The private central `test/demo.test.ts` and `username.test.ts` are also checked when integrations change.

```bash
npx tsc -b
node --test src/demo/*.test.ts server/mewlink-demo.test.ts tools/demo-distribution.test.mjs tools/demo-snapshot.test.mjs
npm run lint
npm run check:docs
```

When shared interfaces change, update the demo implementation, examples, and validation in the same work. When adding features that call server APIs directly or create new WebSockets, also verify that they go through the runtime boundary.

On 2026-10-19, 133 demo, existing remote connection, storage, authentication startup, and editor regression tests were run sequentially and passed. Checks of the actual shared screen at 1440px and 390px verified editing, the virtual agent, Git, reset, the absence of actual API and WebSocket requests, and preservation of existing browser storage. Central mock Workers checks also passed; no public-service build, deployment, or actual external connection was performed.

On 2026-10-20, 70 mock checks for the demo, central routing, and deployment artifacts and 3 shared-screen browser checks passed. At 1440px and 390px, checks verified new documents, editing and saving new files and reflecting them in Git, terminal commands, tab and working-directory preservation, feature title changes and document opening, task completion, tags, schedules, documents, calendar, Gantt, and task creation, as well as new-project creation, returning to the original project, and reset. There were no API failures, external requests, or actual WebSocket connections. Type, lint, and documentation checks also passed, with preexisting lint warnings outside this change remaining. No public-service build or deployment was performed.

After the host feature expansion on the same day, 83 demo checks and 31 existing runtime, desktop preparation, and input regression checks passed. Checks on PC and mobile covered all menus, resources, virtual desktop input, scheduled execution, update lists, account management, Mewlink, Android notes, and debugger stepping. Mobile checks also covered the Canvas stream when `VideoFrame` is unavailable and track termination after closing. No actual API failures, external requests, WebSocket or WebRTC connections, or changes to existing browser storage occurred. Type, lint, and documentation checks also passed; no app build or deployment was run.

After the full-file loading expansion on 2026-10-20, all 115 checks for the demo above, central routing, copy creation, and deployment artifacts passed. Checks in the actual shared UI on a 1440px PC viewport and a 390px mobile viewport confirmed a list of more than 1,900 files, 0 additional source requests on initial entry, 1 request on first opening `server/serve.ts` with no additional request on a cached reopening, and a clean Git state after navigation. Existing editing, feature, task, and host experiences also passed, along with regressions for project switching during loading, source cache cleanup, and collaboration undo. Final `npx tsc -b`, lint, and documentation checks passed; lint still has preexisting warnings outside this change. No actual app build or public deployment was run.

After removing the feature panel on 2026-10-26, the initial copy and full public file list were updated. All 31 copy, task, project, and HTTP data checks and 3 demo checks in the actual shared UI at 1440px and 390px passed. Task checks verify restoration and isolation against initial values rather than a specific copy's item count and status, and show completed items before selecting them. No build or deployment was performed.
