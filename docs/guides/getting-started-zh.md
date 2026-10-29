---
title: "Getting started with mew"
updated: "2026-10-28"
description: "Installation, first sign-in, remote access, updates, and data retention for Mew. The legacy locale filename is retained for existing links."
---

[Current installation guide](getting-started-en.md) · [Documentation](../README.md)

> This guide is maintained in English. Its original filename is retained for existing links. Use the [current installation guide](getting-started-en.md) for new references.

# Getting started with mew



mew lets you open folders on a computer or server in a browser. You can edit Markdown and code, run terminals and AI agents, review Git changes, and collaborate on documents; you can also use it on your phone.

<a id="quick-start"></a>

[First steps](#first-steps) · [Remote access](#remote-access) · [Running and updating](#running-and-updating) · [Documentation](#documentation)

## Quick start

[Windows (WSL 2)](#windows-wsl-2) · [macOS](#macos) · [Linux](#linux) · [Remote access](#remote-access)

<a id="windows-wsl-2"></a>

### Windows（WSL 2）

Run mew in Ubuntu on WSL 2, then open it in a Windows browser.

**1. Install WSL and Ubuntu.** Open PowerShell as an administrator and run:

```powershell
wsl --install -d Ubuntu
```

Restart Windows, open **Ubuntu** from the Start menu, and create a Linux username and password. These are separate from your Windows login account. This command requires Windows 11 or Windows 10 version 2004 (build 19041) or later. If installation fails, see [Microsoft's WSL installation guide](https://learn.microsoft.com/en-us/windows/wsl/install).

If Ubuntu is already installed, check its status with `wsl -l -v` in PowerShell. If the version is `1`, run `wsl --set-version Ubuntu 2` using the distribution name shown in the list.

**2. Install mew.** Run in **Ubuntu**:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates build-essential python3 tmux
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/s-saens/mew.git
cd mew
./mew setup
```

If prompted, accept the option to install Node through nvm. Keep repositories and projects in the Linux filesystem, such as `~/apps` and `~/mew-workspace`, for better Linux tool performance. Use `explorer.exe .` to open the current folder in Windows File Explorer. See [Microsoft's WSL file storage guidance](https://learn.microsoft.com/en-us/windows/wsl/setup/environment#file-storage).

**3. Sign in.** Follow [Finish setup](#finish-setup) below, then open the URL displayed in the terminal in Edge, Chrome, or another Windows browser. It is usually `http://localhost:5000`; [WSL forwards localhost access from Windows](https://learn.microsoft.com/en-us/windows/wsl/networking#accessing-linux-networking-apps-from-windows-localhost).

<a id="macos"></a>

### macOS

**1. Install Apple's command line tools.** Open a terminal and run:

```bash
xcode-select --install
```

Wait for the installation window to finish. If the tools are already installed, continue.

**2. Install Homebrew and the required tools.** If `brew` is not installed, run the command provided by [Homebrew](https://brew.sh/):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the installer's **Next steps** to add Homebrew to your shell, then run:

```bash
brew install tmux python
```

**3. Install mew.** Run in the same terminal window:

```bash
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/s-saens/mew.git
cd mew
./mew setup
```

If prompted, accept the option to install Node through nvm. Follow [Finish setup](#finish-setup) below, then open the URL shown in the terminal in your browser.

Setup also prepares the remote desktop helper. On the Mac running mew, grant Electron **Accessibility** and **Screen Recording** permissions when System Settings opens. Setup continues once these permissions are detected. See [Prepare Mac permissions](../guides/remote-desktop.md#mac-permission-setup) for details.

<a id="linux"></a>

### Linux

On Debian or Ubuntu:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates build-essential python3 tmux
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/s-saens/mew.git
cd mew
./mew setup
```

On other distributions, install equivalent packages first. Then follow [Finish setup](#finish-setup) above. If the server needs to start at boot or accept remote connections, use the [deployment guide](../deployment/native.md).

<a id="finish-setup"></a>

### Finish setup

The installer asks for:

- **Workspace folder:** The parent directory for projects. The default is `~/mew-workspace`; each folder inside it becomes a project.
- **Port:** Defaults to `5000`. If the port is already in use, setup selects a nearby available port.
- **Postgres connection:** Optional, for database tables. You can skip it and add it later.
- **Owner email:** The first mew account. Setup displays a temporary password.

Setup installs dependencies, prepares remote desktop components, builds the app, and starts the server. The initial download may take a few minutes. A remote desktop preparation failure appears as a warning and does not block the rest of the installation.

Open the URL shown by setup, log in, and change the temporary password. Use **+** in the header to open a project folder, then select a file from the file explorer.

After a restart, open Ubuntu or a terminal and start mew from the installation directory:

```bash
cd ~/apps/mew
./mew start
```

### Run with one command (after the first release)

After installing Node.js 24, run the following command in your working folder to download the prebuilt app. **The implementation is ready, but the first npm package and GitHub runtime package have not yet been published.**

```bash
cd /path/to/workspace
npx @liiiiv/mew-cli@latest
```

Supports x64/arm64 on Linux with glibc 2.35 or later and macOS 15 or later. On Windows, run in Ubuntu 22.04 or later on WSL 2. On first use, enter the owner email, log in with the temporary password shown in the terminal, and change the password. Existing accounts, sessions, and device registrations are preserved. Follow [Remote access](#remote-access) to register with Mewlink; the terminal also displays the registration link and a QR code for the online address.

Press Ctrl+C to stop, then run the same command again to use the latest published version. If an old clone uses `.data/`, stop the old server first, then pass `--data-dir /path/to/old/mew/.data`. Remote desktop still requires optional components and operating system permissions. [Runtime and data contracts](../../.mew/docs/development/cli-distribution.md) · [Release steps](../../.mew/docs/operations/cli-release.md)

<a id="remote-access"></a>

### Remote access

Use Mewlink to connect from another browser, or choose Tailscale or Cloudflare Tunnel. Keep the host awake, mew running, and the network connected. When using a proxy, keep `MEW_BIND=127.0.0.1` and replace `5000` with the port selected during installation.

#### 1. Mewlink

1. Log in to local mew as the owner and change the temporary password, then open **Menu → Mewlink → Remote access → Register device**.
2. Open the registration URL, log in to Mewlink, and set a username and device name.
3. Confirm the online status and copy the `https://mew.saens.kr/<用户名>/<设备名>` connection address.
4. Open that address on another device to connect and display the host's mew login page without logging in to Mewlink. Log in with **that computer's local mew email and password**. The connecting device does not need to be registered; if the saved local session is still valid, it can be reused next time.

Mewlink login is only used to register, list, and delete devices. To give others access, create their local mew accounts and configure roles, features, and file permissions. They do not need a Mewlink account to log in with a local password. Access to work data is prohibited until local login succeeds.

The host must remain running and connected to the network; networks that block direct connections display a connection error. This mode does not support Android iframes. Run `./mew remote-access account` to view the registration instructions again. Operators should see [Central service configuration](../../.mew/docs/operations/remote-central.md). Applying this change requires updating local mew and redeploying Mewlink; verification over the actual public internet will be performed separately.

For passwordless access, visitors can select **Log in with Mewlink → Request access** on the device login page. The owner approves the identity under **Account management → Mewlink account access** and links it to an existing local user or creates a new user (with the member role by default). Local mew manages permissions, and unlinking revokes access. Registering an account or having the same email address does not automatically grant access. This flow requires updating local mew and redeploying Mewlink; see the [remote access contract](../../.mew/docs/development/remote-access.md#verification-and-remaining-gates) for login providers and the scope of public internet verification.

#### 2. Tailscale

For your own devices. No domain purchase is required, and access is limited to the private Tailscale network (tailnet).

1. [Install Tailscale](https://tailscale.com/download) on the mew host and every device that needs to connect. Sign all devices in to the same tailnet.

2. Run on the mew host:

   ```bash
   tailscale serve --bg http://127.0.0.1:5000
   ```

   If prompted, open the displayed link to enable HTTPS. On Linux, use `sudo` if the command reports a permission error. For WSL 2, first confirm that `http://localhost:5000` opens in a Windows browser, then install Tailscale on **Windows** and run this command in **PowerShell**.

3. After connecting your phone or another computer to Tailscale, open the displayed `https://<machine>.<tailnet>.ts.net` URL and log in to mew.

See the official [Tailscale Serve guide](https://tailscale.com/docs/features/tailscale-serve) and [command reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

#### 3. Cloudflare Tunnel

Use this option if you need a stable HTTPS address without installing Tailscale on connecting devices. **This setup requires a domain managed by Cloudflare DNS.**

1. Follow the official [Cloudflare domain registration guide](https://developers.cloudflare.com/registrar/get-started/register-domain/) to buy a domain, or [add an existing domain to Cloudflare](https://developers.cloudflare.com/fundamentals/manage-domains/add-site/), and configure nameservers as instructed.
2. Follow the official [Cloudflare Tunnel setup guide](https://developers.cloudflare.com/tunnel/get-started/) to create a tunnel, then install and run `cloudflared` on the mew host. For WSL 2, run `cloudflared` in the same Ubuntu environment as mew.
3. Add a **Published application** route with a hostname such as `mew.example.com` and a service URL of `http://127.0.0.1:5000`. Leave the path empty so mew is served at `/`.
4. Keep `cloudflared` running, then open `https://mew.example.com` from another device and log in to mew.

This creates a public HTTPS entry point; mew's account permissions still apply. For proxy requirements and connection checks, see [Security](../operations/security.md) and the [deployment guide](../deployment/native.md#2-connect-an-https-proxy-or-tunnel).

## System requirements and permissions

The server runs on Linux or macOS; Windows uses WSL 2. It requires Node 22.18+ or 24+, with Node 24 recommended. The terminal uses tmux and a locally compiled `node-pty`, so setup requires Python and a C/C++ toolchain. Docker is optional and used only for Postgres; running the mew app in a container is currently unsupported.

Use mew only with people you trust. By default, `manager` and `owner` accounts can run terminals and agents with the server user's operating system permissions. Granting these features to other accounts grants the same access. Read [Security](../operations/security.md) before providing an instance to others.

<a id="first-steps"></a>

## Using mew

Open the address shown by the installer, log in as the owner, and change the temporary password.

1. Use **+** in the header to open a working folder.
2. Select a Markdown or code file from the list on the left.
3. Open a terminal, agent, or Git from the dock as needed.

[Interface screenshots](overview.md) · [First steps guide](first-steps.md) · [User guide](MOC.md).

<a id="projects-files-and-search"></a>

### Projects, files, and search

Use **+** in the header to open a folder, then select a file on the left. `Ctrl+P` searches filenames, and `Ctrl+Shift+F` searches file contents.

[Projects, files, and tasks](projects.md) · [Search and replace](../configuration/search.md) · [Project setup](project-setup.md).

<a id="writing-code-and-media"></a>

### Writing, code, and media

Use **Hotview** to edit rendered Markdown and **Plain** to view the source text. Content is saved automatically. Open code, tables, attachments, PDFs, and media from the file list.

[Editing, saving, and file history](editor.md).

<a id="git"></a>

### Git

Open **Git** from the dock to view changed files and commit history. Open a file to inspect its diff, then select the files to commit.

[Git panel](projects.md#git-operations-panel).

<a id="collaboration-and-sharing"></a>

### Collaboration and sharing

Supports collaborative editing, comments, mentions, and chat. Access for other accounts and guests is controlled by roles, features, and file permissions.

[Collaboration and sharing](collaboration.md) · [Security](../operations/security.md).

<a id="terminals-agents-and-automation"></a>

### Terminals, agents, and automation

Open a terminal or agent from the dock. Install and authenticate the AI runtime first. See the respective guides for conversations, command buttons, and scheduled tasks.

[Terminals and agents](terminal-agents.md) · [Runtime setup](../configuration/agent-runtimes.md) · [Commands and scheduled tasks](commands.md).

<a id="browser-android-and-remote-desktop"></a>

### Browser, Android, and remote desktop

Use the server browser to open web pages. Android and remote desktop require separate environment preparation, component installation, and operating system permissions; check the scope of support first.

[Browser and Android](browser.md) · [Remote desktop](remote-desktop.md).

<a id="databases"></a>

### Database

After configuring Postgres, use `/db` to insert database tables into documents. This is a separate feature from Markdown tables; editing documents and code does not require a database.

[Database tables](database.md).

<a id="layout-settings-and-accounts"></a>

### Layout, settings, and accounts

Use the dock to open panels and drag tabs to adjust the layout. On phones, use the bottom dock to switch. **Settings** controls the theme, language, fonts, shortcuts, Mewpet, and accounts.

[Split views and mobile interface](editor.md) · [Environment and accounts](../configuration/MOC.md).

<a id="running-and-updating"></a>

## Running and updating

Run the following commands in the mew repository. On Windows, use the Ubuntu terminal.

```bash
./mew start                    # 启动服务器
./mew stop                     # 停止服务器
./mew restart                  # 重启服务器
./mew status                   # 显示状态和路径
./mew logs                     # 跟踪服务器日志
./mew update                   # 拉取 origin/main、安装、构建并重启
./mew desktop-setup            # 准备桌面助手，不重启 mew
./mew users add you@example.com owner
```

`./mew update` pulls using fast-forward. Installations started with `./mew start` can also check for and install updates from the app menu. For servers managed by systemd or another supervisor, follow the separate [deployment and update procedure](../deployment/native.md).

Settings and runtime data are stored outside the clone directory by default:

| Content | Location |
| --- | --- |
| Configuration | `~/.config/mew/config.env` |
| Accounts, sessions, and completed agent turns | `~/.local/share/mew/` |
| Logs | `~/.local/state/mew/` |

Deleting the clone directory does not delete these files. Back them up along with your workspace and all Postgres data. For configuration overrides, see [Server settings](../configuration/environment.md#server-settings).

To connect from a phone or another computer, follow [Remote access](#remote-access). By default, the server binds to the local host. A personal `./mew start` installation does not register an automatic startup service.

If remote desktop preparation fails during setup, retry with `./mew desktop-setup`. It installs the helper and handles Mac permission setup without building the app or restarting the server. A logged-in desktop, the relevant operating system libraries, and permissions are still required; see [Operating system requirements](../guides/remote-desktop.md#first-connection).

On macOS, mew restores missing execute permissions on `node-pty` 1.1.0's `spawn-helper` before opening a terminal. If the terminal remains blank, check the server logs for `[mew:tmux]` errors.

<a id="documentation"></a>

## Documentation

Start with the [documentation map](../../.mew/docs/MOC.md). Detailed product specifications, usage instructions, operating procedures, and work records are in `docs/`; this guide covers setup and everyday use. Update the relevant documentation whenever code changes.

| Topic | Start here |
| --- | --- |
| Projects, editing, terminals, browsers, commands, and databases | [User guide](../guides/MOC.md) |
| Environment variables, accounts, search, and agent runtimes | [Configuration](../configuration/MOC.md) |
| HTTPS, systemd, updates, and backups | [Deployment](../deployment/native.md) |
| Code structure, packages, interfaces, collaboration, and agent protocols | [Development documentation](../../.mew/docs/development/MOC.md) |
| Product specifications, operations, current work, and history | [Documentation map](../../.mew/docs/MOC.md) |
| Features and file permissions by account | [Account settings](../configuration/accounts.md#my-account-and-account-management) · [Access control](../../.mew/docs/development/access-control.md) |
| Roles, authentication, and guest access | [Security](../operations/security.md) |

On Linux, `sh native/agent-memory/install.sh` installs memory limits for agent work. For enabling them, checking them, pausing tasks when memory is low, preserving queues, and reporting errors, see [Agent memory protection](../operations/agent-memory.md).
