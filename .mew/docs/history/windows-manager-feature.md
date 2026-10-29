---
id: mew-windows-manager
status: implemented
title: "Windows installation and management app"
created: 2026-10-07
updated: 2026-10-07
description: "Implementation and operations records for mewnager, discontinued on 2026-10-14. Preserved as historical material, not current installation or support guidance."
files:
  - apps/manager/src/App.tsx
  - apps/manager/src-tauri/src/desktop.rs
  - apps/manager/src-tauri/scripts/windows.ps1
retired: "2026-10-14"
---

> This document records the history of mewnager, retired on 2026-10-14. The app code and CI were deleted; the code from that time remains in Git history. For the current runtime contract, follow [Windows native](../development/windows-native.md); for the retirement decision, see [ADR 0210](decisions/0210-mew-retire-mewnager.md).

`mewnager` (Mewnager), running on Windows, manages WSL/mew installation and operational status in one screen. The executable opens without installation, while the actual server, terminals, and agents run in dedicated WSL 2 Ubuntu. [ADR 0201](decisions/0201-mew-windows-manager-wsl.md) owns the platform, repository, and permission boundaries. Follow the [usage guide](windows-manager-guide.md) and [build and validation guide](windows-manager-development.md).

## Requirements and scope

- Queries actual Windows version, 64-bit architecture, CPU virtualization, WSL, distribution, Node, mew build, runtime, and localhost connectivity status.
- Prepares the default dedicated `Mew` distribution and proceeds through Ubuntu, tools, Node 24, installation and build of official mew main, and first owner creation. If installation is requested again after a reboot or interruption, it resumes from the current state.
- Provides server start, stop, restart, and browser opening; WSL updates; mew update checks and application; and remote desktop component preparation.
- Does not change existing Ubuntu, the WSL default distribution, or global settings. If a different distribution has the same name, it checks path ownership, rejects it, and prompts for a new name.
- Does not provide app auto-updates, automatic startup at Windows login, distribution deletion, native Windows server execution, or external port exposure.
- The initial distribution artifact is a Windows x64 exe. An ARM64 download branch exists, but the ARM64 executable and support on actual hardware require separate validation.

## Screens and behavior

| Menu | Information and controls |
| --- | --- |
| Overview | Windows/WSL → Ubuntu → mew → server readiness, Install/Start/Open buttons appropriate to the current state, access URL, working folder, recent activity |
| Environment and installation | Windows build and virtualization, WSL version and distribution, mew Git commit, branch, and local changes, Node/npm/git/tmux/Python versions, installation repair, WSL update, desktop preparation |
| Updates | Git fetch on an explicit check, current/latest commits and up to 8 change titles, apply when safety conditions are met |
| Task log | Steps and actual output, error filter and copy, up to 600 on-screen entries |
| Settings | Dedicated distribution name, Linux installation/work folders, port, first administrator email, actual data paths, open management folder, light/dark theme |

System operations are allowed only in the executable. The browser displays a preview notice and disabled buttons without fabricating Windows status. Status checks run at startup and every 30 seconds while idle. Automatic checks do not clear query failures or operation errors.

Only one mewnager instance runs in the same user session; launching it again brings the existing window to the front. Operations run one at a time. Saving settings and duplicate clicks are also locked, and closing the window is blocked while an operation is running. Actual stages and output are displayed without fabricated download or build percentages. Status queries may also wake the managed distribution to run probes inside WSL.

### Installation

