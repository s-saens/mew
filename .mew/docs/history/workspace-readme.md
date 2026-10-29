---
title: "Copy of the mew README Left in the Workspace Root"
created: 2026-09-11
updated: 2026-09-11
description: "Preserves the previous workspace README migrated on 2026-09-11, showing the features, settings, storage, and structure at that time. It is not the reference for current execution or usage."
---

This document is an older copy of the mew description left at the workspace root during the 2026-09-11 migration.
Do not use it as a reference for current behavior or execution. The current references are the [mew README](../../../README.md) and [documentation map](../MOC.md). The content below preserves
the original text, with only link locations adjusted.

# mew

An editor that opens **a folder on your computer as a browser project**. Other paths can also be opened as project tabs, and folders
directly under the root that contain a `.mew` folder are identified as subprojects in the sidebar. Markdown and code editing, a file tree, full-text search, git commits, real-time collaboration, a terminal (tmux), and viewing
links for people without accounts are all available on one screen. It is built for mobile use as well.

```bash
git clone <이 레포> mew && cd mew
./mew setup
```

`setup` checks the prerequisites (Node, build tools, and tmux), asks for the folder to edit and the port, builds,
then creates the first account and displays its temporary password. It is safe to run again. For
the permission model and precautions when exposing the server, see **[security.md](../../../docs/operations/security.md)** — first read how much access granting an account provides.

Linux and macOS are supported. The terminal panel builds `node-pty` locally and attaches to `tmux`, so it requires the standard tools
for each OS.

> **Agent execution invariant:** Agents **do not run `mew`.** Builds, deployment, and server restarts are handled
> directly by the user. Commands such as `npm run build`, `npm start`, `./mew start|stop|restart|update`, directly terminating processes, or running them in the background
> that change the current screen or server are also not run. After code changes, agents only run checks such as `npm test`,
> `npm run lint` and `npx tsc -b` that do not affect the running server, and inform
> the user that the changes need to be applied.

```bash
# Debian/Ubuntu
sudo apt install build-essential python3 tmux

# macOS
xcode-select --install
brew install tmux python
```

**Nothing is stored in this folder.** Configuration lives in `~/.config/mew/config.env`, accounts
and sessions in `~/.local/share/mew/`, and logs in `~/.local/state/mew/` (`server/config.ts`). Data remains even if the clone is deleted,
and `git pull` updates the application.

```bash
./mew start | stop | restart   # 서버
./mew status                   # 지금 뭐가 어디에 있는지
./mew logs                     # 로그 따라가기
./mew update                   # git pull + 재빌드 + 재시작
./mew users add you@x.com owner
```

**MOCs are not mixed into the list by filename** — `MOC.md` and `_MOC.md` (treated identically) are excluded from the file list and instead pinned
with a map icon + `Map Of Contents` as **the first row when their folder is expanded**. The project root's MOC has no containing folder in
the tree, so it appears in the same form at the very top of the tree, before any folder. Detection uses
only the filename and applies to all projects.

## Project Tabs

In mew, **one folder is one project**. The configured starting folder is simply the first
project opened, rather than a workspace. The screen URL is always `/`, and the header displays
tabs for root project paths opened in this browser. The list of opened paths is stored in `mew:open-project-paths` in `localStorage`.

- `+ 탭` or `Ctrl+O` in the header opens a project path input in the center of the screen. It accepts absolute paths, `~`,
  and paths relative to the current project, using the same autocomplete and server validation as the agent working path
  input. After entering a folder, press Enter again or click the right arrow to open that folder as a project tab (owner only).
- Clicking a tab switches to that root project. The current server compatibility layer maintains only one active root across the
  entire process, so it cleans up tree watchers, collaboration rooms, and agents. Without refreshing, the browser reads the
  new root's tree and replaces the view; it stores the open tab list and small text body cache separately by absolute root path and
  restores them when you return.
  The internal names `WORKSPACE_ROOT` and `MEW_WORKSPACE` exist for configuration and path validation compatibility and are not user-facing concepts.
- Long-press or right-click a tab to open the icon picker (owner only). Icons are remembered per open root
  path in this browser. `+ 탭` displays only the `+` icon, with no text.
- Tabs displaying a project name show `×`. Clicking it closes the tab only from the tab list after confirmation; it does not
  delete files or folders. The last root project tab cannot be closed.
- Project tabs have no command buttons or subfolders attached. Tabs represent only root folders opened independently.
- The owner adds and switches absolute-path tabs. A manager can view the current project path with the same permissions as the shell, while
  members and guests see only a generic project name instead of the absolute path.

Workspace screen state (document tabs, pane layout, scroll positions, expanded tree nodes, and auxiliary panels) is retained in a server ledger
per signed-in account and restored on other devices and in private windows. Existing `localStorage` values are used as a migration source only when the account
ledger is initially empty, and the internal API identifiers `.workspace` and `docs` for the root project and Documents are retained for compatibility. Values closely tied to
the device, such as screen width, theme, language, font, and drafts in progress, remain in the browser.

## Projects · Subprojects · Documents in the Sidebar

Explorer (folder), Full Search (magnifying glass), and **Current Root Project Commands (▶)** at the top of the sidebar
are three separate sidebar tabs. Clicking the root commands ▶ shows only the root's `.mew/cmd-button.json` list, without the file explorer or
Documents.

Directly below the file search box, Documents and immediate subprojects appear as large expandable items. The current
root's remaining files and folders follow directly, without a separate Project folder.

- **Documents** — the docs folder selected by the current project. Expanding it shows its contents directly below, and right-clicking it as the owner opens the existing
  settings dialog for changing the folder, importing, and exporting. The internal identifier and API remain `docs`.
- On mobile, **press a sidebar file or folder for at least 0.5 seconds, then release within 12 px** to open the same item
  menu as a desktop right-click. Moving more than 12 px while holding prevents this menu from opening, allowing the existing
drag-and-drop move behavior to continue. A folder directly under the root that contains `.mew` is a **subproject**. Each appears
as a large expandable item immediately after Documents, with the folder's existing command menu (`<폴더>/.mew/cmd-button.json`) on the right side of its row. Expanding it
shows its own files directly. Root files and folders without `.mew` are listed directly after these items without a separate container. Owners and
managers also see hidden folders, but `.git`, `node_modules`, and `.data` are excluded under the existing blocking and performance rules. Nested `.mew` folders
within subprojects are not yet classified as separate projects.

There is no workspace-scoped pinned Home tab or project grid entry point listing all top-level subfolders. When the to-do and calendar widgets
are exposed again, their project-scoped placement will be decided separately without restoring the workspace Home tab.

## Server File Explorer

A project-independent popup opened from the header menu (`components/ServerFileExplorer.tsx`). Its default path is the server user's home directory, and the address input and dropdown open
`~` or an absolute path. Folders are read one level at a time when expanded, so the entire home directory is not recursively
scanned in advance. It covers all files and folders readable by the mew server's OS user, including hidden items.

- Clicking a file opens it in a **preview tab** in the focused editor pane while keeping the current project unchanged. External tabs support
  autosave but do not use collaboration, comments, git history, or project rules, and are not retained in tab restoration after a refresh.
- The context menu offers file and folder renaming, copying, cutting, pasting into folders, and deletion. Files can be downloaded. **On mobile, if
  the browser detects a cellular connection and the file exceeds 100 MiB**, it displays a data charge notice and asks for confirmation to continue before downloading. Downloads start immediately on Wi-Fi, on desktop, and in browsers that cannot determine the connection type.
- A folder's **Open as Project** action adds that folder itself as a root project tab and opens it as the active project. It
  is owner-only and replaces the current view with the new root under the active root switching contract.
- The browsing, reading, and writing APIs are **restricted to managers and owners**. They do not apply workspace boundaries or
  the blocking rules for `.git` and `node_modules`, and have the same OS permission scope as the shell. Permission semantics for public servers follow [security.md](../../../docs/operations/security.md).

| Route | Role | Function |
|---|---|---|
| `GET /api/fs/entries?path=` | manager·owner | Files and immediate subfolders of an absolute-path folder |
| `GET/PUT /api/fs/file` | manager·owner | Read and save external text files (opening text is limited to 10 MB or less) |
| `POST /api/fs/rename` · `DELETE /api/fs/path` · `POST /api/fs/paste` | manager·owner | Rename, recursively delete, and copy/move |
| `GET /api/fs/raw` · `GET /api/fs/download` | manager·owner | External media streaming and file downloads |
| `POST /api/fs/open-project` | owner | Open and activate the selected folder itself as a root project |

## Browser Panel

An auxiliary panel opened at the far right with Alt+B or the browser button in the header menu (`components/BrowserPanel.tsx`). It supports multiple
tabs, and entering an address such as `localhost:3100` in the address bar directly below the tabs normalizes it to `http://localhost:3100/` and opens it. State is
stored only in the browser's localStorage (`mew:browser-*`). To open a full page without the auxiliary panel, use the port number
as the first path segment, as in `/3100`.

Key point: `localhost` in this panel refers to **the loopback of the machine running the mew server, rather than localhost
on the visitor's device**. It uses the `/__mew_browser/<origin-token>/...` proxy (`server/browserProxy.ts`) so that local development
servers such as `med-app` running inside WSL can be viewed even when accessing mew remotely.

- Permissions are the same as for the terminal — **only managers and owners** can open it. Local development servers may contain secrets and admin screens,
  and the proxy is an SSRF attack surface.
- Only `http(s)://localhost`, `127.0.0.0/8`, and `::1` are allowed as targets. Tailnet, private network, and public internet URLs are rejected.
- mew session cookies and Authorization headers are not forwarded to the target server, and the target's `Set-Cookie` is not passed to the browser.
- Both the auxiliary panel iframe and the `/3100` full page run sandboxed without `allow-same-origin`. This boundary prevents the target app
  from gaining the same origin privileges as mew. As a tradeoff, localStorage and HMR WebSockets may be restricted
  in some apps.

| Route | Role | Function |
|---|---|---|
| `ANY /__mew_browser/<origin-token>/...` | **manager·owner** | HTTP proxy to an allowed loopback origin. Rewrites some root-relative URLs to proxy paths |
| `ANY /<port>` · `/<port>/...` | **manager·owner** | Opens the same proxy as a full page. Redirects to a short token path on the first request |

## Android Panel

An auxiliary panel opened at the far right with the Android button in the header menu (`components/AndroidPanel.tsx`). Android
Emulator and system images are not included in the mew distribution ([ADR 0058](decisions/0058-mew-android-panel-optional-gateway.md)). The panel does
only two things.

