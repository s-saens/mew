---
updated: "2026-10-28"
title: "Getting started with mew"
description: "Installation, first sign-in, remote access, updates, and data retention for Mew. The legacy locale filename is retained for existing links."
---

[Current installation guide](getting-started-en.md) · [Documentation](../README.md)

> This guide is maintained in English. Its original filename is retained for existing links. Use the [current installation guide](getting-started-en.md) for new references.

# Getting started with mew



mew is a workspace for opening folders on your computer or server in a browser. You can edit Markdown and code, run terminals and AI agents, review Git changes, and collaborate on documents. You can also use it on your phone.

[First use](#using-mew) · [External access](#connect-remotely) · [Running and updating](#running-and-updating) · [Documentation](#documentation)

## Quick start

[Windows (WSL 2)](#windows-wsl-2) · [macOS](#macos) · [Linux](#linux) · [Connecting externally](#connect-remotely)

<a id="windows-wsl-2"></a>

### Windows (WSL 2)

The Windows native execution layer and npx distribution path have been implemented. Check the [Windows native execution contract](../../.mew/docs/development/windows-native.md) for the scope of verification. Until full verification on actual Windows hardware and the first public release, you can use the WSL source installation procedure below.

Run mew inside Ubuntu on WSL 2, then open it in a Windows browser.

**1. Install WSL and Ubuntu.** Open PowerShell as an administrator and run the following.

```powershell
wsl --install -d Ubuntu
```

Restart Windows, then open **Ubuntu** from the Start menu and create a Linux username and password. These are separate from your Windows login account. This command is available on Windows 11 or Windows 10 version 2004 (build 19041) or later. If installation fails, see the [Microsoft WSL installation guide](https://learn.microsoft.com/en-us/windows/wsl/install).

If Ubuntu is already installed, check it with `wsl -l -v` in PowerShell. If the version is `1`, run `wsl --set-version Ubuntu 2` using the distribution name shown in the list.

**2. Install mew.** Run the following command in **Ubuntu**.

```bash
sudo apt update
sudo apt install -y git curl ca-certificates build-essential python3 tmux
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/s-saens/mew.git
cd mew
./mew setup
```

When asked whether to install Node with nvm, choose to install it. For faster Linux tools, keep repositories and projects in the Linux filesystem, such as `~/apps` and `~/mew-workspace`. Run `explorer.exe .` to open the current folder in Windows Explorer. For details, see [Microsoft's WSL file storage guide](https://learn.microsoft.com/en-us/windows/wsl/setup/environment#file-storage).

**3. Sign in.** Follow the instructions in [Finish setup](#finish-installation) below, then open the output URL in a Windows browser such as Edge or Chrome. The address is usually `http://localhost:5000`. [WSL forwards localhost access from Windows](https://learn.microsoft.com/en-us/windows/wsl/networking#accessing-linux-networking-apps-from-windows-localhost).

<a id="macos"></a>

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

Follow the installer's **Next steps** to add Homebrew to your shell, then run the commands below.

```bash
brew install tmux python
```

**3. Install mew.** Run the following in the same terminal window.

```bash
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/s-saens/mew.git
cd mew
./mew setup
```

If asked whether to install Node with nvm, choose to install it. After completing [Finish installation](#finish-installation) below, open the displayed URL in your browser.

The installer also prepares the remote desktop helper. When System Settings opens on the Mac running mew, grant Electron **Accessibility** and **Screen Recording** permissions. Installation continues once you grant permission. See [Prepare Mac permissions](../guides/remote-desktop.md#mac-permission-setup) for details.

<a id="linux"></a>

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

On other distributions, install equivalent packages first. Follow [Finish installation](#finish-installation). To start automatically at boot or accept remote connections, use the [deployment guide](../deployment/native.md).

<a id="finish-setup"></a>

### Finish installation

The installer asks for the following:

- **Workspace folder:** The parent folder for your projects. The default is `~/mew-workspace`, and each folder inside it is used as a project.
- **Port:** The default is `5000`. If it is already in use, the installer selects a nearby available port.
- **Postgres connection:** Optionally connect to database tables. You can skip this and add it later.
- **Owner email:** The first mew account to create. The installer prints a temporary password.

The installer downloads the required packages, prepares the remote desktop components, builds the app, and starts the server. The initial download may take a few minutes. If remote desktop setup fails, it only displays a warning and continues the rest of the installation.

Once installation finishes, open the displayed URL, log in, and change the temporary password. Open a project folder using **+** in the header, then select a file in the file explorer.

After rebooting, open Ubuntu or a terminal and start mew from the installation folder.

```bash
cd ~/apps/mew
./mew start
```

### Run with one command (after the release is published)

With Node.js 24 installed, you can download the prebuilt executable from your working folder using the following command. **The implementation is ready; publishing the first npm and GitHub releases is a separate step.**

```bash
cd /내/워크스페이스
npx @liiiiv/mew-cli@latest
```

Supports Linux with glibc 2.35 or later and macOS 15 or later, on x64/arm64. On Windows, run it on Ubuntu 22.04 or later in WSL 2. On first use, enter the owner email, log in with the displayed temporary password, and change the password. Existing accounts, conversations, and device registrations are reused. For Mewlink registration, follow [External access](#connect-remotely) below; the registration link and a QR code for the online address also appear in the terminal.

Exit with Ctrl+C and run the same command again to use the latest version. If your existing clone used `.data/`, specify `--data-dir /기존/mew/.data` and stop the old server first. Remote desktop requires an optional installation and OS permission setup. [Runtime and data contract](../../.mew/docs/development/cli-distribution.md) · [Publishing procedure](../../.mew/docs/operations/cli-release.md)

<a id="remote-access"></a>

### Connect remotely

#### 1. Mewlink

[Mewlink](https://mew.saens.kr) lets you open mew on your computer from a browser on your phone or another computer. No separate domain or router port forwarding configuration is required. Mewlink handles device registration, management, and connections, while the mew interface and work data are transferred directly between your computer and the connecting browser.

1. Run mew on your computer and log in as **owner** at the local address (default: `http://localhost:5000`). If you are using a temporary password, change it first.
2. Click the upper-right menu → **Mewlink → Remote access → Register device**.
3. Open the displayed **Log in and complete registration** link and log in to Mewlink. If this is your first time, set a username, then choose a device name to complete registration. The Mewlink login used for device registration and management is separate from your local mew email and password.
4. In local mew, confirm the **Online** status and fixed access address. The address has the format `https://mew.saens.kr/<유저이름>/<기기이름>`.
5. Opening this address on your phone or another computer displays that computer's mew login screen without requiring a Mewlink login. Log in with your **local mew email and password**. The connecting browser does not need separate registration, and if its saved local login session is valid, you can continue using it on your next visit. Registration, deletion, and list management in [My devices](https://mew.saens.kr/dashboard) require logging in to Mewlink.

Your computer must stay on, with mew running and an active internet connection. You cannot connect while the computer is off or asleep. Networks that block direct connections display a connection failure. Android iframes are not supported with this access method. See the [remote access contract](../../.mew/docs/development/remote-access.md#verification-and-remaining-gates) for the scope of verification covering provider-specific logins, external mobile networks, sleep, and network switching.

To allow someone else access, configure an email account and its role, feature permissions, and file permissions in local mew's **Account management**, then share the device address. They can log in with the local account without a Mewlink account.

To let someone connect with a Mewlink account without a password, have them click **Log in with Mewlink → Request access** on the device login screen. The owner reviews the request in **Account management → Mewlink account access** and links it to an existing mew user or creates a new user. New users have the member role by default and do not need to create a password. After approval, they connect with the same Mewlink account, and permissions are managed in local mew. To revoke access, unlink the account on the same screen. A matching device registration account or email does not replace approval. Applying this feature requires updating local mew and redeploying Mewlink. [Account linking contract](../../.mew/docs/development/remote-access.md#approved-mewlink-account-login).

After installation, you can view the registration instructions again with `./mew remote-access account`. To operate the Mewlink central service yourself, follow [Central service installation](../../.mew/docs/operations/remote-central.md).

You can also use Tailscale or Cloudflare Tunnel as described below. Both methods forward HTTPS traffic to the local mew server. Leave `MEW_BIND=127.0.0.1` as is, and if your installation uses a different port, replace `5000` with that port.

#### 2. Tailscale

Use this to connect devices you own. You do not need to purchase a domain, and only devices connected to your private Tailscale network (tailnet) can access it.

1. Install [Tailscale](https://tailscale.com/download) on the mew host and every device that will connect. Connect all devices to the same tailnet.

2. Run the following on the mew host.

   ```bash
   tailscale serve --bg http://127.0.0.1:5000
   ```

   If prompted, follow the displayed link to enable HTTPS. On Linux, use `sudo` if you encounter a permission error. For WSL 2, install Tailscale on **Windows**, confirm that `http://localhost:5000` opens in a Windows browser, and run this command in PowerShell.

3. Connect to Tailscale on your phone or another computer, then open the displayed `https://<machine>.<tailnet>.ts.net` URL and log in to mew.

See the official [Tailscale Serve guide](https://tailscale.com/docs/features/tailscale-serve) and [command reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

#### 3. Cloudflare Tunnel

Use this when you need a fixed HTTPS address accessible from a browser without installing Tailscale on the connecting device. **A domain managed by Cloudflare DNS is required.**

1. Purchase a domain using the official [Cloudflare domain registration guide](https://developers.cloudflare.com/registrar/get-started/register-domain/), or [add an existing domain to Cloudflare](https://developers.cloudflare.com/fundamentals/manage-domains/add-site/) and follow the nameserver instructions.
2. Follow the official [Cloudflare Tunnel setup guide](https://developers.cloudflare.com/tunnel/get-started/) to create a tunnel, then install and run `cloudflared` on the mew host. In WSL 2, run `cloudflared` in the same Ubuntu environment as mew.
3. Choose a hostname such as `mew.example.com` and add a **Published application** route with the service URL set to `http://127.0.0.1:5000`. Leave the path empty so mew is served at `/`.
4. Keep `cloudflared` running, then open `https://mew.example.com` on another device and log in to mew.

This configuration creates a public HTTPS entry point. mew's account permissions continue to apply. See [Security](../operations/security.md) and the [deployment guide](../deployment/native.md#2-connect-an-https-proxy-or-tunnel) for proxy requirements and connection checks.

## Runtime environment and permissions

The server runs on Linux or macOS; on Windows, use WSL 2. Node 22.18+ or 24+ is required, and Node 24 is recommended. The terminal uses tmux and a locally compiled `node-pty`, so installation requires Python and a C/C++ toolchain. Docker can optionally be used for Postgres, but running the mew app itself in a container is currently unsupported.

Use mew only with people you trust. By default, `manager` and `owner` accounts can run terminals and agents with the server user's OS permissions. Granting this capability to other accounts gives them the same access. Read [security.md](../operations/security.md) before providing an instance to others.

<a id="first-steps"></a>

## Using mew

After installation, open the displayed address, log in as owner, and change the temporary password.

1. Open a working folder using **+** in the header.
2. Select a Markdown or code file from the file list on the left.
3. Open the terminal, agents, or Git from the dock as needed.

[Interface tour](overview.md) · [First steps](first-steps.md) · [User guide home](MOC.md)

<a id="projects-files-and-search"></a>

### Projects, files, and search

Open a folder using **+** in the header and select a file from the list on the left. `Ctrl+P` searches file names, and `Ctrl+Shift+F` searches contents.

[Projects, files, and tasks](projects.md) · [Search and replace](../configuration/search.md) · [Project instructions](project-setup.md).

<a id="writing-code-and-media"></a>

### Writing, code, and media

Edit Markdown directly in **Hotview** and view its source in **Plain**. Content is saved automatically. Open the corresponding files to work with code, tables, attachments, PDFs, and media.

[Editing, saving, and file history](editor.md).

<a id="git"></a>

### Git

View changed files and commit history in **Git** in the dock. Open files to review diffs and select what to commit.

[Git panel](projects.md#git-operations-panel).

<a id="collaboration-and-sharing"></a>

### Collaboration and sharing

Edit documents together and use comments, mentions, and chat. Guest sharing and access by other accounts depend on roles, feature permissions, and file permissions.

[Collaboration, comments, chat, and sharing](collaboration.md) · [Security](../operations/security.md).

<a id="terminals-agents-and-automation"></a>

### Terminals, agents, and automation

Open a terminal or agent from the dock. Install and authenticate AI tools first. Follow the respective guides for conversation history, command buttons, and scheduled tasks.

[Terminals and agents](terminal-agents.md) · [Runtime settings](../configuration/agent-runtimes.md) · [Commands and scheduling](commands.md).

<a id="browser-android-and-remote-desktop"></a>

### Browser, Android, and remote desktop

Log in to agents in a standalone Chrome window on the host, and open development apps by appending `/포트번호` to the Mew address. Login screens, Android, and remote desktop require separate environment setup, installation, and OS permissions; check the supported scope first.

[Browser and Android](browser.md) · [Remote desktop](remote-desktop.md).

<a id="databases"></a>

### Database

Configure a Postgres connection, then insert a table in a document with `/db`. This is separate from ordinary Markdown tables in documents, and you can edit documents and code without a database.

[Table database](database.md).

<a id="layout-settings-and-accounts"></a>

### Layout, settings, and accounts

Open panels from the dock and drag tabs to rearrange them. On a phone, switch between panels using the bottom dock. Manage themes, language, fonts, keyboard shortcuts, Mewpet, and accounts in **Settings**.

[Split view and mobile](editor.md) · [Preferences and accounts](../configuration/MOC.md).

<a id="running-and-updating"></a>

## Running and Updating

Run the following in the mew repository. On Windows, use the Ubuntu terminal.

```bash
./mew start                    # 서버 시작
./mew stop                     # 서버 중지
./mew restart                  # 서버 재시작
./mew status                   # 상태와 경로 표시
./mew logs                     # 서버 로그 따라가기
./mew update                   # origin/main 가져오기, 설치, 빌드, 재시작
./mew desktop-setup            # mew를 재시작하지 않고 데스크톱 도우미 준비
./mew users add you@example.com owner
```

`./mew update` uses a fast-forward pull. If you started the app with `./mew start`, you can also check for and install updates from the app menu. For servers managed by systemd or another supervisor, follow the separate [deployment and update procedure](../deployment/native.md).

By default, configuration and runtime data are stored outside the cloned repository folder.

| Contents | Location |
| --- | --- |
| Configuration | `~/.config/mew/config.env` |
| Accounts, sessions, completed agent turns | `~/.local/share/mew/` |
| Logs | `~/.local/state/mew/` |

These files remain even if you delete the repository folder. Back up these files along with your workspace and Postgres data. To change the paths, see [Server settings](../configuration/environment.md#server-settings).

To connect from your phone or another computer, follow [Remote access](#connect-remotely). With the default settings, mew is accessible only from the computer running it. `./mew start` does not register a service that starts automatically at boot.

If remote desktop setup failed during installation, retry with `./mew desktop-setup`. This command installs the helper and opens Mac permission settings without building the app or restarting the server. A logged-in desktop session, OS libraries, and permissions are required. See [OS requirements](../guides/remote-desktop.md#first-connection).

On macOS, mew restores missing execute permissions on `spawn-helper` in `node-pty` 1.1.0 before opening a terminal. If the terminal remains blank, check the server logs for `[mew:tmux]` errors.

## Troubleshooting

If WSL freezes or your mew connection drops, see [Troubleshooting](troubleshooting.md). It distinguishes recurring WSLg crashes from mew connection failures and explains workaround settings when not using Linux GUI apps, along with restart and recovery methods.

<a id="documentation"></a>

## Documentation

Start with the [documentation map](../../.mew/docs/MOC.md). Detailed product specifications, usage guides, operating procedures, and work records are kept in `docs/`, while this guide covers installation and everyday use. When changing code, update the related documentation as well.

| Topic | Starting point |
| --- | --- |
| Projects, editing, terminals, browser, commands, database | [User guide](../guides/MOC.md) |
| Environment variables, accounts, search, agent runtimes | [Configuration](../configuration/MOC.md) |
| HTTPS, systemd, updates, backups | [Deployment](../deployment/native.md) |
| Code structure, packages, UI, collaboration, agent protocols | [Development documentation](../../.mew/docs/development/MOC.md) |
| Product specifications, operations, current work, history | [Documentation map](../../.mew/docs/MOC.md) |
| Per-account feature and file permissions | [Account settings](../configuration/accounts.md#my-account-and-account-management) · [Access control](../../.mew/docs/development/access-control.md) |
| Roles, authentication, guest access | [Security](../operations/security.md) |

On Linux, install memory limits for agent tasks with `sh native/agent-memory/install.sh`. See [Agent memory protection](../operations/agent-memory.md) for activation, checks, pausing tasks when memory is low, holding the queue, and error reporting.
