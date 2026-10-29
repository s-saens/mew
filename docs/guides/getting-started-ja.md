---
title: "Getting started with mew"
updated: "2026-10-28"
description: "Installation, first sign-in, remote access, updates, and data retention for Mew. The legacy locale filename is retained for existing links."
---

[Current installation guide](getting-started-en.md) · [Documentation](../README.md)

> This guide is maintained in English. Its original filename is retained for existing links. Use the [current installation guide](getting-started-en.md) for new references.

# Getting started with mew



mew is an app for opening folders on a computer or server in your browser. You can edit Markdown and code, run terminals and AI agents, review Git changes, and collaborate on documents. You can also use it from a smartphone.

<a id="quick-start"></a>

[First steps](#first-steps) · [Remote access](#remote-access) · [Running and updating](#running-and-updating) · [Documentation](#documentation)

## Quick start

[Windows (WSL 2)](#windows-wsl-2) · [macOS](#macos) · [Linux](#linux) · [Remote access](#remote-access)

<a id="windows-wsl-2"></a>

### Windows（WSL 2）

Run mew inside Ubuntu on WSL 2 and open it in a Windows browser.

**1. Install WSL and Ubuntu.** Open PowerShell as an administrator and run the following.

```powershell
wsl --install -d Ubuntu
```

Restart Windows, open **Ubuntu** from the Start menu, and create a Linux username and password. This is separate from your Windows sign-in account. This command requires Windows 11 or Windows 10 version 2004 (build 19041) or later. If installation fails, consult [Microsoft's WSL installation guide](https://learn.microsoft.com/en-us/windows/wsl/install).

If Ubuntu is already installed, run `wsl -l -v` in PowerShell to check. If the version is `1`, run `wsl --set-version Ubuntu 2` using the distribution name shown in the list.

**2. Install mew.** Run the following in **Ubuntu**.

```bash
sudo apt update
sudo apt install -y git curl ca-certificates build-essential python3 tmux
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/s-saens/mew.git
cd mew
./mew setup
```

If asked whether to install Node with nvm, choose to install it. For faster Linux tools, keep repositories and projects in the Linux filesystem, such as `~/apps` or `~/mew-workspace`. You can open the current folder in Windows File Explorer with `explorer.exe .`. See also [Microsoft's WSL file storage guide](https://learn.microsoft.com/en-us/windows/wsl/setup/environment#file-storage).

**3. Sign in.** Follow [Finish setup](#finish-setup) below, then open the displayed URL in a Windows browser such as Edge or Chrome. It is usually `http://localhost:5000`. [WSL forwards localhost access from Windows](https://learn.microsoft.com/en-us/windows/wsl/networking#accessing-linux-networking-apps-from-windows-localhost).

### macOS

**1. Install Apple's command line tools.** Open a terminal and run the following.

```bash
xcode-select --install
```

Wait for installation to finish. If the tools are already installed, continue to the next step.

**2. Install Homebrew and the required tools.** If `brew` is not installed, run the command from [Homebrew](https://brew.sh/).

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the installer's **Next steps** to add Homebrew to your shell, then run the following.

```bash
brew install tmux python
```

**3. Install mew.** Run the following in the same terminal.

```bash
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/s-saens/mew.git
cd mew
./mew setup
```

If asked whether to install Node with nvm, choose to install it. Follow [Finish setup](#finish-setup) below and open the displayed URL in your browser.

Setup also prepares a remote desktop helper. When System Settings opens on the Mac running mew, grant Electron **Accessibility** and **Screen Recording** permissions. Setup continues once it detects the permissions. See [Prepare Mac permissions](../guides/remote-desktop.md#mac-permission-setup) for details.

### Linux

On Debian or Ubuntu, run the following.

```bash
sudo apt update
sudo apt install -y git curl ca-certificates build-essential python3 tmux
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/s-saens/mew.git
cd mew
./mew setup
```

On other distributions, install equivalent packages first. Follow [Finish setup](#finish-setup) above. To start the server at boot or accept remote connections, use the [deployment guide](../deployment/native.md).

<a id="finish-setup"></a>

### Finish setup

Enter the following during setup.

- **Workspace folder:** The parent folder containing your projects. The default is `~/mew-workspace`, and each folder inside it becomes a project.
- **Port:** The default is `5000`. If it is in use, setup selects a nearby available port.
- **Postgres connection:** An optional setting for database tables. You can skip it and add it later.
- **Owner email address:** The first mew account. Setup displays a temporary password.

Setup installs dependencies, prepares remote desktop components, builds the app, and starts the server. The initial download may take a few minutes. If remote desktop preparation fails, a warning is displayed and the rest of the installation continues.

Open the URL displayed by setup, sign in, and change the temporary password. Use **+** in the header to open a project folder, then select a file in the file explorer.

After restarting, open Ubuntu or a terminal and launch mew from the installation folder.

```bash
cd ~/apps/mew
./mew start
```

### Run with 1 command (after the first release is published)

If you have Node.js 24, run the following in your working folder to download the prebuilt app. **The implementation is ready, but the first npm package and GitHub release have not been published.**

```bash
cd /path/to/workspace
npx @liiiiv/mew-cli@latest
```

Targets x64/arm64 on Linux with glibc 2.35 or later and macOS 15 or later. On Windows, run it on Ubuntu 22.04 or later under WSL 2. On the first run, enter the owner's email address, log in with the displayed temporary password, and change it. Existing accounts, conversations, and device registrations are reused. Register Mewlink using the [Remote access](#remote-access) instructions; the registration link and a QR code for the online connection address also appear in the terminal.

Press Ctrl+C to exit, then run the same command again to use the latest release. If a previous clone uses `.data/`, stop the previous server and specify `--data-dir /path/to/old/mew/.data`. Remote desktop requires optional components and OS permissions to be set up. [Execution and data contract](../../.mew/docs/development/cli-distribution.md) · [Publishing procedure](../../.mew/docs/operations/cli-release.md)

<a id="remote-access"></a>

### Remote access

You can connect from another browser through Mewlink. Tailscale and Cloudflare Tunnel are also options. Keep the host running, with mew and the internet connection active. When using a proxy, keep `MEW_BIND=127.0.0.1` and replace `5000` with your configured port.

#### 1. Mewlink

1. Log in to local mew as owner and change the temporary password. Open **Menu → Mewlink → Remote access → Register device**.
2. Log in to Mewlink at the registration URL and set a username and device name.
3. Check the online status and the connection URL `https://mew.saens.kr/<ユーザー名>/<端末名>`.
4. Opening this URL on another device displays the host's mew login screen without requiring a Mewlink login. Log in with **the email address and password for local mew on that computer**. The connecting device does not need to be registered, and a valid saved session can be reused on subsequent visits.

Mewlink login is used to register, list, and delete devices. Create local mew accounts for other users and configure their roles, features, and file permissions. A Mewlink account is not required when logging in with a local password. Access to work data is denied until local login.

Keep the host running and connected to the internet. An error is displayed on networks that block direct connections. Android iframe is unavailable. Use `./mew remote-access account` to display the registration instructions again. Also see [Central service operations](../../.mew/docs/operations/remote-central.md). Applying this change requires updating local mew and redeploying Mewlink; measurements on external networks will be performed separately.

To connect without a password, visitors select **Log in with Mewlink → Request access** on the device's login screen. The owner approves the request under **Account management → Mewlink account access** and links it to an existing local user or creates a new user (the initial role is member). Permissions are managed locally, and unlinking revokes access. A matching registered account or email address alone does not grant access. This method requires updating local mew and redeploying Mewlink. See the [Connection contract](../../.mew/docs/development/remote-access.md#verification-and-remaining-gates) for the scope of provider login and external network verification.

#### 2. Tailscale

Use this method between your own devices. You do not need to purchase a domain, and access stays within your private Tailscale network (tailnet).

1. Install [Tailscale](https://tailscale.com/download) on the mew host and each connecting device. Sign in to the same tailnet on all devices.

2. Run the following on the mew host.

   ```bash
   tailscale serve --bg http://127.0.0.1:5000
   ```

   If prompted, open the displayed link to enable HTTPS. If you get a permission error on Linux, use `sudo`. On WSL 2, install Tailscale on **Windows**, verify that `http://localhost:5000` opens in a Windows browser, then run this command in **PowerShell**.

3. Connect to Tailscale on your phone or another computer, open the displayed `https://<machine>.<tailnet>.ts.net` URL, and sign in to mew.

See the official [Tailscale Serve guide](https://tailscale.com/docs/features/tailscale-serve) and [command reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

#### 3. Cloudflare Tunnel

This is suitable if you want to use a stable HTTPS address from a browser without installing Tailscale on connecting devices. **This setup requires a domain managed through Cloudflare DNS.**

1. Purchase a domain using the official [Cloudflare domain registration guide](https://developers.cloudflare.com/registrar/get-started/register-domain/), or [add an existing domain to Cloudflare](https://developers.cloudflare.com/fundamentals/manage-domains/add-site/) and follow the nameserver instructions.
2. Follow the official [Cloudflare Tunnel setup guide](https://developers.cloudflare.com/tunnel/get-started/) to create a tunnel, then install and run `cloudflared` on the mew host. On WSL 2, run `cloudflared` in the same Ubuntu environment as mew.
3. Add a **Published application** route with a hostname such as `mew.example.com` and the service URL `http://127.0.0.1:5000`. Leave the path empty to serve mew at `/`.
4. Keep `cloudflared` running, open `https://mew.example.com` from another device, and sign in to mew.

This creates a public HTTPS entry point, but mew account permissions still apply. See [Security](../operations/security.md) and the [Deployment guide](../deployment/native.md#2-connect-an-https-proxy-or-tunnel) for proxy requirements and connection checks.

## System requirements and permissions

The server runs on Linux or macOS; Windows uses WSL 2. Node 22.18 or later, or 24 or later, is required; Node 24 is recommended. The terminal uses tmux and a locally compiled `node-pty`, so setup requires Python and a C/C++ toolchain. Docker is optional for Postgres, but running the mew app itself in a container is currently unsupported.

Use mew only with people you trust. By default, `manager` and `owner` accounts can run terminals and agents with the server user's OS permissions. Granting these features to other accounts gives them the same access. Read [Security](../operations/security.md) before exposing your instance to others.

<a id="first-steps"></a>

## Using mew

Open the displayed address, log in as owner, and change the temporary password.

1. Use **+** in the header to open a working folder.
2. Select Markdown or code from the list on the left.
3. Open the terminal, agents, or Git from the dock as needed.

[Interface overview](overview.md) · [First steps guide](first-steps.md) · [Usage guides](MOC.md).

<a id="projects-files-and-search"></a>

### Projects, files, and search

Use **+** in the header to open a folder, then select a file on the left. `Ctrl+P` searches filenames, and `Ctrl+Shift+F` searches file contents.

[Projects and tasks](projects.md) · [Search and replace](../configuration/search.md) · [Project setup](project-setup.md).

<a id="writing-code-and-media"></a>

### Text, code, and media

Edit Markdown while viewing it in **Hotview**, and inspect the source in **Plain**. Content is saved automatically. Open files to work with code, tables, attachments, PDFs, and media as well.

[Editing, saving, and file history](editor.md).

<a id="git"></a>

### Git

Use **Git** in the dock to review changed files and commit history. Open files to review diffs, then select the files to commit.

[Git panel](projects.md#git-operations-panel).

<a id="collaboration-and-sharing"></a>

### Collaboration and sharing

You can use collaborative editing, comments, mentions, and chat. Access for other accounts and guests follows role, feature, and file permissions.

[Collaboration and sharing](collaboration.md) · [Security](../operations/security.md).

<a id="terminals-agents-and-automation"></a>

### Terminals, agents, and automation

Open terminals and agents from the dock. Install and authenticate AI runtimes first. See the respective guides for conversations, command buttons, and schedules.

[Terminals and agents](terminal-agents.md) · [Runtime configuration](../configuration/agent-runtimes.md) · [Commands and scheduling](commands.md).

<a id="browser-android-and-remote-desktop"></a>

### Browser, Android, and remote desktop

You can open web pages in the server browser. Android and remote desktop require separate environment preparation, installation, and OS permissions. Check the scope of support first.

[Browser and Android](browser.md) · [Remote desktop](remote-desktop.md).

<a id="databases"></a>

### Database

After configuring a Postgres connection, use `/db` to insert a database table into a document. This is separate from Markdown tables. A database is not required to edit documents or code.

[Database tables](database.md).

<a id="layout-settings-and-accounts"></a>

### Layout, settings, and accounts

Open panels from the dock and drag tabs to arrange them. On phones, switch panels using the bottom dock. Configure the theme, language, fonts, shortcuts, Mewpet, and accounts in **Settings**.

[Split views and mobile](editor.md) · [Environment and accounts](../configuration/MOC.md).

<a id="running-and-updating"></a>

## Running and updating

Run the following in the mew repository. On Windows, use the Ubuntu terminal.

```bash
./mew start                    # サーバーを起動する
./mew stop                     # 停止する
./mew restart                  # 再起動する
./mew status                   # 状態とパスを表示する
./mew logs                     # サーバーログを追跡する
./mew update                   # origin/main を取得し、インストール、ビルド、再起動する
./mew desktop-setup            # mew を再起動せずデスクトップヘルパーを準備する
./mew users add you@example.com owner
```

`./mew update` uses a fast-forward pull. For installations started with `./mew start`, you can also check for and install updates from the app menu. For servers managed by a supervisor such as systemd, use the separate [deployment and update procedure](../deployment/native.md).

Configuration and runtime data are stored outside the clone by default.

| Contents | Location |
| --- | --- |
| Configuration | `~/.config/mew/config.env` |
| Accounts, sessions, and completed agent turns | `~/.local/share/mew/` |
| Logs | `~/.local/state/mew/` |

These files remain even if you delete the clone. Back them up along with your workspace and Postgres data. See [Server configuration](../configuration/environment.md#server-settings) for overrides.

To connect from a phone or another computer, follow [Remote access](#remote-access). The server binds to the local host by default. Personal `./mew start` installations do not register an autostart service.

If remote desktop preparation fails during setup, retry with `./mew desktop-setup`. This installs helpers and handles Mac permission settings without building the app or restarting the server. A signed-in desktop and the applicable OS libraries and permissions are still required. See [OS requirements](../guides/remote-desktop.md#first-connection).

On macOS, mew repairs missing execute permissions on `spawn-helper` in `node-pty` 1.1.0 before opening a terminal. If the terminal remains blank, check the server logs for `[mew:tmux]` errors.

<a id="documentation"></a>

## Documentation

Start with the [Documentation map](../../.mew/docs/MOC.md). Detailed product specifications, usage guides, operating procedures, and work records are in `docs/`; this guide covers setup and everyday use. Update the relevant documentation when you change code.

| Topic | Starting point |
| --- | --- |
| Projects, editing, terminals, browser, commands, databases | [User guides](../guides/MOC.md) |
| Environment variables, accounts, search, agent runtimes | [Configuration](../configuration/MOC.md) |
| HTTPS, systemd, updates, backups | [Deployment](../deployment/native.md) |
| Code structure, packages, UI, collaboration, agent protocols | [Development documentation](../../.mew/docs/development/MOC.md) |
| Product specifications, operations, current work, history | [Documentation map](../../.mew/docs/MOC.md) |
| Per-account feature and file permissions | [Account settings](../configuration/accounts.md#my-account-and-account-management) · [Access control](../../.mew/docs/development/access-control.md) |
| Roles, authentication, guest access | [Security](../operations/security.md) |

On Linux, run `sh native/agent-memory/install.sh` to install memory limits for agent work. See [Agent memory protection](../operations/agent-memory.md) for activation, verification, job interruption under low memory, queue holds, and error reporting.
