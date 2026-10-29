---
title: "Windows Management App Guide"
created: 2026-10-07
updated: 2026-10-11
description: "Implementation and operations records for mewnager, discontinued on 2026-10-14. Preserved as historical material, not current installation or support guidance."
retired: "2026-10-14"
---

> This document records the history of mewnager, retired on 2026-10-14. The app code and CI were deleted; the code from that time remains in Git history. For the current runtime contract, follow [Windows native](../development/windows-native.md); for the retirement decision, see [ADR 0210](decisions/0210-mew-retire-mewnager.md).

Run `mewnager` to check Windows, WSL, and mew status and manage installation and server execution. It is currently an x64 development executable; execution and WSL status queries have been verified on actual Windows, but full installation verification for a new distribution and code signing are not yet complete. The [feature document](windows-manager-feature.md) owns the implementation and support scope.

## First Launch

Requires a 64-bit environment running Windows 10 build 19041 or later or Windows 11, CPU virtualization, an internet connection, and [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/en-us/microsoft-edge/webview2/). Windows 11 usually includes WebView2. The management app exe itself runs without separate installation. WSL, Ubuntu, and mew are installed on the PC, and their data remains separately.

1. Open the executable as a standard user. Enter the first administrator email in **Settings**. The default dedicated distribution name is `Mew`. If an existing environment has the same name, choose another name.
2. Click **Save and Install**. If WSL preparation is required, approve the Windows permission prompt. If BIOS/UEFI virtualization is disabled, enable it first.
3. If **Restart Required** appears, restart Windows, open the same exe, and click **Start Installation**. It checks the status again and continues. The app does not automatically restart the PC.
4. Check download, Linux tool, and mew build stages in **Operation Logs**. If installation fails, review the logs and current status, then request installation again.
5. When ready, check the email and temporary password in **First Login Information** and connect through **Open mew**. Change the password at first login. The temporary password is not permanently stored in the management app.

The default work folder is `/home/mew/workspace`. Place projects to use in mew under this folder. You can open it in Windows Explorer at `\\wsl.localhost\Mew\home\mew\workspace` (use the distribution's name if you changed it). Existing Ubuntu installations are not automatically modified, and projects are not moved.

## Running and Updating

- Use Start, Stop, and Restart in **Overview** to control the server. A running server remains running when the app closes. After restarting Windows, start it again from the app.
- In **Environment and Installation**, check WSL and installation tool versions, actual data locations, and installation recovery.
- **Updates → Check** checks for new commits on GitHub main. **Apply Update** is available only when the working tree is clean and local commits are not ahead. Review failure output in **Operation Logs** and click **Retry Update**. Retrying a failed build remains available after reopening the app.
- Replace mewnager itself with a new exe. mew data and WSL are retained. If an operation is in progress, close the window after it finishes.

The Prepare Remote Desktop button prepares supporting components for the WSL server. It is not a button for sharing the Windows desktop. For Windows screen sharing, follow the [Remote Desktop Guide](../../../docs/guides/remote-desktop.md).

## When WSL Preparation Fails

0.1.1 and later display the WSL preparation command and actual original error text in **Operation Logs**. If a 0.1.0 executable shows only `종료 코드 -1`, replace it with a new exe and check again. This number alone cannot identify whether the cause is virtualization, downloading, or Windows components.

In PowerShell, review the results of the read-only commands below together with the operation logs immediately before the error.

```powershell
Get-CimInstance Win32_OperatingSystem | Select-Object Caption, BuildNumber
wsl --status
wsl --help
```

If an older WSL lacks `--web-download`, the app omits that option. If it lacks `--no-distribution`, update Windows or prepare the latest WSL according to the [Microsoft WSL installation guide](https://learn.microsoft.com/en-us/windows/wsl/install), then reopen the app. The app does not automatically work around this by installing the default Ubuntu.

If WSL freezes or connections repeatedly drop after installation, see [WSL Troubleshooting](../../../docs/guides/troubleshooting.md). WSLg GUI crashes are treated as a separate issue from mew, with instructions for disabling the GUI and having the user restart.

## Files and Recovery

| Item | Default location |
| --- | --- |
| Management app settings, ledger, logs, and distributions | `%LOCALAPPDATA%\Mew\Manager` |
| App source | `/home/mew/apps/mew` |
| Projects | `/home/mew/workspace` |
| Server settings | `/home/mew/.config/mew/config.env` |
| Accounts and sessions | `/home/mew/.local/share/mew` |
| Server logs | `/home/mew/.local/state/mew/mew.log` |

**Open Management Folder** in the GUI opens the Windows settings and operation logs. You can view server output with the command below in Windows PowerShell. Replace `Mew` if you changed the default distribution name.

```powershell
wsl -d Mew -u mew -- tail -n 80 /home/mew/.local/state/mew/mew.log
```

If you lose the initial temporary password, use the mew CLI's user password reset without deleting the existing account. Follow the commands in [Account Management](../../../docs/guides/getting-started-ko.md). If you cannot connect, check the server logs and WSL network, then click **Restart**. Firewall and portproxy settings for external access are not configured automatically.

Deleting only the exe leaves projects and accounts intact. Deleting `distros` or the WSL distribution may also delete the projects and accounts inside, so do not delete them without backing up the data. Production backups follow the distinction between data, settings, and work products in [Native Deployment](../../../docs/deployment/native.md).

Development, exe generation, and CI artifacts are documented in the [build document](windows-manager-development.md).