- It checks `/dev/kvm` on Linux and WSL and the Emulator's Hypervisor.Framework acceleration status on macOS, and shows whether
  the Android SDK tools (`sdkmanager`, `adb`, `emulator`, `avdmanager`), an API 36 system image, and an AVD exist. It selects an `arm64-v8a` image for Apple
  Silicon and an `x86_64` image for Intel/AMD. If the image is missing, it provides only the installation command, then
  provides the AVD creation command after a refresh.
- The **▶** next to the copy icon for an instructional command runs a server-defined command ID in a dedicated hidden tmux session (`mewcmd-*`). The
  adjacent terminal icon uses `SessionTerminalPopup` to open the progress display and interactive input, and when the command finishes, it automatically terminates
  its own session through the same path as project one-shot command buttons. Arbitrary command strings sent by the browser are not executed.
- Entering the address of an already running Android WebRTC/gateway opens it in an iframe through the same loopback proxy as the Browser panel.

Permissions are the same as for the browser panel and terminal — **only managers and owners** can open it. The status check API does not run
the emulator, start processes, install anything, or download system images. Thus, unless the Android panel is opened, only the panel code and API routes
add weight to mew's default execution path.

| Route | Role | Function |
|---|---|---|
| `GET /api/android/status` | **manager·owner** | Checks Linux/WSL KVM or macOS acceleration, Android SDK, and AVD status for the host architecture. Does not run the emulator |
| `POST /api/android/commands/:id/run` | **manager·owner** | Runs an Android setup command from the server registry in a one-shot tmux session |

## Documents Folder Contract

Documents is a virtual folder in the sidebar, not a tab. The owner selects the actual folder within the current root project; the default
is `docs`. If there is no configuration and only the old `.mew/docs` exists, that location is used as is. If the folder does not exist,
an empty Documents folder is created.

- The internal identifier `docs` is retained. Documents, trees, search, collaboration rooms, git, and storage keys share this name, so it does not change
  along with the UI layout.
- The actual top-level folder currently used by Documents is not displayed again in the root project tree.
- When the owner right-clicks Documents in the sidebar, `DocsSettingsModal` opens. Folder changes are allowed only within the current root project,
  importing deletes and replaces existing contents, and exporting copies them into `docs` under the destination.
- Folder selection uses `GET /api/fs/dirs` to read the server filesystem and is owner-only.

| Route | Role | Function |
|---|---|---|
| `GET /api/fs/dirs?path=` | **owner** | List the folder's subfolders |
| `POST /api/docs/root` `{path}` | **owner** | Change the Documents folder within the current root project |
| `POST /api/docs/import` `{path}` | **owner** | Replace Documents entirely (cannot be undone) |
| `POST /api/docs/export` `{path}` | **owner** | Copy to `{path}/docs` |

## Editor Panes (Document Tabs · Split View)

The editing area contains **one or more panes**. Each pane is one `EditorPane.tsx`, and each has **its own document
tab bar, toolbar, and Yjs collaboration session**. The layout is a tree (`utils/paneTree.ts`):

```ts
type PaneNode = { kind: 'leaf'; pane: string } | { kind: 'split'; dir: 'row' | 'col'; kids: PaneNode[] }
```

- **Dragging and dropping a document tab (after pressing and holding to pick it up) splits the pane.** Drop zones are defined as the **outer 30%** of the pane's width
  and height (`dropZoneAt`) — dropping in the rightmost 30% creates a new pane on the right, and dropping in the bottom 30% creates one below, moving the tab there. **Dropping
  in the center only moves it into that pane without splitting**. A translucent preview shows the drop location while dragging.
- **Dragging a file from the sidebar and dropping it at an edge splits the pane under the same rules** — the file opens in the new pane. Dropping
  in the center inserts path text rather than splitting (see the "Dragging Sidebar Items" section).
- **Split drop zones are measured only within the pane's body area** — the tab bar is excluded. Including it causes the "split above" preview
  to flash even while merely reordering tabs within their own bar.
- **Dropping a tab onto another pane's tab bar moves it to that pane** (always a move regardless of the edge, appended
  at the end). Its own pane's tab bar is for reordering, so it does not count as a drop target (`dropTargetAt` in `App.tsx`).
- **Dropping a pane's only tab on its own edge is ignored** — splitting would leave the same screen as before the move.
- Splits in the same direction are **flattened into siblings rather than nested** (`splitLeaf`). Pane sizes are **always equal** — there
  are no size values or draggable resize handles.
- When a pane becomes empty (when its last tab is closed), it **collapses automatically** and the tree shrinks with it (`removeLeaf`·`prunePanes`). The last remaining
  pane stays open even when empty and displays guidance.
- The **focused pane** is the target for keyboard shortcuts, search, history navigation, and pasting
  terminal selections. Clicking anywhere in a pane (`onPointerDownCapture`) moves focus to it, and unfocused panes have
  dimmed tab bars. The `tabs`/`activePath`/`activeTab` provided by `useTabs` **belong to the focused pane**.
- **Content caching and autosave are keyed by path, not pane**. Opening the same file in two panes shows the same content.
- The terminal and system resource buttons are in the **header hamburger menu** (`HeaderMenu`, next to the agent button), rather than in a pane — putting
  them on pane toolbars would duplicate the same buttons.
- Collaboration presence reports **only the file in the focused pane** to the server — documents open in other panes
  do not appear to others as being viewed.

### Ctrl+L references (`경로:줄`)

Pressing Ctrl+L (`insertPathOrSelection`) inside the editor formats the current location as `programs/modoo-2026/사업계획서-0811.md:3` and writes
it into **one auxiliary panel input**. If there is a selection, it uses `…:3-15`; otherwise, it
uses the single line containing the cursor. A trailing space lets you continue typing immediately.

- **All file types are supported** — Markdown in Hotview (ProseMirror) and code or text (CodeMirror) qualify whenever an
  editor is attached (only when pressed inside `.ProseMirror, .cm-editor`). Each editor's `getSelectedLineRange` supplies the line numbers, and Hotview converts them to **Markdown
  source lines** rather than onscreen blocks (including the frontmatter line count).
- **The recipient is the single auxiliary window opened most recently** (agent, terminal, or chat). If that window
  is closed, it falls back to a currently open window; if none are open, nothing happens (`utils/refTarget.ts`, tests included).
  App sends `detail.target` with `mew:insert-ref`, and **windows whose names do not match ignore it** — previously, every open window received
  the content, leaving residue in windows that would not even be used.
- Even when the agent window has multiple tabs, only the **visible tab** receives it (hidden tabs remain mounted
  and alive). Only the chat window receives it as a file mention token (`[[프로젝트:경로]]`) instead of text — it uses `project` and `path` from the same event.
- Ctrl+L pressed **inside** the terminal does not use this route — `TmuxTerminal` handles it directly and writes the selected editor text (or the active file path
  if there is no selection) to the shell.

## Running

```bash
npm run dev     # 4999 — 개발 (vite HMR)
npm run build   # tsc + vite build → dist/
npm run serve   # 5000 — dist/ 필요
npm start       # build + serve
npm test        # node:test
npm run lint    # oxlint
npx tsc -b      # 타입만 (빌드 없이)
```

⚠️ **`npm run build` deploys immediately** — the server reads and serves `dist/` from disk, so building changes the screen that is already open.
The user performs builds and restarts manually. Under the execution invariants above, agents only validate and do not
run commands that apply changes, including `mew`.

**If you edit a file in this repo from the terminal and later find it reverted**, the user had that file open in
the mew editor, and saving the buffer overwrote the disk file. Check again whether the changes were applied, and instruct
the user to close the file or use Revert File.

### Settings

`설정 > 화면`, opened from the header's account/settings menu, remembers three font sets per browser along with the theme
and language. Global UI text, Markdown Hotview body text, and Mono (code editor, terminal, inline/block code, and `font-mono` UI) are independent; if
the entered font is unavailable on this device, each category uses its system fallback font. Values are saved under `mew:fonts` in `localStorage`,
and each item can be reset to its default.

