---
title: "Command Buttons and Scheduled Tasks"
description: "Covers command buttons in the top bar and project sidebar, running commands in other projects while keeping the current view, opening with Alt+R, selecting by number, reordering with handles, and full-row running status. Also covers adding and stopping commands, opening port apps, terminal input, recurring agent schedules, and the option to close the terminal after completion."
updated: "2026-10-28"
상위파일:
  - "../../.mew/docs/MOC.md"
  - "MOC.md"
---
Use this guide to turn frequently run commands into buttons or schedule recurring agent tasks. First open the project you will work in and check the required feature permissions, such as terminals and scheduled tasks. Agent tasks also require [runtime installation and authentication](../configuration/agent-runtimes.md).

| What you want to do | Feature to use |
| --- | --- |
| Run builds, development servers, and other commands in a specific project | **▶ Command Button** in the top bar or project sidebar |
| Type a frequently used string into the shell you are currently viewing | Terminal **Command Buttons** |
| Run a new agent task at a specified time or interval | Menu → **Scheduled Tasks** |
| Send a message once later in the current conversation | [Scheduled Message](../../.mew/docs/features/terminals-agents-automation/agent-scheduled-messages.md) in the agent input bar |

## Command buttons — two types

These have similar names but are separate features. The top bar's ▶ is for **per-project batch execution**; the buttons in the terminal row **type into the session you are currently viewing**.

|  | Top bar project ▶ button | Terminal buttons |
| --- | --- | --- |
| Configuration file | `<프로젝트>/.mew/cmd-button.json` | `.data/term-button.json` (**global** — shared across all projects and tabs) |
| How to edit | Use `＋ 명령 추가` in the UI, long-press (right-click) a row, or edit the file directly | Use `+` in the UI or long-press (right-click) a button |
| Execution location | Dedicated hidden session `mewcmd-<해시>` | Currently open tmux session |
| Executed by | Server (`tmux send-keys`) | Client (types directly into the terminal WebSocket) |

## Top Bar Project ▶ Button (.mew/cmd-button.json)

Click ▶ in the top bar to open a dropdown of the current project's commands. On desktop, if the [project sidebar](projects.md#프로젝트-탭) is open, use ▶ in each project row. Clicking ▶ for another project keeps the current project, document, and layout in place and opens only that project's command list. Commands defined in each project's `.mew/cmd-button.json` run directly in tmux (terminal feature permission required). For a subproject not in the list, open that project first, then use ▶. Project switching follows owner/manager permissions.

Use **Alt+R** to open the current project's command menu (the existing **Ctrl+E** shortcut remains available). If the sidebar is open, it uses ▶ in the current project's row. Focus moves to the first command. Within the menu, press **1–9** to run the command at that displayed position immediately. The numeric keypad is also supported. A running command is rerun just as when clicking its name; use ■ to stop it. Use arrow keys to move between rows and buttons, and Enter to select. Closing with **Esc** returns focus to the ▶ button and keeps the project sidebar open. **Alt+1–9** for switching projects continues to work as before.

As in the project list, a reorder handle is on the left and a number is at the far right. Drag the handle with a mouse or touch, press **↑/↓** on the handle, or press **Shift+↑/↓** on an item to reorder it. The order is saved in the project's command file, and the numbers change with it. Running commands are indicated by the background of the entire item.

1. Under **＋ Add Command**, enter a name and shell command, then save.
2. For a one-time command, enable **Close Terminal After Completion**. Disable it for commands that should keep running, such as development servers.
3. Run a command with ▶ in its row and check its output with the terminal icon. Press ■ to stop it.
4. When a development server opens a port, a port number button appears on the line below the same item. Click the number to open **current Mew URL/port** in a new tab. For example, clicking `5555` at `https://mew.run/saens/windows` opens `https://mew.run/saens/windows/5555`.

