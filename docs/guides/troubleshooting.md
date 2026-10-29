---
title: "Troubleshooting"
description: "Provides symptom-specific places to check for login, server access, editing, Git, agents, DB, and remote desktop issues, and distinguishes Windows WSL freezes from repeated WSLg crashes for diagnosis, workarounds, and recovery."
created: 2026-10-11
updated: "2026-10-15"
상위파일: "MOC.md"
---

Start by checking the feature showing symptoms. Before restarting the server, check save status and ongoing agent and terminal tasks.

| Symptom | Check First | Detailed Guide |
| --- | --- | --- |
| Address does not open or connection drops | Whether the server computer is on, whether the local address also fails to open, and server status and logs | [Running and Updating](getting-started-ko.md#running-and-updating) |
| Logged into Mewlink but cannot access Mew | Distinguish the Mewlink account used for device registration from the local account on the Mew server you want to access | [External Access](getting-started-ko.md#connect-remotely) |
| Folders, buttons, or files are missing or read-only | Feature permissions, file rules, and visibility settings under **Settings → Dock** | [Accounts and Permissions](../configuration/accounts.md#my-account-and-account-management) |
| Markdown display error | Check the current content with **Open in Source Mode** in the error notice | [Basic Editing](editor.md#basic-editing) |
| Files edited externally revert to earlier content | Check whether a Mew editor with the same file open saved stale content, and close the editor or use **Revert File** | [Execution and Verification Rules](../../.mew/docs/development/getting-started.md) |
| Reports that no Git repository exists | Check whether the current project folder itself is a Git repository. Parent or child repositories are not automatically opened instead | [Git Panel](projects.md#git-operations-panel) |
| Agent fails to open or authentication fails | Installation, login, and model settings for the selected runtime, and panel errors | [Runtime Settings](../configuration/agent-runtimes.md) |
| Reports that the database is not configured | The server's `DATABASE_URL` and whether Postgres is running | [DB Setup](database.md#running-only-postgres-with-docker-compose-optional) |
| Only remote desktop fails to connect | Screen and input permissions on the server OS, the logged-in desktop, and direct UDP connectivity | [Installation and Connection](remote-desktop.md#first-connection) · [Network](remote-desktop.md#network-and-configuration) |

## When WSL Freezes or Disconnects

First distinguish whether Windows is functioning normally, the WSL terminal is also unresponsive, or only the mew connection has dropped. Do not conclude that mew shut down WSL solely because it happened while mew was running. If only mew disconnected, check [Server Status and Logs](getting-started-ko.md#running-and-updating). If all of WSL is unresponsive, also check Windows WSL and VM events.

### Repeated WSLg Crashes

WSLg is a WSL component that displays Linux GUI apps in Windows and is separate from mew. Repeated crashes in `weston` and `rdp-backend.so` are WSLg errors and do not indicate a conflict with mew. These logs alone cannot establish the cause of a full WSL freeze. WSLg is not required for normal operation of the mew server, terminal, or agents used through a browser.

In a WSL terminal such as Ubuntu, check recent GUI crashes and out-of-memory terminations separately.

```bash
journalctl -k -b --no-pager --grep='weston|rdp-backend'
journalctl -k -b -1 --no-pager --grep='oom-kill|Out of memory|Killed process'
tail -n 40 /mnt/wslg/stderr.log
```

Suspect a WSLg issue if `weston` repeatedly terminates and restarts at short intervals with `signal 11` or `segfault`. Similar symptoms in WSLg 1.0.73.2 are reported in [Microsoft WSL issue #41552](https://github.com/microsoft/WSL/issues/41552). If there are out-of-memory records, also check [Agent Memory Protection](../operations/agent-memory.md). These logs may be unavailable if journals from previous boots are not retained or WSLg is disabled.

### Workaround When Not Using Linux GUI Apps

If you do not need Linux GUI apps, disable WSLg and compare whether the same failure recurs. You can continue using mew in a Windows browser, but Linux GUI apps previously displayed through WSLg will become unavailable. This setting **applies to all WSL 2 distributions**.

1. Open the user settings in Windows PowerShell with the following command.

   ```powershell
   notepad "$env:USERPROFILE\.wslconfig"
   ```

2. Back up the existing file and add `guiApplications=false` to the existing `[wsl2]` section. If the same key already exists, change its value. Preserve other settings such as memory, swap, and networking, and do not create a duplicate `[wsl2]` section.

   ```ini
   [wsl2]
   guiApplications=false
   ```

3. After saving work and wrapping up ongoing agent, terminal, Docker, and other tasks, **the user** shuts down WSL from PowerShell. The command below terminates all running WSL distributions.

   ```powershell
   wsl --shutdown
   ```

4. Reopen the distribution you use, such as Ubuntu, and start mew using your existing method. Merely saving the settings file does not immediately terminate the currently running WSLg.

After restarting, check whether the failure recurs under the same conditions. If freezes continue, do not conclude that WSLg is the cause; collect Windows and VM logs following [Microsoft's WSL diagnostic procedure](https://learn.microsoft.com/en-us/windows/wsl/troubleshooting-guide).

To restore GUI support, change the same key to `guiApplications=true` or remove the key you added, then have the user restart WSL. The setting's meaning, scope, and restart requirements follow the [Microsoft WSL configuration documentation](https://learn.microsoft.com/en-us/windows/wsl/wsl-config).