The configuration file is **outside the repo** — `~/.config/mew/config.env` (respects `XDG_CONFIG_HOME`). If `.env` exists inside the repo, it overrides values
last, so it serves as a temporary override during development. `server/config.ts` alone defines the read order
and default paths — **it must be the entry point's first import.** If it comes later, values such as `MEW_DATA_DIR` are silently
ignored because other modules have already read them.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MEW_WORKSPACE` | Parent of the app folder | Folder containing projects. Do not revert `WORKSPACE_ROOT` in `server/paths.ts` to a fixed path — separating the app and workspace is necessary for container deployments and deployments to other folders |
| `MEW_DATA_DIR` | `~/.local/share/mew` (or `<앱>/.data` from an older installation, if present) | Accounts · sessions · guest rules · icons · exact search/RAG indexes · model cache |
| `MEW_TEAM_PORT` | 5000 | Server port |
| `MEW_COLLAB_RUST` | Unset (=JS Yjs) | If `1`, use Rust (yrs) for collaboration room state — run `npm run build:native` first (see §Collaboration rooms below) |
| `DATABASE_URL` | Unset | Postgres for `/db`. If unset or unreachable, only the `/db` API returns 503 |
| `R2_*` | Unset | Media uploads (S3-compatible). If unset, only uploads are disabled |
| `MEW_SEARCH_INDEX_ENABLED` | `1` | If `0`, disable the SQLite exact search index and use only the existing source text scanner |
| `MEW_PERF_LOG` | Unset | If `1`, log catalog, tree, and search timings as one line of JSON without paths or search queries |
| `MEW_RAG_ENABLED` | `1` | If `0`, disable only local semantic search. Exact search always remains available |
| `MEW_RAG_MODEL` | `Xenova/multilingual-e5-small` | Transformers.js feature-extraction model (default 384-dimensional contract) |
| `MEW_RAG_MAX_FILE_BYTES` | `1000000` | Individual text files exceeding this size are excluded from the semantic index |

All are optional — the app starts even if none are set. To see where current values come from, use `./mew status`.

### Project search · Local RAG

Ctrl+P filename search and Ctrl+Shift+F exact content search share the server's incremental file catalog. The explorer reads snapshots
per parent folder, and the watcher updates only affected parents. For filename search, the server returns only the top 50 results
without sending the entire tree.

For literal content searches of 3 or more characters, Node's built-in SQLite FTS5 narrows the candidate files,
then line, column, and case are revalidated against the current source text. The DB is at `<MEW_DATA_DIR>/search/<workspace-hash>/catalog.sqlite` and is regenerated from the source
text if deleted. Initial construction, indexing failures, 1–2 characters, and regular expressions
automatically fall back to the existing source-text scanner, preserving result accuracy and file editing. The APIs are `GET /api/search/files` and `GET /api/search/stream`;
the new client contract for tree is `{version,state,entries}` from `GET /api/tree?...&v=1`, and the old array response is also retained.

The `의미` button in the `Ctrl+Shift+F` search box splits visible text files in the current project into chunks and searches them in
local LanceDB. It is available only to logged-in users and does not send documents to external APIs.

- The default model, `Xenova/multilingual-e5-small` q8 (384 dimensions), downloads approximately 130 MB on the first
  search and caches it at `<MEW_DATA_DIR>/rag/models`. In Docker, it persists in the existing `/data` volume.
- The DB and manifest are at `<MEW_DATA_DIR>/rag/indexes/<workspace-hash>`. Markdown and code are the SSoT, and deleting this folder causes everything to
  be regenerated on the next search.
- Only files whose size/mtime fingerprint has changed are re-embedded. For docs, searches use the MOC's Current by default and include
  History/raw and superseded ADRs only when the `이력` button is enabled.
- If model download or initial indexing fails, only `GET /api/search/semantic` returns 503. Existing exact/regex search is unaffected.
- APIs: `GET /api/search/semantic?q=&project=&history=0|1`, `GET /api/rag/status`, `POST /api/rag/reindex` (manager/owner). Results include the file
  path, start/end lines, heading, score, and citation context.

### Running in a container (optional)

This is the path for servers and VPSs. On your own computer, `./mew setup` (native) is preferable — **the terminal inside the container does not
have your development tools.**

```bash
docker compose --profile app up -d --build   # 앱 + Postgres
```

Provide `MEW_WORKSPACE_HOST` (default: this repo's parent), `MEW_PORT`, `MEW_BIND`, and `MEW_UID`/`MEW_GID` through `.env`. `npm run db:up` starts
only Postgres from the same file, so they do not interfere with each other.

### User management (on the host)

```bash
npm run users -- add <email> [role]   # 임시 비밀번호 발급 — 첫 로그인 때 변경 강제 (role 생략 시 member)
npm run users -- role <email> <role>  # 기존 계정의 역할 변경 (owner|manager|member)
npm run users -- reset <email>        # 임시 비밀번호 재발급 + 기존 세션 전부 무효화
npm run users -- remove <email>       # 삭제 (세션 즉시 무효화)
npm run users -- list
```

Deliver the temporary password to the account holder through a secure channel. The initial owner
account can only be created through this CLI (`npm run users -- add <email> owner`) — afterward, the owner can change other accounts' roles in the app's
settings popup.

## /db database

Typing `/db` in the editor inserts a Notion-style table database (v1 supports table view only).
Only a reference ID is stored in the body (`<div data-mew-db="uuid">`), and **Postgres is the SSoT** for the actual data.

- **Column types**: text · number · checkbox · date. Add columns with `+` in the column header, and click a header to rename it.
- **Real-time collaboration**: Row, cell, column, and title changes pass through an in-process hub and are immediately broadcast over WS to all sessions viewing the same DB.
- **Reference (view only)**: Use `/db 참조` to insert an existing database as a read-only view,
  or attach an external Postgres table (`schema.table`) as `external`. Reference nodes never modify the original.
- **Project isolation**: Physical tables are stored in the per-project schema `mew_{프로젝트}`, and metadata (titles and
  columns) in the catalog schema `mew`. A dbId from another project cannot even be queried.
- **All Databases popup**: Click the cylinder icon in the header (next to settings, logged-in users only) to select, view,
  and edit all databases in this project in a single popup (reuses the same table as editor nodes).

```bash
npm run db:up     # docker-compose로 Postgres 기동 (127.0.0.1:55432, 외부 미노출)
npm run db:down   # 중지
```

Provide connection details through `DATABASE_URL` in `.env` (see `.env.example`). If `DATABASE_URL` is missing or the connection fails, the `/db`
API returns 503, and the integration tests are skipped entirely (the editor's other features work normally).

### Security

- All values use parameters (`$1`), and all identifiers are quoted after being generated by the app or
  validated against an allowlist (`[a-z0-9_]+`) (`server/db/identifiers.ts`) — preventing SQL injection.
- external (reference) tables are **read-only**. No INSERT/UPDATE/DELETE/DDL operations are performed on the source tables.
- All REST and WS endpoints under `/db` are mounted with `requireAuthenticated`, so **guests cannot receive row data**.
- Backend layers: `pool → identifiers → schema → catalog → databaseService → hub`; REST: `server/db/routes.ts`;
  real-time relay: `server/db/socket.ts`.

Security boundaries are implemented in `server/guestAccess.ts` (per-file guest authorization), `server/paths.ts` (deny list), and `server/reqAuth.ts` (role
gating). **[security.md](../../../docs/operations/security.md) is the canonical source for the policy itself**, and this code implements it — update
the docs in the same session when changing the policy.

## Command buttons — two types

Despite their similar names, these are separate features. The sidebar's ▶ is for **per-project batch execution**, while the terminal row's buttons
**type into the session currently being viewed**.

| | Sidebar project ▶ button | Terminal buttons |
|---|---|---|
| Configuration file | `<프로젝트>/.mew/cmd-button.json` | `.data/term-button.json` (**global** — shared across all projects and tabs) |
| How to edit | Use `＋ 명령 추가` in the UI, long-press (right-click) a row, or edit the file directly | Use `+` in the UI or long-press (right-click) a button |
| Execution location | Dedicated hidden session `mewcmd-<해시>` | Currently open tmux session |
| Executed by | Server (`tmux send-keys`) | Client (types directly into the terminal WebSocket) |

### Sidebar project ▶ button (.mew/cmd-button.json)

The ▶ at the top of the sidebar opens the root project's command tab, and the ▶ on a subproject row
opens that subproject's command popover. Commands defined in each project's
`.mew/cmd-button.json` run directly in tmux (owner/manager only — the same security boundary as tmux). You can
run a subproject's own list without moving it to a separate tab.

File format:

```json
{
  "commands": [
    { "name": "빌드", "command": "npm run build" },
    { "name": "개발 서버", "command": "npm run dev" }
  ]
}
```

- Clicking ▶ runs the command in a tmux session with **the project folder as its cwd**. The same button always
  connects to the same session (`mewcmd-<해시>`), so clicking it again reruns the command in that session.
- **▶ in a running row becomes ■ (Stop)** — clicking it kills only that command's session (`DELETE /api/tmux/sessions/:name`). Running status is determined by the server-provided
  `running` value, so if the session is killed elsewhere, the button returns to ▶ on the next refresh.
- Command sessions have special names (`mewcmd-*`), so they **do not appear in the terminal tab list** (filtered by `isCommandSession`). Click the terminal
  icon on each row to view that session in a popup — **[Terminate]** kills the session and closes the popup, while
  **[Close]** closes only the popup, leaving the session alive.
- **The server always reads the command string to execute from the file** — it does not trust commands in the execution request
  body. (Editing uses a separate path: saving the entire list with `PUT` makes the next execution read the new file contents.)
- Editing: use `＋ 명령 추가` at the bottom of the dropdown; **long-press or right-click** an existing row to edit or delete
  it. Saving writes the entire list, overwriting the same file you may have edited manually (it is normalized to `{ "commands": [...] }`, and other
  top-level keys are not preserved). **Renaming changes the session name hash** — previously started sessions
  remain alive but are no longer visible through this button.
- Names must be unique within a project (duplicates return 400 because the two commands would share one session).
- Server: `server/cmdButtons.ts` (file parsing, normalization, writing, and session names) + `GET/PUT/POST /api/cmd-buttons*` (owner/manager). Client: `src/components/CommandButtonMenu.tsx`
  and `SessionTerminalPopup.tsx` (session popups use the **same component** as scheduled jobs — only the session name, title, and execution
  function passed in differ). Subproject dropdowns are **portaled to body and
  displayed with fixed positioning** so the sidebar's overflow does not clip them.

### Terminal buttons (.data/term-button.json)

They appear on the left of the terminal panel's button row (the same row as the selection mode button). Clicking sends input to the **tmux
session currently being viewed** through the same path as the bottom input field — it types the command, then sends a separate
Enter after a short delay, so slash commands (`/clear` and `/model`) in TUIs such as Claude Code are also submitted with one click.

```json
{
  "commands": [
    { "name": "정리", "command": "/clear", "icon": "i:sparks" },
    { "name": "커밋", "command": "/commit", "icon": "i:git-commit", "iconOnly": true },
    { "name": "모델", "command": "/model" }
  ]
}
```

- There is **one global list** — it does not vary by project or terminal tab. The server therefore stores it
  in `.data/` rather than the project folder (`.data/` is on the `paths.ts` deny list and cannot be opened through the editing API). **The UI is
  the editing interface**, rather than manual file editing: add with `+`, and long-press a button (right-click on desktop)
  to edit its name, command, and icon or delete it.
- `icon` uses **the same notation as project icons** — `i:{키}`, emoji, or `svg:{마크업}`. The picker
  is also the same `IconPicker`, including direct SVG input (validation uses only `normalizeIconValue`).
- With `iconOnly: true`, the button **hides its name and displays only its icon** (configured separately for each button through `이름 숨기고 아이콘만 보이기` in
  the edit dialog). If there is no icon, this is ignored and the name remains visible to avoid a blank button.
- The server does not execute commands. The client sends them directly through the already-open terminal WebSocket, so the
  session and cwd always match the screen. The socket itself enforces the owner/manager boundary, so there is no separate gating.
- Server: `server/termButtons.ts` + `GET/PUT /api/term-buttons` (owner/manager, list reading and writing only). Client: `src/components/TermButtonBar.tsx`
  — injected through the `renderCommandButtons` render prop of `TmuxTerminalPanel` (the terminal package has no
  knowledge of this feature's API).

### System resources popup

In the editor's upper-right toolbar, the **dashboard icon directly below the terminal button** refreshes and displays the server machine's CPU, memory,
and GPU usage and temperatures, along with **per-process usage**, every 2 seconds. Unlike the terminal button, it remains visible
even when the terminal is open.

- Server: `server/sysStats.ts` + `GET /api/system-stats` (owner/manager — the same boundary
  as the shell). Client: `src/components/SystemStatsModal.tsx`.
- CPU usage is calculated from the **increase since the previous call** in `os.cpus()` cumulative times. A single module holds the samples, so multiple windows
  only shorten each window's sampling interval; the values remain valid.
- Available memory uses `MemAvailable` from `/proc/meminfo` — `os.freemem()` counts cache as used memory, consistently overstating
  usage on Linux.
- GPU data comes from one `nvidia-smi --query-gpu=...` call. If unavailable, the result is an empty array and the popup displays "No GPU information."
- CPU temperature comes from `/sys/class/thermal/thermal_zone*/temp`. **It is not exposed in WSL or containers and is therefore `null`**; in that case, the popup
  explains this in one line (GPU temperature comes separately from `nvidia-smi`, so it appears even in WSL).
- `processes[]` reads `/proc/<pid>/stat` directly — `ps %cpu` is an **average over the process's entire lifetime**, so it cannot show "who is using resources
  right now." CPU usage is the increase in `utime+stime` ticks since the previous sample, measured relative to one core, so
  it can exceed 100%. Entries with RSS, CPU, and GPU all at 0 (kernel threads) are omitted from
  the response. Per-process GPU data is **memory (MB) only**, as provided by `nvidia-smi --query-compute-apps` — that query does not include per-process
  GPU utilization. Returns an empty array in environments without `/proc` (non-Linux).
- **The client collects trend graph data** — the server has no ring buffer. While the popup is open, it retains the latest 60 samples
  (2 minutes) and discards them when closed. Individual process graphs are also extracted from this history by pid.

### Scheduled jobs (.data/schedules.json)

The toolbar's **clock icon** — register when, in which folder, with which agent, and with which prompt, and the agent runs
unattended at that time. Owner/manager only (a surface for unattended execution of arbitrary prompts — the same boundary as the shell).

- Server: `server/schedules.ts` + `server/runAgentJob.ts` + `GET/PUT /api/schedules`, `POST /api/schedules/run` (run now).
  Client: `src/components/ScheduleModal.tsx`;
  cron expression ↔ GUI conversion: `src/utils/cron.ts`.
- **The source is `.data/schedules.json`; crontab is derived.** Each save removes and rewrites only lines marked with `# mew-job:<id>` — manually
  written cron lines are left untouched and are also shown read-only in the window.