Ports refresh approximately every 3 seconds while the menu is open. Only localhost listening ports opened by the command's actual process are shown; a closed port disappears on the next refresh. If there are multiple ports, a button appears for each number, with horizontal scrolling in narrow areas. Clicking a port button does not rerun the command. Opening an app requires port preview permission and an HTTP app. Mewlink also requires a central update and preview domain setup. For detailed conditions, follow [localhost app preview](../../.mew/docs/development/port-preview.md).

File format:

```json
{
  "commands": [
    { "name": "빌드", "command": "npm run build", "oneShot": true },
    { "name": "개발 서버", "command": "npm run dev" }
  ]
}
```

- Clicking ▶ runs the command in a tmux session with **the project folder as its cwd**. The same button always connects to the same session (`mewcmd-<해시>`), so clicking it again reruns the command in that session.
- Root project commands also include the actual folder path in the session identifier, so commands with the same name in different projects run separately. Root commands started before this change are not automatically terminated, and their running status may not appear in the new menu. Check their output or terminate them in the existing terminal. Subdirectory command identifiers remain unchanged.
- **▶ in a running row becomes ■ (Stop)** — clicking it kills only that command's session (`DELETE /api/tmux/sessions/:name`). Running status is determined by the server-provided `running` value, so if the session is killed elsewhere, the button returns to ▶ on the next refresh.
- Command sessions **do not appear in the regular terminal tab list**. View a session with the terminal icon in its row. In the popup, **Terminate** ends the session, while **Close** closes only the popup and keeps it running. Commands saved with `oneShot: true` terminate their sessions immediately after completion; disable this option to keep the session available for checking output.
- **The server always reads the command string to execute from the file** — it does not trust commands in the execution request body. (Editing uses a separate path: saving the entire list with `PUT` makes the next execution read the new file contents.)
- Editing: use `＋ 명령 추가` at the bottom of the dropdown; **long-press or right-click** an existing row to edit or delete it. Saving writes the entire list, overwriting the same file you may have edited manually (it is normalized to `{ "commands": [...] }`, and other top-level keys are not preserved). **Renaming changes the session name hash** — previously started sessions remain alive but are no longer visible through this button.
- Names must be unique within a project (duplicates return 400 because the two commands would share one session).
- Server: `server/cmdButtons.ts` (file parsing, normalization, writing, and session names) + `GET/PUT/POST /api/cmd-buttons*` (owner/manager). Client: `src/components/CommandButtonMenu.tsx` and `SessionTerminalPopup.tsx` (the session popup uses **the same component** as scheduled tasks, passing only a different session name, title, and execution function). The command menu is **portaled to body and displayed with fixed positioning** so the header's overflow does not clip it.

## Terminal buttons (.data/term-button.json)

These appear on the left side of the terminal panel's **shell tab** button row (the same row as the selection mode button). Clicking one sends it to the shell session you are currently viewing through the same path as submitting the bottom input. These shell command buttons are not shown in agent TUI tabs.

```json
{
  "commands": [
    { "name": "상태", "command": "git status", "icon": "i:git-branch" },
    { "name": "변경 요약", "command": "git diff --stat", "icon": "i:git-commit", "iconOnly": true },
    { "name": "현재 폴더", "command": "pwd" }
  ]
}
```