1. Checks for Windows build 19041 or later, 64-bit architecture, and virtualization. Displays the reason if BIOS/UEFI configuration is required.
2. If WSL is missing, only the fixed Windows preparation commands are elevated through UAC. If `wsl.exe` is missing, optional features are enabled. For an existing executable, supported options are checked with `--help`, and `--web-download` is omitted if unavailable. For older commands without `--no-distribution`, users are directed to update Windows/WSL without a workaround that installs the default Ubuntu. A Windows restart is required after preparation.
3. Records the current boot time in the operation ledger. During the same boot, the restart requirement remains; after a new boot, the current status is queried again.
4. Downloads the official Ubuntu 24.04.5 `.wsl` image specified by the Microsoft WSL distribution list, verifies its pinned SHA-256 hash, and registers it as the original Windows user. The registration storage location is `%LOCALAPPDATA%\Mew\Manager\distros\<이름>`.
5. The distribution's root user is responsible only for preparing apt tools and the `mew` Linux user. Node 24 is installed in that user's dedicated folder using official checksums. App operations run as the `mew` user.
6. Clones the official repository on main and prepares the settings and work folders. Preserves and checks the existing clone's origin and existing settings, then runs `./mew setup` noninteractively.
7. If no account exists, creates the first owner with the email entered in the GUI and delivers a one-time temporary password through a separate event. The screen provides Hide, Show, Copy, and Close controls; the password is not saved in file logs or settings.
8. Checks the PID's command and working directory and the `/api/auth/me` response from Windows `localhost`. Does not identify another website on the same port as a healthy mew instance.

Saves installation settings before the first start. The default installation path is `/home/mew/apps/mew`, the work folder is `/home/mew/workspace`, and the port is 5000. Linux paths are allowed only under `/home/mew/` and may contain only English letters, digits, spaces, hyphens, underscores, and periods. After installation, environment inputs are locked and the actual config path is shown. Successful remote desktop preparation does not mean Windows desktop sharing is available. Because the server's OS screen is WSL, Windows host sharing follows the existing native host path.

### Server and Updates

The server runs with `MEW_BIND=127.0.0.1`. After startup, a fixed WSL keepalive process keeps the distribution running while the verified server PID is alive. The server remains running when the app closes, and the keepalive ends when the server stops or exits. The server does not start automatically after a Windows restart.

Only checking for updates runs `git fetch origin main`. Immediately before applying an update, it rechecks origin, the main branch, a clean working tree, and the absence of local commits ahead of upstream. If these conditions are met, it uses the existing `./mew update` fast-forward, dependency installation, build, and restart process. It does not forcibly discard changes or run stash, reset, or merge. Failure output is preserved, and the operation lock is released to allow another attempt. Even if HEAD becomes current after pull, a failure in a later stage is preserved in the ledger so that **Retry Update** remains available after reopening the app or checking for updates. After success, the previous update comparison results and failure status are cleared.

### Storage and Execution Boundaries

To remain compatible with existing installations, the app identifier `life.liiiiv.mew.manager`, theme key `mew-manager-theme`, Linux Node path, and distribution ownership marker are retained.

Management settings are stored in `%LOCALAPPDATA%\Mew\Manager\settings.json`, the restart/operation ledger in `last-operation.json`, and stages and output in `events.jsonl`. Logs rotate to one previous file at approximately 2 MB. The initial screen reads the latest 300 lines. Windows control scripts run as temporary files with a UTF-8 BOM and are deleted after execution. Long shell content is not placed within Windows command-line length limits. PowerShell native arguments are explicitly quoted to preserve quotes and spaces in Linux scripts.

Elevated WSL preparation uses a fixed PowerShell wrapper to read actual stdout/stderr as UTF-8 or UTF-16 and pass results through a temporary GUID-named JSON file. The parent logs the original text and, on failure, also displays the signed exit code, its base-16 representation, and the original last error on screen. Temporary results are deleted after success or failure. Log streams and exit codes are separated so preparation output is not swallowed as a function return value. Errors enabling Windows optional features are passed through the same result path.

Rust IPC provides only fixed operations, validated settings, opening localhost, and opening the management folder. There are no APIs for arbitrary commands, remote URLs, or deleting other distributions. If settings are corrupted, operations are rejected and the user is directed to review and save them on the Settings screen. General error and progress logs hide password frames.

## UI Contract

The Operate screen continues using the existing mew IBM Plex Sans KR, Plex Mono, Iconoir, neutral colors, and purple accents. It follows the information density and accessibility principles in the [Shared UI Contract](../development/ui-contracts.md). Body text uses 13px Plex Sans KR; paths, commits, times, and logs use Mono. The light theme uses a light neutral background and white panels; the dark theme uses a dark neutral background and panels one shade lighter. Thin borders separate panels, and purple is used for primary actions, selected menus, and completed preparation stages. `apps/manager/src/style.css` owns the canonical color and state values.