- **Execution takes place inside a dedicated tmux session for the job.** The cron
  line does only three things — `tmux new-session -d -s <세션> -c <설정한 폴더>` (let it fail if the session already exists and reuse that session)
  → `send-keys -l <에이전트 명령>` → `send-keys Enter`. This uses the same structure as command buttons, so the screen remains in the session after unattended
  execution finishes and can be inspected as is through each row's **terminal icon** (the same `SessionTerminalPopup`).
- The session name is `mewcmd-job-<id 앞 8자>`. It uses the same prefix as command buttons, so it **does not appear in the
  terminal tab list** (the `isCommandSession` filter), and the popup's **[Terminate]** kills that session (`DELETE /api/tmux/sessions/:name`). The popup's **Run**
  button and `POST /api/schedules/run` use **the exact same session and command** as cron — you can check them without waiting
  for the scheduled time. The execution request body accepts only the job's `id`.
- **The prompt is not inlined into the shell.** It is written to `.data/schedules/<id>.prompt`, and the command reads that file — avoiding
  quotes, newlines, and `%`, which cron interprets as a stdin delimiter (command-side `%` is escaped).
- The execution command uses a shared ACP runner
  rather than agent-specific templates: `node server/runAgentJob.ts --runtime <id> --prompt-file <프롬프트파일> --log-file <로그> --cwd <폴더>`. The runner starts the ACP runtime using the same registry
  in `server/agentRuntimes.ts` ([ADR 0060](decisions/0060-mew-shared-agent-runtime-registry.md)). There is no place for users to enter a command string. At save time, `node` and `tmux` are
  **resolved to fixed absolute paths** using `command -v` — cron's PATH cannot
  find them by name alone.
- The 5 cron fields allow only `[A-Za-z0-9*/,-]` (preventing crontab injection). Output appears on the session screen
  while `runAgentJob.ts` also appends it to `.data/schedules/<id>.log`; that file's mtime is the window's "Last Run." **Logs do not shrink automatically**
  — delete them manually if they grow large.