- There is **one global list** — it does not vary by project or terminal tab. The server therefore stores it in `.data/` rather than the project folder (`.data/` is on the `paths.ts` deny list and cannot be opened through the editing API). **The UI is the editing interface**, rather than manual file editing: add with `+`, and long-press a button (right-click on desktop) to edit its name, command, and icon or delete it.
- `icon` uses **the same notation as project icons** — `i:{키}`, emoji, or `svg:{마크업}`. The picker is also the same `IconPicker`, including direct SVG input (validation uses only `normalizeIconValue`).
- With `iconOnly: true`, the button **hides its name and displays only its icon** (configured separately for each button through `이름 숨기고 아이콘만 보이기` in the edit dialog). If there is no icon, this is ignored and the name remains visible to avoid a blank button.
- The server does not execute commands. The client sends them directly through the already-open terminal WebSocket, so the session and cwd always match the screen. The socket itself enforces the owner/manager boundary, so there is no separate gating.
- Server: `server/termButtons.ts` + `GET/PUT /api/term-buttons` (owner/manager, list reads and writes only). Client: `src/components/TermButtonBar.tsx` — `AgentPanel` injects it into `TmuxTerminal` in the tmux terminal tab through the `renderCommandButtons` render prop (the terminal package has no knowledge of this feature's API).

## Scheduled jobs (.data/schedules.json)

1. In the agent panel, create the **agent set** to use for the job and check its installation and login status.
2. Open the header menu → **Scheduled Jobs** → **+ Add Scheduled Job**.
3. Enter the job name, agent set, project, execution schedule, and job instructions. Scheduled times follow the server's cron environment, so also check whether the browser and server use different time zones.
4. After clicking **Save**, open the item's terminal icon and test it first with **Run**. Scheduled jobs can run only while the server computer is on.

If you later edit the agent set, you must save the schedule again to use the updated model and role. To send a message once in the current conversation, use scheduled messages in the input bar instead of this window.

Select the execution schedule, agent set, and project from the app's custom dropdowns. Navigate with the arrow keys and confirm with Enter, or select with a mouse or touch; Esc and Back close only the list. Selections update the editing draft and are saved to the schedule list only when you click **Save**.

Input boxes, selection fields, weekdays, and bottom buttons all use a height of 44px. The job name and instructions use the full width; the agent set and project use 2 columns on desktop and 1 column on mobile. All editing and closing are blocked while saving.

Header menu → **Scheduled Jobs** — register "when / in which folder / with which agent set / with which prompt" to run the agent unattended at that time. owner/manager only (a surface for unattended execution of arbitrary prompts — the same boundary as the shell).

Close the popup with **X** at the upper right or **Close** at the bottom. The close buttons are disabled while saving.

The schedule list prominently displays the execution time to the left of the title. The recurrence, agent set, project, and last run appear below the title. Hourly, every-N-minutes, and manually entered schedules display the execution interval or cron expression instead of a fixed time. Clicking an item expands compactly spaced editing fields.

- Server: `server/schedules.ts` + `server/runAgentJob.ts` + `GET/PUT /api/schedules`, `POST /api/schedules/run` (run now). Client: `src/components/ScheduleModal.tsx`; cron expression ↔ GUI conversion: `src/utils/cron.ts`.
- New schedules select an existing agent set. If no set exists, create one in the agent panel first. `GET/PUT /api/schedules` also returns the available `agentSets` and validates the save request's `agentSetId` against the server's authoritative records. Roles and models sent by the client are not trusted as execution settings.
- The selected set's ID, name, runtime, model, and role are saved as the schedule's `agentSet` snapshot. Set edits take effect **when the schedule is saved again**, and saved schedules remain even if the set is deleted. Legacy runtime-only schedules can still be read, run, and saved, but new schedules or changes to the execution target require selecting a set.
- **The source is** `.data/schedules.json`**; crontab is derived.** Each save removes and rewrites only lines marked with `# mew-job:<id>` — manually written cron lines are left untouched and are also shown read-only in the window.
- **Execution takes place inside a dedicated tmux session for the job.** The cron line does only three things — `tmux new-session -d -s <세션> -c <설정한 폴더>` (let it fail if the session already exists and reuse that session) → `send-keys -l <에이전트 명령>` → `send-keys Enter`. This uses the same structure as command buttons, so the screen remains in the session after unattended execution finishes and can be inspected as is through each row's **terminal icon** (the same `SessionTerminalPopup`).
- The session name is `mewcmd-job-<id 앞 8자>`. It uses the same prefix as command buttons, so it **does not appear in the terminal tab list** (the `isCommandSession` filter), and the popup's \*\*\[Terminate\]\*\* kills that session (`DELETE /api/tmux/sessions/:name`). The popup's **Run** button and `POST /api/schedules/run` use **the exact same session and command** as cron — you can test without waiting for the scheduled time. The run request body accepts only the job `id`.
- **The prompt is not inlined into the shell.** It is written to `.data/schedules/<id>.prompt`, and the command reads that file — avoiding quotes, newlines, and `%`, which cron interprets as a stdin delimiter (command-side `%` is escaped).
- The execution command uses a shared ACP runner rather than agent-specific templates: `node server/runAgentJob.ts --runtime <id> --prompt-file <프롬프트파일> --log-file <로그> --cwd <폴더>`. The runner starts the ACP runtime using the same registry in `server/agentRuntimes.ts` ([ADR 0060](../../.mew/docs/history/decisions/0060-mew-shared-agent-runtime-registry.md)). There is no place for users to enter a command string. At save time, `node` and `tmux` are **resolved to fixed absolute paths** using `command -v` — cron's PATH cannot find them by name alone.
- Schedules with a selected set add `--agent-set-file .data/schedules/<id>.agent-set.json`. The set snapshot file is synchronized on save and removed when the schedule is deleted. The role is not placed in a shell string; the runner checks that the runtime matches, applies the specified model, and then sends the set role, a separator, and the job prompt in the same first turn. If applying the model fails, it does not run with another model. An empty model ID uses the runtime default.
- The 5 cron fields allow only `[A-Za-z0-9*/,-]` (preventing crontab injection). Output appears on the session screen while `runAgentJob.ts` also appends it to `.data/schedules/<id>.log`; that file's mtime is the window's "Last Run." **Logs do not shrink automatically** — delete them manually if they grow large.
- If the next scheduled time arrives while the previous run is still active, **the command is typed directly into the same session** (= it goes into the running agent's stdin). Do not set an interval shorter than the execution time.
- Deleting a job also kills its session when you save — because it is a hidden session that cannot be accessed anywhere in the UI.

## System resources popup

Open it from the header menu → **System Resources**. It refreshes CPU, memory, and GPU usage and temperatures on the server machine, along with **per-process usage**, every 2 seconds. It can be used while a terminal is open.

Close it with the **X** button at the upper right of the title bar. It can be closed while loading or after an error; Esc, Back, and clicking outside the popup are also supported.

- Server: `server/sysStats.ts` + `GET /api/system-stats` (owner/manager — the same boundary as the shell). Client: `src/components/SystemStatsModal.tsx`.
- CPU usage is calculated from the **increase since the previous call** in `os.cpus()` cumulative times. A single module holds the samples, so multiple windows only shorten each window's sampling interval; the values remain valid.
- Available memory uses `MemAvailable` from `/proc/meminfo` — `os.freemem()` counts cache as used memory, consistently overstating usage on Linux.
- GPU data comes from one `nvidia-smi --query-gpu=...` call. If unavailable, the result is an empty array and the popup displays "No GPU information."
- CPU temperature comes from `/sys/class/thermal/thermal_zone*/temp`. \*\*It is not exposed in WSL or containers, so it is `null`\*\*; the popup then explains this in one line (GPU temperature comes separately from `nvidia-smi`, so it also appears in WSL).
- `processes[]` reads `/proc/<pid>/stat` directly — `ps %cpu` is an **average over the process's entire lifetime**, so it cannot show "who is using resources right now." CPU usage is the increase in `utime+stime` ticks since the previous sample, measured relative to one core, so it can exceed 100%. Entries with RSS, CPU, and GPU all at 0 (kernel threads) are omitted from the response. Per-process GPU data is **memory (MB) only**, as provided by `nvidia-smi --query-compute-apps` — that query does not include per-process GPU utilization. Returns an empty array in environments without `/proc` (non-Linux).
- **The client collects trend graph data** — the server has no ring buffer. While the popup is open, it retains the latest 60 samples (2 minutes) and discards them when closed. Individual process graphs are also extracted from this history by pid.