The overview reads in this order: the current status heading and primary Install, Start, or Open action; four preparation stages from Windows/WSL → Ubuntu → mew → local server; server information and controls; and recent activity. Stages display a number or check mark together with detailed text. Environment and Installation, Updates, Operation Logs, and Settings are accessed through menus in the same shell. Body padding is 18px at the top and 24px on the sides; standard panel padding is 14px. Standard buttons default to 36px high, and icon buttons to 32px. Large decorative areas or accumulated padding must not push primary controls out of view.

The default window size is 1160×820, with a minimum of 760×620. Place the server start, stop, and restart controls in Overview where they are visible before scrolling even at the minimum window size. At widths of 960px or less, reduce the sidebar from 208px to 172px and arrange the server and recent activity in one column. In browser previews at 650px or less, move the menu to a top row, switch the preparation steps to two columns, and hide the large brand mark. Wrap long paths and output, and scroll vertically on screens with insufficient height.

The OS theme is the initial selection, and this device's light/dark choice is preserved. Primary buttons use white foregrounds in the light theme and dark foregrounds in the dark theme, maintaining foreground contrast on hover in each theme. Status uses text, icons, and color together. Installation, server, and update controls appear disabled during operations, while menus and access to progress logs remain available. Familiar Refresh, Close, Show Password, Copy, and Restart actions use icon buttons with names and tooltips; primary actions use short text and icons.

Keyboard focus is indicated by a purple 2px outline with a 3px offset. The operation area shows the actual stage name, a spinner, an indeterminate progress bar, and access to logs. Stage names announce changes through `role="status"`, `aria-live="polite"`, and `aria-atomic="true"`; operation output is delivered as a polite live log, errors as alerts, and completion notifications as status. Under `prefers-reduced-motion: reduce`, spinning and progress animations and state transitions are removed while a static progress indicator remains.

## Implementation and verification

`apps/manager` has independent npm/Cargo lockfiles and its own dist/target. The main mew app build does not require Rust. The Windows native layer uses Tauri 2/Rust, the UI uses React/TypeScript/Vite, and the execution layer uses PowerShell 5.1 and WSL Bash/Python. GUI checks use fixed simulated states and IPC fixtures and do not claim to represent actual Windows environment status.

2026-10-07: Cross-built a Windows x64 GUI PE executable on Linux. Checked Rust arguments, paths, and account frames; the model's restart, conflict, and update decisions; Chromium GUI IPC, progress locking, error preservation, email validation, and one-time passwords; PowerShell syntax, argument quoting, distribution ownership, and restart decisions; and Bash syntax. In an actual js-debug DAP connection, used breakpoints, stacks, and variables to confirm that the installation action is `null` when an existing distribution conflicts, then cleaned up the connection and test processes.

Through Windows host integration, verified actual PowerShell 5.1 checks, WSL status queries, and the final exe's WebView2 startup, native IPC, and installation preparation screen loading. Cleaned up temporary executables, CDP connections, and test app processes. **Full hands-on installation verification that prepares a new distribution has not yet been performed.** The following acceptance conditions must be checked on a separate Windows VM/device: WSL absent → UAC → restart → resume, Ubuntu download and import, non-administrator installation and first login, WebView2 present/absent, localhost forwarding, server persistence and stopping after closing the window, and actual Git update failures/retries. The exe is an unsigned development distribution and may trigger Windows trust warnings.

0.1.1 fixed missing original WSL elevation errors and stage logs and added supported-option checks. In Windows PowerShell 5.1, checked failure result delivery from the generated child wrapper; paths containing Korean, spaces, and quotes; and the parent's separation of logs and exit codes and cleanup of temporary results. Elevation tests mock WSL commands and UAC calls without changing the OS. Checked option selection, variables, and call stacks using actual Windows help queries and PowerShell breakpoints, and fixed asynchronous read task objects being mixed into return values. This did not confirm the cause of the failure on an actual friend's PC or a successful first installation.