- If the next scheduled time arrives while the previous run is still active, **the command is typed directly into the same session**
  (= it goes into the running agent's stdin). Do not set an interval shorter than the execution time.
- Deleting a job also kills its session when you save — because it is a hidden session that cannot be accessed anywhere in the UI.

### Ignore list (.data/ignore.json)

A list of **names** to skip entirely in file listings, search, and tree watching. These are
names, not paths, so folders and files with those names disappear at any depth (`dist` → every `dist/` in every project).
Edit it in Settings → **Hidden List** (owner/manager). If the file is absent, `DEFAULT_IGNORE` from `server/ignoreList.ts` is used.

```json
{ "names": ["dist", ".next", "node_modules", ".git", ".data"] }
```

- There is **one global list** — it does not vary by project. That is why the server stores it in `.data/`.
- `.git`, `node_modules`, and `.data` are blocked separately at the API layer by `DENY_SEGMENTS` in `paths.ts`. They remain hidden even if removed from the list, so
  the server adds them back on save and the UI marks them as **Fixed** — making them look removable
  would lead to “I removed it, so why is it still there?”
- On save, the server shuts down all watchers (`resetTreeWatchers`) and sends a `tree` signal. Active watchers retain tree signatures generated
  under the old rules and would dismiss the new rules as “no change.” Shutting them down causes
  them to be registered again under the new rules when clients fetch the new tree (`GET /api/tree`).
- `build/` is **not** hidden by default. The tree exposes only APK/AAB files inside it and suppresses other
  contents and empty folders (`DOWNLOAD_ONLY_DIRS` in `tree.ts`), while watching does not descend into `build` regardless of the hidden list.
- **Neither this list nor the extension filter applies to owner and manager trees** — they show everything as it exists. The list remains
  active for trees shown to members and lower roles, and for **search and tree watching** regardless of role.
- The sidebar uses `GET /api/tree?path=<폴더>` to read **only the direct children** of that folder. When switching projects,
  it renders the root list first, then warms the top-level folders one by one
  in the background; deeper paths are read when the user expands them. API calls without
  `path` retain the full recursive tree for compatibility with existing server tools. The canonical
  source for policy is [security.md](../../../docs/operations/security.md), and the only decision points are `isPathVisible` in `server/tree.ts` and `seesEveryFile` in `server/reqAuth.ts`.
- Server: `server/ignoreList.ts` + `GET/PUT /api/ignore` (owner/manager).
  Client: `IgnorePanel` in `src/components/SettingsModal.tsx`.

### Dragging and dropping sidebar items

Dragging files or folders **means different things depending on where they are dropped**. To support
multiple meanings in one drag, `pathDrag.ts` in `@mew/ui` puts the path in both a dedicated MIME type (`application/x-mew-path`) and `text/plain`; folders additionally
carry `application/x-mew-dir` so they can be **distinguished from files even during `dragover`, when values cannot be read**.

| Drop target | Result |
| --- | --- |
| Sidebar folder (empty space = project root) | **Move** to that folder (`POST /api/rename`) |
| The **outer 30%** of an editor pane (files only) | **Split the view in that direction** using the same rules as tab dragging + open the file in the new pane |
| Hotview/Plain editor (center) | Insert **path text** at the drop position |
| Terminal screen | **Type** directly into the shell (Enter is not sent — the user completes the command) |
| Input field at the bottom of the terminal | **Insert the path** at the cursor (replace the selection if present) |

`App.tsx` intercepts edge splits in the pane container's **capture-phase** `dragover`/`drop`
handlers (`pathDropTargetAt`) — center drops and folders pass through without `preventDefault` to preserve their original
meanings in the table below, while edge drops are stopped with `stopPropagation` so ProseMirror does
not subsequently insert the path. `useTabs.splitEmptyPane` creates an empty pane, and `openFile(paneId)` adds the tab.

- **During `dragover`, `getData()` always returns an empty string** (DataTransfer protected mode). The receiving side uses
  `hasPathDrag` (= checking `types`) to identify the drag, and reads the value (`pathFromDrag`) only during `drop`. Confusing these prevents
  `preventDefault` from being called, so the drop itself never occurs.
- `effectAllowed` is `copyMove` — allowing only `move` causes editors and terminals that accept drops with `dropEffect='copy'` to reject the drop entirely. Folders
  in the tree explicitly specify `move` in their own `dragover` handlers to preserve the original meaning.
- The editor intercepts drops **only when the dedicated MIME type is present**. Images and text dragged from outside are uploaded or inserted as before.

**Dragging from outside (a file explorer) into the sidebar** goes in the opposite direction — the file is
**saved as-is** in the folder where it is dropped (empty space = project root) (`POST /api/upload-into`, multipart `file` and `destDir`). Detection checks whether `dataTransfer.types` contains `'Files'`, and only
then sets `dropEffect='copy'`. If a name conflicts, the server uses `이름 copy` to avoid it; multiple dropped files are uploaded **sequentially** (sending
them concurrently would select the same available name). Unlike dropping into the editor body, which creates an R2 link,
this does not go through R2 — it writes the bytes directly to the project folder and commits them to git.

### Table column widths (.mew/table-layout.json)

Markdown cannot store **column widths** adjusted by dragging table dividers in Hotview (HTML `<table>` can store
them, but makes plain mode cluttered). The content therefore remains a pure Markdown table, with
only the widths stored by document path in the project's `.mew/table-layout.json`.

```json
{
  "version": 1,
  "docs": {
    "ops/repos.md": [[220, 380, 160], null, [120, 120]]
  }
}
```

- Outer array = **the order in which tables appear in the document**; inner array = column widths (px) for that table. `null`
  means a table has no saved widths, and `0` means a column has not yet been resized by dragging.
- **Adding, deleting, or moving tables can shift their order and misalign the widths.** Dragging again overwrites them — this is the tradeoff
  for leaving the Markdown content untouched.
- Widths are restored once after seeding the content, using `addToHistory: false` (`SEED_ORIGIN` for collaboration). Otherwise, the restoration would
  enter the user's undo stack, and a single Ctrl+Z would revert all widths. **Every
  place that seeds content programmatically follows this rule** — without a wrapping `SEED_ORIGIN` transaction,
  seeding enters the user's undo stack, and a single Ctrl+Z removes the entire document (`Editor.tsx`).
- **If loading fails, do not save either.** Treating unread data as "no widths" and overwriting it would
  erase the saved values.
- Server: `server/tableLayout.ts` + `GET /api/table-layout` (guests need view permission)
  and `PUT /api/table-layout` (login required). Client: `readTableWidths`/`applyTableWidths`
  in `packages/editor/src/Editor.tsx`, injected through `EditorApi.fetchTableLayout`/`saveTableLayout`.

### Indenting the first list item (`- - b`)

Tab indents a list item by one level. The default `sinkListItem` moves it **inside the immediately preceding sibling item**,
so it does nothing for the first item, which has no preceding sibling. mew instead creates a **parent
item with no line of its own** and indents into it — `- - b` in Markdown, which Shift+Tab reverses.

- That is why the content of `listItem` is `(paragraph|bulletList|orderedList) block*` rather than the default `paragraph block*` (`IndentableListItem` in `packages/editor/src/editor/listIndent.ts`). If a paragraph
  is required, the HTML that markdown-it parses as nested `- - b` cannot be placed inside the item and
  becomes two separate lists, losing the indentation on a round trip.
- **The client (`Editor.tsx`) and server (`serverExtensions.ts`) must use the same `IndentableListItem`.** Changing only one side causes documents to diverge during collaborative
  merges. That is why the definition lives in a single module.
- It cannot be saved as `  - b` without a parent marker — under Markdown rules, it becomes a top-level item when read again.

## Agent window (ACP)

The speech bubble button in the header opens a **chat panel** for talking to an AI agent
tied to the **current root project** (it is not a terminal). Each project
has its own tab list; switching projects keeps the panel open but switches
to that project's tabs. A new tab's cwd starts at the current project root, with one conversation **per
tab**. The agent runs as a separate process and communicates
only over [ACP](https://agentclientprotocol.com) (stdio JSON-RPC). mew has no adapter interface of its own—ACP is the interface. See [ADR 0034](decisions/0034-mew-agent-panel-acp-reintroduction.md) and [ADR 0043](decisions/0043-mew-agent-workspace-scope-and-runtimes.md) for the rationale, and [security.md](../../../docs/operations/security.md)
for permission boundaries. On desktop, drag anywhere along the panel's
left border horizontally to resize it; the browser retains the width.

⚠️ **Do not run agents directly inside the `serve.ts` request handler.** The old agent panel, removed on 2026-07-25,
invoked Claude Code with `-p --output-format json`, a blocking, non-streaming call that stalled the first response for ~20
seconds. The current implementation (child process + ACP streaming, `server/agentAcp.ts`) solves that problem structurally; do not revert
it.

- Server: `server/agentRuntimes.ts` (shared runtime registry) + `server/agentDefaults.ts` (per-runtime model and permission defaults) + `server/agentAcp.ts` (session and file scope) + `server/agentHost.ts` (independent
  supervisor process and Unix socket per tab) + `server/agentWs.ts` (WS↔supervisor relay) + `server/agentUsage.ts` (token usage).
  Client: `src/components/AgentPanel.tsx` + `src/utils/agentFold.ts` (events→display items) + `src/components/agentRuntimes.tsx` (runtime list and icons, shared
  with the scheduled tasks panel) + `src/utils/agentMarkdown.ts` (response Markdown). Access is limited to **owner/manager**
  (the same set as `authorizeTmux`)—agents can use Bash, so
  they must have the same boundary as tmux. The default permission
  mode is `bypassPermissions` (no approval prompts), so **this role gate is the only
  control**—lowering it below tmux's level opens an unattended shell.
- In the input field, use `/` to search for and insert local skills, and `@` to search for and insert subprojects
  and folders and files in the current project. `@` results show only items that **start with** the entered string, with the last focused editor file shown first if one exists. Otherwise, the order is **subprojects → folders → files**, alphabetically
  within each type. `GET /api/projects` returns projects appropriate for the role; selecting one inserts `#프로젝트명` as before. Folders
  and files
  are inserted as `[[프로젝트:경로]]` tokens. `GET /api/skills` builds the skill list by reading `SKILL.md` from `CODEX_HOME/skills` and `<워크스페이스>/.agents/skills`. When `/스킬명` is selected, the browser sends only the
  skill id over WS, and the server composes the actual prompt using the runtime registry in `server/agentRuntimes.ts`. For all ACP runtimes, the default
  composer instructs the agent to read and follow the selected `SKILL.md` first. `@파일` is inserted as the same `[[프로젝트:경로]]`
  token used in chat. `Alt+L` opens or closes the agent panel regardless of focus. Drag **anywhere along the border
  between the chat and input field** vertically to expand
  the input field to 80% of the screen height (use ↑ and ↓ on the border with the keyboard).
- `+` and the centered **New Tab** button shown when there are no tabs open the **new tab picker** without
  creating a tab first. The picker starts with the `런타임 | 에이전트셋` toggle at the top. Runtimes
  can be selected directly as before, while agent sets show a list of saved `런타임 + 모델 + 역할` presets.
  Create a preset using `+ 새 에이전트셋 추가` at the end of the list. Selecting a runtime opens the same ACP
  chat tab under that runtime's name; selecting a set opens it under that set's name. Before selection, there
  is no tab, WS, or ACP session, and no temporary tab named `새 대화`. Tab names are not automatically replaced
  by the first prompt and can be renamed manually. A set's model is applied when the tab
  starts, and its role is attached once as a system instruction to the session's first prompt. The
  last selected toggle is saved in the browser and restored as the default view for the next new tab. Runtime
  status and the agent set list initially show the shared in-page cache, then update with the results of an asynchronous refetch initiated by each picker
  when it opens. Definitions are saved to `<DATA_DIR>/agent-sets.json` through `GET` and `PUT /api/agent-sets` (owner/manager) ([ADR 0095](decisions/0095-mew-agent-sets-as-tab-presets.md)).
- Clicking a **current workspace file link** in a response opens the corresponding project and document
  tab in the same mew instance instead of a new browser tab. If `:줄` or `#L줄` is appended, it jumps to that
  line; Markdown also opens in Plain in this case to show the exact source line. `GET /api/agent-file-link?href=` validates and converts it
  to `{project,path,line}` without exposing the server's absolute path (owner/manager). Web links continue to open in new browser tabs.
- A tab's **working directory (cwd)** is set to the current workspace root when a new tab opens
  and cannot be changed in the UI. The path continues to be saved as the basis
  for ACP sessions and history, but there is no address-bar-style input field ([ADR 0097](decisions/0097-mew-agent-panel-removes-cwd-bar.md)).
- Channel: `/api/agent/ws?runtime=<id>&tab=<id>&cwd=<absolute-path>&resume=<session-id>`—**one tab is one session**, with one live session per `런타임+탭+cwd` (omitting the runtime defaults to `claude`; an id absent from the registry returns 400. Omitting
  the tab defaults to `default`; a value that does not match `[A-Za-z0-9_-]{1,64}` returns 400). The icon at the panel's upper left
  shows the currently connected runtime; click it to switch—the selection is retained only in the browser (`mew:agent-runtime`).
  Closing the panel leaves the session running; reopening it restores the conversation
  by **replaying past events from the beginning**. Each tab's supervisor relays through
  `<DATA_DIR>/agent/*.sock` in a process group separate from mew, so **an ongoing turn continues even if the browser closes or mew
  stops or restarts**. The supervisor and ACP/CLI terminate only after all turns and queued work
  finish and 30 minutes pass with no panel attached ([ADR 0048](decisions/0048-mew-agent-supervisor-process.md)). Even after the supervisor exits, the tab remembers the last ACP
  session ID for each runtime and cwd. Reopening it starts a new supervisor that uses `session/load` on that
  ID to replay the transcript, so the 30-minute idle shutdown only
  cleans up processes and does not turn the tab's conversation into a new one ([ADR 0079](decisions/0079-mew-agent-tabs-resume-after-idle.md)).
- **Installation and login are separate** ([ADR 0072](decisions/0072-mew-agent-gui-authentication.md)). If `session/new` returns an authentication requirement, the process stays open and the
  UI switches to the login screen. For standard ACP login, the user checks the address and clicks **Open Login Page**
  to proceed in a new tab in the current browser. API keys are sent only once in an ACP request and are neither stored
  nor logged as events. terminal auth runs only fixed commands advertised by the adapter or defined in the runtime registry,
  in a Mew tmux popup. The server records only the actual command's exit code and monitors it even if the GUI closes the popup.
  Only an exit code of `0` automatically reinitializes ACP so the CLI rereads the credentials it just wrote; failure, `Ctrl-C`,
  or forced termination leaves the terminal open without restarting. Even for CLIs that cannot start ACP before login,
  the tab supervisor does not close with a fatal error; it emits the same terminal auth flow to recover in the same tab.
- The tab list, names, and last session ID for each runtime and cwd exist only in the browser and are **separated
  by the root project's absolute path** (`mew:agent-tabs:<root-path>`)—the server knows **only the tab id**, not its meaning. Closing a tab also deletes its session IDs; switching
  runtime or cwd within the same tab preserves
  a separate conversation pointer for each combination. The last viewed tab is also retained per root path (`mew:agent-active-tab:<root-path>`)—reopening the panel or restarting the
  browser activates that tab. **Only that one tab attaches** (the other restored tabs attach when
  clicked open, since each tab has its own process). There are no swipe actions
  to switch or close panels or tabs. The floating handle handles these actions. A tab's
  name starts as the selected runtime or agent set name; double-click the tab to edit it manually ([ADR 0096](decisions/0096-mew-agent-tabs-created-after-selection.md)).
  - New tabs are created only after a selection, so there is no empty tab for browsing history or entering session input before selecting. A new
    session starts in that tab immediately after selection, and choosing past sessions remains available from the tab
  - The same session cannot be opened in two tabs (it is locked in the list) — two processes holding the same transcript would corrupt the record
  - **As the conversation grows, it scrolls down only while pinned to the bottom** (with a 48px bottom threshold). If you have scrolled up
    to read, it keeps your position and shows only **[New Messages]**—clicking it scrolls to the bottom, and it also disappears
    if you scroll to the bottom yourself. Sending a prompt or reloading a session (`reset`) pins it to the bottom again
  - **Only closing a tab ends its session** (`close_session`). This differs from closing the window. Tabs that are not being viewed keep their WS connections
    (ongoing conversations must not stop), and only tabs opened at least once are connected (restored tabs are not all launched at once)
  - **Elapsed time appears to the right of each turn bubble**, in the form "15 seconds", "36 minutes 32 seconds", or
    "2 hours 5 minutes 4 seconds". The server records `startedAt` in `turn_start` and `durationMs` in `turn_end`, so these times also appear in replayed history. For an ongoing turn,
    the elapsed time from startedAt to now is recalculated every 1 second; old history without timing information hides it

| Direction | Message |
| --- | --- |
| Client → server | `{type:'prompt', text}` · `{type:'cancel'}` · `{type:'permission', id, optionId\|null}` · `{type:'authenticate', methodId, secret?}` · `{type:'retry_auth'}` · `{type:'auth_url_response', id, action}` · `{type:'set_model', modelId}` · `{type:'set_mode', modeId}` · `{type:'unqueue', index}` · `{type:'move_queued', from, to}` · `{type:'edit_queued', index, text, expect}` · `{type:'list_sessions'}` · `{type:'load_session', sessionId}` · `{type:'close_session'}` |
| Server → client | `{type:'ready'}` · `{type:'replay', events}` · `{type:'update', update}` (original ACP `session/update`) · `{type:'permission', id, toolCall, options}` · `{type:'permission_done', id}` · `{type:'turn_start', startedAt}` · `{type:'turn_end', stopReason, durationMs}` · `{type:'error'\|'fatal', message}` · `{type:'models', models}` · `{type:'modes', modes}` · `{type:'meta', meta}` · `{type:'auth', methods, authenticating, error}` · `{type:'auth_url', id, url, message}` · `{type:'auth_url_done', id}` · `{type:'auth_complete'}` · `{type:'reset'}` · `{type:'sessions', sessions}` |

- **Replay is a single frame (`replay`).** On attachment, the server sends the entire buffered conversation (`snapshot()`, up to 500 events),
  then streams events one at a time. The panel caches the last viewed transcript in `localStorage` (`mew:agent-events:*`) per tab, runtime,
  and cwd, rendering it from the first frame when the browser is reopened. For a `replay` of the same session, it removes the tail overlapping the
  cache and appends only the latest events—the server's 500-event cap does not remove previously viewed prompts and responses
  from the beginning. For a different session, it replaces the transcript with `replay`. The panel does not clear the conversation
  when the socket disconnects. Previously, it replayed up to 500 events **one at
  a time**, and the panel visibly froze as it rerendered each time (one `foldEvents` call per event + the entire list).
- **The window batches incoming events into one frame and renders only once** (`requestAnimationFrame`). Streaming chunks arrive dozens of times
  per second. `reset` is also processed in order in that queue, so "Clear" and "New Conversation" enter the same frame.
- **`meta`, `sessions`, and `reset` are not accumulated in the event buffer.** `meta` is a state snapshot sent in full on attachment and
  whenever it changes (`sessionId`, `startedAt`, `turns`, `busy`, `queued`, `usage`, `canLoad`, `canList`); `sessions` is returned **only to the panel that requested it, and only
  when requested** (the claude runtime reads directly from disk without waiting for a session to start). Session list
  cwd comparisons are case-insensitive, so history for the same folder is found even if the path casing in older
  records differs from the current actual path. A panel receiving `reset` discards the conversation rendered so far.
- The server sends the socket a **ping every 30 seconds** to prevent quiet conversations (while the agent is doing lengthy work) from being disconnected
  by an intermediary's idle timeout. If it still disconnects, the panel reconnects after 1 second and recovers through `replay`.
- **A `prompt` received while a turn is running is queued rather than discarded.** When the turn ends, the server runs queued
  items in order; `cancel` also clears the queue. Queued items can be reordered (`move_queued`) and edited (`edit_queued`) in the panel—because the preceding
  turn may finish and advance the queue during editing, the server ignores the edit if `expect` (the original value the panel was displaying)
  differs from the value currently at that position.
- Loading (`/resume`) uses **ACP methods** (`session/list` and `session/load`). It replaces only the session, leaving the child process running. Whether to request
  the list is determined by the capability (`meta.canList`) from `initialize`. An exact `/clear` is not passed to the CLI as a prompt. If
  work is in progress, it enters the server queue as a **session boundary**: after preceding work finishes, a new ACP session
  opens, and messages queued after it run in the new conversation. The previous conversation remains only in history.
- For Prime Agent, Mew's internal adapter converts the official `prime-agent --mode rpc` to ACP. Therefore, session listing/loading, models, and thinking
  mode are available in the Mew window regardless of whether Prime ACP implements them.
- **Only token usage comes from outside ACP**: the adapter
  does not send usage, so `agentUsage.ts` reads `<CLAUDE_CONFIG_DIR>/projects/<인코딩된 cwd>/<sessionId>.jsonl`. This is read-only and optional;
  if the file is absent, only the usage field remains empty ([ADR 0036](decisions/0036-mew-agent-session-controls-and-usage.md)).
- `GET /api/agent-cwd?path=&base=` validates address bar input as an absolute directory on the server filesystem (owner/manager). An
  empty `path` means the current workspace; relative paths are resolved against `base`.
- `GET /api/agent-cwd/suggestions?input=&base=&entered=` returns subdirectories matching the prefix of the last path component being entered, or children
  of an already entered directory (owner/manager).

- **The save icon next to the model and permission selectors saves the current values as defaults for that runtime** ([ADR 0063](decisions/0063-mew-agent-runtime-saved-defaults.md)). Values are stored per
  runtime in `<DATA_DIR>/agent-defaults.json` rather than in the browser, and apply to `session/new` and `session/load` after opening new tabs or restarting
  the server. The icon is highlighted when the current selection matches the saved values. Without
  a saved value, **the default permission mode is that runtime's "Allow All"** ([ADR 0037](decisions/0037-mew-agent-bypass-permissions-default.md)). ACP sessions start in a restricted mode (claude
  `default`, codex `auto`), so the server reapplies the mode after every `session/new` and `session/load` (`#applyDefaults`). Names differ by runtime, so it
  selects from an ordered list of candidates (`FULL_ACCESS_MODES`) instead of hardcoding one value—claude `bypassPermissions`,
  codex `agent-full-access`, hermes `dont_ask`. claude's `dontAsk` has the opposite meaning (reject anything not preapproved), so the ordering distinguishes them. The header
  selector can change the mode for each turn. Setting a mode id in `MEW_AGENT_MODE` overrides saved permissions as
  an operator-enforced value. The mode list uses exactly what the backend advertises—if
  the mode is not advertised (for example, when running as root), it is silently skipped.
- **A new tab does not start a session until a runtime or agent set is selected** ([ADR 0096](decisions/0096-mew-agent-tabs-created-after-selection.md)). Closing the last tab leaves only the centered `새 탭` button; both `+` and this button
  only open the selector. Uninstalled runtimes are installed only with fixed installation
  commands from the server registry, and successful installation selects that runtime
  without a refresh. The WS connection, history, and input field appear only after
  selection. The runtime is stored per tab in `mew:agent-tabs`, and older tabs are migrated once using the last `mew:agent-runtime` value.
- **The header icon in the session window is a runtime dropdown** ([ADR 0074](decisions/0074-mew-agent-header-runtime-switch.md) — lifts 0062's prohibition on switching within a tab). Clicking it expands the same
  registry used by the new-tab list (icons, installation status, and Use/Install), and selecting another agent **switches
  that tab's session** — it does not create a new tab. Because the WS connection effect depends on
  `runtime`, it reconnects and attaches a new session, while the old session remains under server supervision. Installation
  within the dropdown uses the same fixed command path.
- Switching backends means **changing the spawn target**. Only entries in the `RUNTIMES` registry in `server/agentRuntimes.ts` can be selected; the client
  duplicates the list solely for **icons** (the server makes the determination):
  | Runtime | ACP command | GUI terminal auth | Environment variables |
  | --- | --- | --- | --- |
  | `claude` | `node_modules/.bin/claude-agent-acp` (`@agentclientprotocol/claude-agent-acp`, version pinned) | Adapter `--cli` (prefers the advertised `claude auth login` variant) | `MEW_AGENT_CMD` · `MEW_AGENT_ARGS` · `MEW_AGENT_CLAUDE_CMD` · `MEW_AGENT_CLAUDE_ARGS` · `MEW_AGENT_CONFIG_DIR` (→ child's `CLAUDE_CONFIG_DIR`) |
  | `codex` | `node_modules/.bin/codex-acp` (version pinned) — the adapter itself is the agent; credentials are in `~/.codex` | Bundled `codex login --device-auth` | `MEW_AGENT_CODEX_CMD` · `MEW_AGENT_CODEX_ARGS` · `NO_BROWSER` (default `1`) |
  | `hermes` | `hermes acp` — mew does not bundle it | `hermes acp --setup` | `MEW_AGENT_HERMES_CMD` · `MEW_AGENT_HERMES_ARGS` |
  | `kimi` | `kimi acp` | `kimi login` | `MEW_AGENT_KIMI_CMD` · `MEW_AGENT_KIMI_ARGS` |
  | `gemini` | `gemini --acp` | `gemini --skip-trust`(`NO_BROWSER=true`) | `MEW_AGENT_GEMINI_CMD` · `MEW_AGENT_GEMINI_ARGS` |
  | `openclaw` | `openclaw acp` | `openclaw onboard --tui` | `MEW_AGENT_OPENCLAW_CMD` · `MEW_AGENT_OPENCLAW_ARGS` |
  | `opencode` | `opencode acp` | `opencode auth login` | `MEW_AGENT_OPENCODE_CMD` · `MEW_AGENT_OPENCODE_ARGS` |
  | `cursor` | `agent acp` | `agent login`(`NO_OPEN_BROWSER=1`) | `MEW_AGENT_CURSOR_CMD` · `MEW_AGENT_CURSOR_ARGS` |
  | `prime` | Mew built-in adapter → official `prime-agent --mode rpc` — installed with the official installer (`curl -fsSL https://app.primeintellect.ai/prime-agent/install.sh \| sh`) | TUI `/login` (provider selection) | `MEW_PRIME_AGENT_EXECUTABLE` · `MEW_AGENT_PRIME_ARGS` |

  The shared setting is `MEW_AGENT_MODE` (if omitted, the Allow All candidate order above is used). If the entry point is missing or does not speak ACP before
  login, both the error and terminal auth are shown—the runtime is not hidden from the list, and the tab is not closed. If it still fails
  after login completes, the latest startup error remains on the same screen. Prime Agent supports one session per connection, so one
  mew tab corresponds to one Prime session (a second tab starts another process).

| Route | Role | Function |
|---|---|---|
| `GET /api/agent-runtimes` | manager·owner | Whether registered runtimes' executables exist and whether installation, safe removal, and logout are available |
| `POST /api/agent-runtimes/:id/install` | manager·owner | Runs the registry's fixed installation command for the ID. Does not accept arbitrary commands or arguments |
| `DELETE /api/agent-runtimes/:id/install` | manager·owner | Runs the fixed uninstall command declared by the registry. Rejects the request if no safe removal contract exists |
| `POST /api/agent-runtimes/:id/logout` | manager·owner | Runs only the noninteractive CLI logout declared by the registry. Does not read or transmit credential values |
| `POST /api/agent-runtimes/:id/auth/:method/run` | manager·owner | Runs the fixed terminal auth command advertised by ACP or specified in the registry in a hidden tmux session. The body contains only `{tab}` |
| `GET /api/agent-runtimes/:id/auth/:method/status?tab=<id>` | manager·owner | Terminal auth status: `running`, `succeeded`, `failed`, or `interrupted`, plus the exit code. Does not record secrets |
| `GET /api/agent-defaults/:id` | manager·owner | Model and permission defaults saved per runtime |
| `PUT /api/agent-defaults/:id` | manager·owner | Atomically saves the current model and permissions as defaults for that runtime |
| `GET /api/agent-runtimes/:id/settings` | manager·owner | Runtime settings (executable, additional arguments, env). **Returns env values with only the last 4 characters masked** |
| `PUT /api/agent-runtimes/:id/settings` | manager·owner | Saves by merging — replaces only submitted keys and retains existing values for omitted env keys (because the browser does not know the original secrets) |
| `DELETE /api/agent-runtimes/:id/settings` | manager·owner | Clears user settings for that runtime and restores the registry defaults |

- The **runtime settings popup** (the gear icon in the list) saves installation, removal, login, logout, executable paths, additional arguments, and provider env settings
  (secrets such as `ANTHROPIC_API_KEY` and `PRIME_API_KEY`, custom endpoints) per runtime. Values are retained in `<DATA_DIR>/agent-settings.json`, and
  `resolvedSpec` overlays them on the registry spec to apply immediately to **all spawn paths** (the agent panel, scheduled tasks, and installation detection). Secrets
  stay only on the server; the UI sees only `****끝4자`—to change one, enter the entire new value.
  Login opens a new tab for that runtime and continues through the existing ACP authentication flow. Removal and logout execute
  only fixed registry commands after confirmation. For runtimes without a safe uninstall/logout contract, such as provider
  installation scripts, the UI shows the reason and does not delete arbitrary files or credential stores.
- **The model list uses exactly what the CLI advertises.** An adapter's bundled CLI is pinned to a version, so its list becomes outdated;
  if a system `claude` is available on PATH, it is used automatically (passed through `CLAUDE_CODE_EXECUTABLE`, respecting any existing setting). If no system installation exists,
  it falls back to the bundled CLI. The model selector for `codex` may be
  empty—if the adapter's built-in core does not recognize new fields in the server's model response, only the list refresh
  fails (with an ERROR log on stderr). Conversations work normally with the default model, and upgrading the adapter restores the list.
- The client capabilities **advertise only `auth.terminal` and `elicitation.url` needed for authentication, and do not advertise `fs`**—enabling `fs` makes the adapter
  disable the CLI's `Read`, `Write`, and `Edit` and replace them with `mcp__acp__*`, causing `Edit` references in the transcript
  to be rejected with API 400 when loading a terminal-created conversation in the panel.
  Keeping tool names aligned with the CLI is the contract ([ADR 0044](decisions/0044-mew-agent-cli-tool-parity.md))—there is no path scope.
- Switching workspaces **shuts down all running sessions** (`disposeAllSessions`)—a child process's cwd is set at startup
  and remains tied to the old folder.
- **Remove `CLAUDECODE` from the child environment.** If it remains, Claude Code treats it as a nested session and refuses to run, causing session
  creation to fail entirely (it is inherited when the mew server is started from a Claude Code terminal).

## Structure

- `server/serve.ts` — production server (5000, single port)
- `server/plugin.ts` — vite dev plugin (4999)
- `server/dataDir.ts` — shared I/O for `.data/` state files (below)
- `server/auth.ts`, `server/authRoutes.ts` — authentication (users, sessions, and login routes)
- `server/reqAuth.ts` — per-request role resolution (`req.auth`) and role-gating middleware
- `server/guestAccess.ts` — per-path view/edit authorization rules for guests
- `server/usersCli.ts` — approval list CLI
- `server/docsRepo.ts` — docs folder import/export; `server/fsBrowse.ts` — folder listing outside the workspace
- Docs-only rules (MOC coverage, archives immutability, and link label synchronization) apply only to the docs project.

### Collaboration rooms (Yjs relay)

- `server/collab.ts` — rooms, clients, awareness, and the `/api/collab` WebSocket. One room = `프로젝트:상대경로`
- `server/syncCodec.ts` — Frame encoding/decoding. **The wire format is the code coupling contract**:
  outer varUint channel (`0` sync · `1` awareness) + varUint type within sync (`0` step1 · `1` step2
  · `2` update) + varUint8Array body. It must match y-protocols byte for byte, and
  `server/syncCodec.test.ts` checks this — a mismatch silently breaks every open tab at deployment time. For untrusted
  bytes, it returns `null` without throwing
- `server/roomDoc.ts` — Two CRDT backends (JS Yjs · Rust yrs). Only three interfaces are required:
  `stateVector()` · `encodeStateAsUpdate(sv?)` · `applyUpdate(update)`. `applyUpdate` returns **the update newly received by the room** (`null`
  if none) — use this value for broadcasting. Computing it from a state vector diff
  makes deletion-only updates appear as empty diffs and disappear
- `server/collabAgent.ts`—disk→room bridge. **It is an in-process client with its own Y.Doc + awareness that attaches through the room's `connect()`**—it does not
  hold onto the room's doc (which would prevent switching backends). A loopback socket is not
  used because that would require opening a bypass around `authorizeCollab` (guest blocking). This is a normal feature that
  injects terminal edits to `.md` into an open Yjs room in real time with an `agent` cursor—it is unrelated
  to the agent panel removed on 2026-07-25, so do not confuse them and delete it. The `appWrites` echo ledger
  protects normal user typing
- Authentication, `MAX_ROOMS`, awareness, and room lifetime remain in JS regardless of the backend. **Only actual connected users** keep a
  room alive — counting the bridge's in-process client would prevent rooms from ever closing, causing headless
  editors and fs watchers to accumulate

The Rust backend is optional and disabled by default ([ADR 0035](decisions/0035-mew-collab-rooms-rust-yrs.md)):

```bash
npm run build:native        # native/collab (cargo, napi-rs) → native/collab/mew-collab.node
MEW_COLLAB_RUST=1 npm run serve
```

`.node` is a platform-specific artifact and is not committed. If `MEW_COLLAB_RUST=1` is set but loading fails, **it throws instead of silently falling back to JS**
— uncertainty about which implementation is running is the greatest risk in the collaboration path.

### Member chat (`.data/chat.json`)

One group chat + 1:1 DMs for each person. Delivery uses **presence signals + REST re-fetching**
without a dedicated socket — the `{type:'chat'}` signal contains no
content (that socket also reaches guests). The model is defined in [ADR 0050](decisions/0050-mew-chat-dm-and-read-receipts.md).

**There is no room identifier. If `to` (the recipient array) is present, it is a DM; otherwise, it is a group room.**
Conversations are calculated from the viewer's perspective (`conversationsOf` in `server/chat.ts`). The UI's `inConversation` uses the same rule, so **both must be changed
together.**

| Request | Action |
| --- | --- |
| `GET /api/chat` | **Only what that person is allowed to see** — `{messages, unread}`. Other people's DMs are excluded from the response. Each message has `unread` (the number of recipients who have not read it yet); the `unread` map gives the number **I** have not read in each conversation |
| `POST /api/chat` `{text, to?}` | Providing `to` makes it a DM. Only existing accounts are accepted as recipients |
| `POST /api/chat/read` `{conversation}` | Records that the conversation has been read. The conversation key is `group` or the other person's email |

- **The read pointer is the timestamp of the conversation's last message at the moment it is read, rather than the current time.** Using
  the current time would bury the next message arriving in the same millisecond as already read. For the same reason, message timestamps
  in the ledger are made **strictly increasing** (`max(now, 마지막+1)`) — these two rules are paired, so do not change them separately
- Read state is broadcast **only when it changes**. Continuously recording it while the window is open causes an infinite broadcast loop
- The 500-line limit is shared by the group chat and DMs

### Server State Files (`.data/`)

User settings, sessions, guest rules, project icons, project layouts, terminal buttons, hidden lists, and scheduled tasks
are stored here. All reads and writes go through `server/dataDir.ts`:

- **Writes use only a temporary file + rename**. Writing directly with `writeFileSync` briefly makes the file 0 bytes, and another process
  reading it at that moment mistakes it for an empty value.
- **Do not return an empty value on read failure.** If the file is missing, return `null`; if it is corrupted, leave a copy (`*.corrupt-*`)
  and throw. Treating an unreadable file as `{}` and overwriting it would erase all remaining settings
  — project icons were actually reset through this path.
- The location can be changed with `MEW_DATA_DIR`. `npm test` sets it to a temporary path so that **tests do not touch
  the actual `.data/`** (tests modify icons and layouts as they create and delete projects).

## Packages (npm workspaces)

Reusable parts are separated into source packages under `packages/*` (no build—vite and node consume the source directly).
Components have no knowledge of fetch paths or authentication; the host app injects server
integration through the `api` prop (app implementation: `src/api/client.ts`).

- `@mew/editor` — TipTap Markdown editor (`Editor`). Includes a frontmatter panel, tables, link/mention tooltips,
  and media uploads. Injects `EditorApi` (fetchFile·uploadAsset·fetchLinkPreview). Also exports
  fuzzy search and frontmatter utilities. **Detect
  `@`·`/` input through `onUpdate`/`onSelectionUpdate` (transaction-based), rather than `keydown`** — keydown space
  triggers fail silently on mobile (`SlashMenu.tsx` is the current implementation).
  - **Line numbers in the left gutter replace drag handles.** Numbers are always visible regardless of hover (`counter`
    in `editor.css`), and the handle element is a **transparent handle** overlaid on the number (click selects the block).
    Block movement starts only **after pressing and holding still for 0.7 seconds**. A drag started
    before that is not promoted to a move and
    is handled as the existing drag/scroll gesture through completion. 3 brightness levels: normal → currently grabbed line (`mew-line--hover`,
    applied by DragHandle's `onNodeChange`) → line containing the cursor (`mew-line--focus`, a decoration from `editor/lineFocus.ts`).
  - The counting unit must match the unit the handle grabs — **each top-level block is one line, and each list item is
    one line**; `ul`/`ol` themselves are not lines. To reverse list indentation (24px per level), CSS `li::before` and JS `listLevel`
    must use **the same value** to keep the handle over the number — do not change only one side.
- `@mew/shortcuts` — Keyboard shortcut bindings.
- `@mew/tmux-term` — Terminal. Provides both a client (`TmuxTerminalPanel`, xterm.js) and a server (`@mew/tmux-term/server`: `createTmuxManager`·`createTmuxRouter`·`attachTmuxWebSocket`,
  cwd parameter). The tools on the right of the button row are **each a single icon** (Scroll to Bottom · Keyboard Lock
  · Selection Mode · Copy)
  so they do not take space from the command buttons on the left on narrow screens. `data-tip`·`aria-label`
  identify them. The host app (App) sends the `경로:줄` reference from Ctrl+L in the editor
  through a `mew:insert-ref` window event, and **only the window whose `detail.target` matches receives and inserts it**
  (see "Ctrl+L References" below). The entire button row is wrapped in `HoverTipLayer`
  (`@mew/ui`), so labels appear **immediately on hover** — any element with `data-tip="이름"` is a target, so
  no per-button wiring is needed (command buttons are included too). Do not set `title` on buttons
  in this row: the browser's native tooltip appears over the label after it opens.
  - **[Scroll to Bottom]** handles all three cases depending on **what owns the scrolled-up position**: ① For
    xterm's own scrollback, `scrollToBottom`. ② For tmux copy-mode (programs that do not use the mouse), WebSocket `exitCopyMode` → the server runs `tmux copy-mode -q` (idempotent; sending
    `q`·Esc to the PTY produces unintended TUI input when not in that mode). ③ **When the app scrolls itself** (a TUI that
    captures the mouse, such as Claude Code) — tmux merely forwarded the wheel events to the app, so ①② do not work. In this case,
    send a burst of SGR wheel-down events so the app scrolls itself to the latest content.
  - **[Keyboard Lock]** (padlock) prevents the mobile soft keyboard from opening — it sets `inputMode='none'` on the
    terminal's helper textarea and bottom input field. Focus remains active, so paste, hardware keyboards,
    and command buttons still work. This is a browser setting rather than a session setting, so it persists in `localStorage: mew:tmux-keyboard-lock`.
- `@mew/mobile-keys` — Mobile keyboard modifier bar (`MobileKeyBar`). Shared by the editor and terminal. The editor bar
  is fixed to the bottom of the screen; **the terminal bar occupies layout space below its own
  input field** so it does not cover the field. The fixed bar uses `z-20` — fullscreen overlays (sidebar·chat·agent·terminal)
  use `z-30`, so it must sit below them.** If both use `z-30`, the editor pane comes after the sidebar in DOM order,
  causing the modifier keys to float above the open sidebar. Passing `onComment` adds a comment icon (phones have
  no Alt+Shift+C) — the host (`EditorPane.startComment`) creates the anchor. Passing `onCodeBlock`·`onTable` adds code block and table icons — only the editor passes them (the terminal
  has no target); the code block action toggles the paragraph at the cursor, and the table action inserts the same
  3×3 table as 'Table' in the slash menu. `onUndo`·`onRedo` are undo and redo icons — they use the same path as the
  Ctrl+Z/Y shortcuts (`runUndoRedoKeepingView`), so the cursor moves to the changed location. In read-only mode, the editor hides all four. The modifier
  bar stays fixed at the very bottom of the screen even for short documents, and sits directly above the
  mobile keyboard when it is open. Swipe switching is not provided.
- `@mew/ui` — Dependency-free shared pieces: `ConfirmDialog` (replaces native confirm so fullscreen stays active), `useToast` (brief notices that
  need no response — a single pill at the bottom of the screen that disappears automatically after 2.6 seconds and intercepts
  nothing because it uses `pointer-events-none`. **Do not register it in the overlay stack** — doing so uses Android Back
  to dismiss the toast), `pathDrag` (see §Sidebar Item Drag and Drop above), `useDragReorder` (reordering within a row
  plus `onDragMove`/`onDrop` notifications for drops **outside** the row — dragging document tabs to split the screen uses this. Items can
  be grabbed only **after a long press** — 0.35 seconds on mobile and 0.5 seconds with a mouse. Dragging
  before that only scrolls the tab row horizontally: touch uses native browser scrolling, while the hook adjusts
  `scrollLeft` for the mouse), `useOverlayDismiss` (below).

### Footnotes (Alt+E)

Insert a marker at the cursor (or **after** selected text) and match its number with the `# References` section at
the bottom of the document. Calculations: `utils/footnotes.ts` (pure functions, tested); application: `editor/footnoteSync.ts` (tiptap extension).

**The stored format is the integration contract:**

- Markers are **literal Unicode subscript characters** — `22만명₁₎`. There are no custom nodes or serializers, so they
  remain readable in other editors, GitHub, and git diff. The matching regular expression is `[₀-₉]+₎`.
- References are an **ordered list** under `# References`. Do not write `1) 내용` in a paragraph — `1)`
  is a CommonMark list marker, so saving and reopening reparses it as a list and misaligns
  the entire section (the round-trip test in `footnoteSync.test.ts` catches this). The onscreen `1)` appearance comes from CSS (`.mew-references`).
- **Position determines the number.** The nth marker ↔ the nth list item. Numbers therefore do not need to be written as text,
  and the list renumbers itself when items are inserted or removed in the middle. We **only insert and remove items**
  — we do not rewrite their content, so links in references survive.
- Matching uses the **old numbers** (`planFootnotes`). New markers are inserted with an unused number (maximum + 1) so
  they do not take over another marker's content; `appendTransaction` assigns the positional numbers.
- **If there are no markers, do nothing** — this safeguard prevents deletion of manually written References. Deleting the last footnote
  leaves the last item behind (preferable to automatically deleting someone else's writing).
- Click a marker to show its numbered content in a popup, and click a reference item to jump to its marker. The popup is
  not added to the overlay stack (for the same reason as link and table tooltips).

### Overlay dismissal rules (`useOverlayDismiss`)

**Whenever you create a popup, modal, or dropdown, you must call `useOverlayDismiss(onClose)`.** Open overlays are collected into one
app-wide stack so Esc and **Android hardware Back** always close *only the most recently
opened one*. Pressing Back over an unregistered popup closes the terminal or sidebar behind it,
or leaves the page, instead of closing that popup.

- For auxiliary panels whose state is owned by App (sidebar·chat·agent·terminal·browser·Android),
  one shared stack in `utils/mobile-panel-stack.ts` owns both foreground order and dismissal order. On mobile, selecting an open panel in the background
  again brings it to the front without closing it; only selecting the foreground panel again closes
  it. `hooks/use-panel-dismissals.ts` also registers only this foreground panel as an overlay, keeping Esc·Back behavior aligned with z-index. Add new auxiliary
  panels to `WORKSPACE_PANEL_IDS` and the open/setter registry in `App.tsx`, and use the shared open/close/toggle/layer functions (type checking prevents
  missing registrations). Modals, popups, and dropdowns register themselves in their own components. On mobile, the browser
  on this device also remembers the **last foreground window** for each root project, so the last
  viewed window among the open windows returns to the front after a refresh or restart.
- On mobile, opening a file from the sidebar, chat, or agent window closes that window and immediately reveals the selected file's editor
  pane. The side-by-side panel layout on desktop is preserved.
- Back handling works by placing one dummy entry (guard) in History. There is only one guard even with stacked overlays, and it is added
  again each time a layer closes. When a layer is closed through the UI, `history.back()` removes the guard to keep the stack aligned.
- Do not attach a separate keydown listener to each overlay — even calling `stopPropagation` in the capture phase leaves other listeners
  attached to the same node (window) running, causing overlapping popups to all close with one Esc press.
- `escapePhase: 'bubble'` is for overlays that **only wrap content**, such as sidebar and terminal panels. If inner content (the
  editor slash menu or file renaming) uses Esc first and calls `stopPropagation`, the panel stays open. The default, `'capture'`, is
  for dialogs — it intercepts the event before the editor or terminal underneath can handle it.
- `closeOnEscape` determines whether to consume Esc. Overlays containing a terminal pass `outsideTerminal`
  (`src/utils/terminalFocus.ts`) to yield Esc to vim and similar programs. This does not affect Back.
- Passing `outside: () => 요소` also **closes the overlay when the user clicks outside that element** (only the topmost one, following the same
  rule as Esc). Touchscreens have no Esc key, so **a popup without a close button offers no way out unless this
  is provided.** The decision uses the `contains()` location rather than propagation — even if inner content calls `stopPropagation`, capture has already
  occurred. Simply omit it for overlays such as the sidebar that must not close on outside clicks.

The editor's mention and slash menus and link/table tooltips are **intentionally not registered.** They
appear and disappear frequently during typing and selection; pushing and popping History each time would hit the browser's
pushState limit. Their Esc handling is performed directly by ProseMirror's `handleKeyDown` in `Editor.tsx`.

### Focus-based tab shortcuts

For `Ctrl+W` (default `closeTab`), App checks the key combination once, then forwards it to the **focused
surface** through `dispatchFocusedShortcut` in `@mew/shortcuts`. Windows that own their own tabs, such as the agent,
browser, and terminal, register only their root ref and `useFocusedShortcutScope(ref, { closeTab })`. This contract means adding a new tabbed window requires
no changes to App's shortcut conditionals.

- Only when there is an actual tab to close does `preventDefault()` handle the action before the browser's `Ctrl+W`. If there is no tab, or it cannot be closed, as with
  the last browser tab, it yields to the browser's default tab-closing behavior and does not spill over to tabs on another surface.
- The document tab closes only when there is no registered window and the focused editor pane has an active document. Closing a terminal tab ends the session,
  so it opens a confirmation dialog just like the existing `×` button.
