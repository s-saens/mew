---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew Home tab: a workspace-scoped screen (widgets, to-dos, calendar) and runtime workspace switching. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0042 — mew Home tab: a workspace-scoped screen (widgets, to-dos, calendar) and runtime workspace switching"
created: 2026-08-10
updated: 2026-09-11
---

- Date: 2026-08-10
- Status: Adopted
- Subsequent decision: [0056](0056-mew-user-owned-home-todos.md) — To-do ledger based on file markers
- Subsequent decision: [0081](0081-mew-root-project-tabs-and-git-subprojects.md) — Fixed Home tab and workspace switching entry point
- Decision maker: Song Sanghoon (directive)

## Background

Every screen in mew views a single project. The tree, search, tabs, terminal, and agent are all tied to the active project;
although ADR 0041 made docs a special repo, it is still "a screen that opens one folder."

But some work spans the entire workspace — how many tasks remain in each repo, or what is due this week. There is no
place for this on a project screen. Also, switching the workspace itself currently requires editing the configuration file
with `./mew setup` and restarting the process — effectively impossible when connecting from a phone (remote development).

## Decision

Place a Home tab at the far left of the tab row (before the docs tab). Home is a workspace-scoped screen rather than a project, and this
is where the workspace itself is switched.

### 1. Assemble the home screen from a widget registry

- The screen is configured through a single static registry in `src/components/home/widgets.tsx` — each widget is `{ id, title, render(ctx) }`
- Users' enabled/disabled settings and ordering stay in the browser (localStorage `mew:home-widgets`). The server has no knowledge of them
- Do not build a plugin runtime (code injection or remote widget loading). A registry plus saved layouts provides the full experience of adding,
  removing, and arranging widgets, while code injection expands owner privileges to shell-level access and carries a different cost.
  To add widgets, add entries to the registry

### 2. The task ledger is the markers in the files themselves

- Scan the entire workspace for `[TODO:라벨]` and `[DONE:라벨]` markers (`server/todos.ts`). One item = project, path, line number, label,
  completion status, and due date
- Put the due date inside the marker — `[TODO:라벨 @2026-08-20]`. Do not keep a separate store: the ledger stays current even when files move
  or line numbers shift. The markers are the ledger
- Checking an item makes the server change the marker in that file to `DONE` and write it back. Do not call `noteAppWrite` when writing it back — it must be
  treated as an external change to be injected directly into open collaboration rooms (disk-to-room bridge, ADR 0035)
- Find the marker to edit by label, not line number. If the list is stale, fail instead of silently editing the wrong
  line (the client fetches the list again)
- Treat backtick-wrapped markers (`` `[TODO:…]` ``) as format examples and skip them — so documentation does not populate its own list
- The calendar widget places only items with due dates in date cells. Compare all dates as `YYYY-MM-DD` strings
- The scan skips directories starting with a dot and build output folders (`build`, `.dart_tool`, `target`, etc.). Without these exclusions, it took
  4 seconds on the actual workspace (0.1 seconds with exclusions)
- `GET/POST /api/todos` is restricted to logged-in users (guests blocked) — the response includes file paths from all projects

### 3. Switching workspaces does not restart the process

- Right-clicking the Home tab (long-pressing on mobile) opens a folder browser (owner only). It is a component populated
  with server-provided listings, not a native dialog (`GET /api/fs/dirs`, the same channel as ADR 0041)
- The selected folder's subfolder list is the project list. Show it as-is on the confirmation screen and obtain approval
- `POST /api/workspace` (owner only) replaces `WORKSPACE_ROOT`, `MEW_DIR`, and `DOCS_ROOT` in `paths.ts`. These three values use `let` rather than `const` — as ESM
  live bindings, they automatically point all code that resolves paths per request to the new folder
- Explicitly shut down anything tied to the old folder: tree watchers (`resetTreeWatchers`) and all open collaboration rooms (`closeAllRooms`). Room keys contain only `프로젝트:경로`, so leaving
  them open would let rooms holding old content overwrite files with the same names in the new workspace
- Send `{type:'workspace'}` to all clients through presence so they reload the page. Discard the remembered active project
  (`mew:project`) — it is a folder name from another workspace
- Update `MEW_WORKSPACE` in the configuration file (`~/.config/mew/config.env`) so the change persists across runs. Since later configuration files
  (the repo's `.env`) override earlier ones, remove any remaining `MEW_WORKSPACE` there
- The only places live bindings do not reach are those that copied paths during module initialization. Currently, the tmux manager's `cwd`
  is the only one, and it is updated during switching as well (`tmuxManager.cwd`). Do not introduce more code like this

## Rationale

- Inserting workspace-scoped information into a project screen blurs the meaning of "the folder currently being viewed." Adding another
  tab preserves the screen scope rules
- Putting tasks in a separate DB separates them from the code. Using the markers themselves as the ledger keeps the truth in the files,
  whether switching branches or moving files; mew only displays and writes them back
- Requiring a restart to switch makes it unusable remotely (from a phone). Switching through live bindings requires little code (three paths + three cleanup lines), and
  only one place cannot follow automatically (tmux cwd), so the cost is low

## Results

- Existing tmux sessions stay in the old folder (the tmux server retains it). New sessions open in the new folder — state this
  on the switch confirmation screen
- Each workspace gets its own `.mew/docs` (an empty folder if absent) — switching workspaces also switches docs. This directly
  follows ADR 0041's rule that "there is only one docs per workspace"
- The old workspace's tab state (`mew:tabs:*`) remains in the browser, but it is harmless because tabs do not open if no project with that name exists
