---
title: "Getting started with mew"
updated: "2026-11-17"
description: "Covers npm, the WSL/Linux/macOS curl bootstrap, source setup, and the Termux source installer. Includes platform prerequisites, data preservation, initial setup, remote access, and Mewlink two-factor sign-in."
---

# Getting started with mew



mew opens folders on your computer or server in a browser. Edit Markdown and code, run terminals and AI agents, review Git changes, and work on documents together. You can use it from your phone, too.

[First steps](#first-steps) · [Remote access](#remote-access) · [Running and updating](#running-and-updating) · [Documentation](#documentation)

## Quick start

Choose one route:

| Route | Prerequisites | Continue with |
| --- | --- | --- |
| 1. npm | Node.js 24 and npm; Windows starts in CMD or PowerShell | [Run `npx mew-ide`](#run-with-one-command-after-the-first-release) |
| 2. curl | Bash, curl, and an existing WSL 2 Ubuntu/Linux/macOS terminal | [Run the shell installer](#install-with-curl-after-the-first-release) |
| 3. Source | Git and the platform's build prerequisites | [Clone and run setup](#install-from-source) |

**The initial npm package, curl installer release assets, matching runtimes, and clean-platform acceptance remain pending. Until publication, use source installation.** [Release status](../../.mew/docs/operations/cli-release.md).

### Run with one command (after the first release)

Install Node.js 24 and npm, then run:

```bash
npx mew-ide
```

The installer uses defaults without asking for a workspace, port, or database connection. It prepares local Postgres and browser prerequisites, starts Mew in the background, and opens administrator creation in your browser. Default access is `http://localhost:5000`; if that port is occupied, Mew selects a nearby available port and opens the actual address. Existing accounts and data are reused.

On Windows x64, run the command in **CMD or PowerShell**. Mew prepares its dedicated WSL environment and opens the Windows browser; you do not enter Ubuntu commands or install Linux Node.js yourself. Windows may require administrator approval and a restart. Login startup launches the owned environment after sign-in. Existing unrelated WSL distributions are preserved.

On Linux/macOS, Mew registers login startup. Run `npx mew-ide` again to reopen it, `npx mew-ide status` to check it, or `npx mew-ide stop` to stop it while preserving data. Use `--foreground` for terminal-owned execution or `--no-autostart` to omit login registration. To update, stop the running instance and run `npx mew-ide@latest`.

After creating the administrator, configure agents in **Agent Set**, then choose **Mewlink**, **Tailscale**, or **Cloudflare Tunnel** in the remote-access popup. Reopen agent setup from **Menu → Agent Set**. **Menu → Mewlink** opens the same popup later. Provider sign-in is separate from local installation.

Linux uses glibc 2.35+, and macOS requires 15+, on x64/arm64. Browser preparation may require OS authorization and network access. Ordinary Chrome automatic installation on Linux/WSL supports x64; arm64 requires a compatible explicit `MEW_CHROME_EXECUTABLE`. npm may ask permission to download the package; `npx --yes mew-ide` suppresses that npm-owned prompt.

For existing source data on POSIX, stop the old server and pass `--data-dir /path/to/old/mew/.data`. The managed Windows installation owns separate paths and does not adopt another WSL environment. [Runtime and data contract](../../.mew/docs/development/cli-distribution.md) · [Release procedure](../../.mew/docs/operations/cli-release.md)

### Install with curl (after the first release)

Open your existing **WSL 2 Ubuntu terminal**, a Linux terminal, or macOS Terminal and run:

```bash
curl -fsSL https://raw.githubusercontent.com/s-saens/mew/main/install.sh | bash
```

The script downloads a checksum-pinned private Node runtime and the matching standalone Mew launcher into your user directory. You do not install npm, clone the repository, or compile Mew first. It then follows the same default configuration, managed Postgres, background execution, browser administrator creation, and remote-access popup as the npm route. Browser preparation may require sudo or other OS authorization.

In WSL, curl uses the distribution and Linux user you already opened. Windows interoperability must be enabled so Mew can open your Windows browser and register a per-user Windows login task. The task starts this same distribution after Windows sign-in; user systemd is not required. The script does not create another WSL distribution. Keep your projects in the Linux filesystem, such as `~/mew-workspace`.

Native Linux uses user systemd for login startup; macOS uses a user LaunchAgent. The same Linux/macOS versions, CPU architectures, and arm64 Chrome prerequisite listed above apply.

The convenience command is installed at `~/.local/bin/mew-ide`. The script prints its absolute path and does not change your shell profile. If that directory is not on `PATH`, use the full path:

```bash
~/.local/bin/mew-ide
~/.local/bin/mew-ide status
~/.local/bin/mew-ide stop
```

Running the command again reopens Mew. `stop` preserves account and database data; `disable-autostart` removes Mew's login registration. To update a curl installation, stop it and rerun the curl command after a newer installer is published.

### Install from source

Install the prerequisites for [Windows / WSL 2](#windows-wsl-2), [macOS](#macos), or [Linux](#linux), then clone and build Mew:

```bash
git clone https://github.com/s-saens/mew.git
cd mew
./mew setup
```

This route builds the app locally and asks for source-installation settings. The following platform steps and [Finish setup](#finish-setup) apply to this route.

### Windows (WSL 2)

A single-file Windows x64 installation wizard is implemented in source. Its first signed EXE, runtime publication, and clean-Windows checks are still pending, so there is no approved installer download yet. Once released, it will prepare its own environment, continue after any required Windows restart, and open administrator account creation in your browser. It preserves existing WSL environments and does not install Rust or compiler tools on Windows. [Installer release status](../../.mew/docs/operations/cli-release.md#windows-installation-wizard). For now, use the manual steps below.

Run mew inside Ubuntu on WSL 2, then open it in your Windows browser.

**1. Install WSL and Ubuntu.** Open PowerShell as administrator and run:

```powershell
wsl --install -d Ubuntu
```

Restart Windows, open **Ubuntu** from the Start menu, and create a Linux username and password. This is a separate account from your Windows login. The command requires Windows 11 or Windows 10 version 2004 (build 19041) or later. See [Microsoft's WSL installation guide](https://learn.microsoft.com/en-us/windows/wsl/install) if installation fails.

If you already have Ubuntu installed, check it from PowerShell with `wsl -l -v`. If its version is `1`, run `wsl --set-version Ubuntu 2`, using the distribution name shown in the list.

**2. Install mew.** Run these commands in **Ubuntu**:

```bash
sudo apt update
sudo apt install -y git curl ca-certificates build-essential python3 tmux
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/s-saens/mew.git
cd mew
./mew setup
```

Accept the offer to install Node with nvm if prompted. Keep the repository and your projects in the Linux filesystem, such as `~/apps` and `~/mew-workspace`, for better performance with Linux tools. You can open the current folder in Windows Explorer with `explorer.exe .`. See [Microsoft's WSL file storage guidance](https://learn.microsoft.com/en-us/windows/wsl/setup/environment#file-storage).

**3. Sign in.** Follow the [setup prompts below](#finish-setup), then open the printed URL in Edge, Chrome, or another Windows browser. It is usually `http://localhost:5000`; [WSL forwards localhost access from Windows](https://learn.microsoft.com/en-us/windows/wsl/networking#accessing-linux-networking-apps-from-windows-localhost).

### macOS

**1. Install Apple's command line tools.** Open Terminal and run:

```bash
xcode-select --install
```

Wait for the installation window to finish. If the tools are already installed, continue.

**2. Install Homebrew and the required tools.** If `brew` is not installed, run the command from [Homebrew](https://brew.sh/):

```bash
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
```

Follow the installer's **Next steps** to add Homebrew to your shell, then run:

```bash
brew install tmux python
```

**3. Install mew.** In the same Terminal window:

```bash
mkdir -p ~/apps
cd ~/apps
git clone https://github.com/s-saens/mew.git
cd mew
./mew setup
```

Accept the offer to install Node with nvm if prompted. Follow the [setup prompts below](#finish-setup), then open the printed URL in your browser.


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

On other distributions, install the equivalent packages first. Follow [Finish setup](#finish-setup). For a server that should start on boot or accept remote connections, use the [deployment guide](../deployment/native.md).

#### Termux on Android

From a native Termux terminal, download the pinned Mew source and run setup in one command:

```bash
pkg install -y curl && curl -fsSL https://github.com/s-saens/mew/releases/download/mew-termux-v0.1.5/install-termux.sh | bash
```

Setup uses `~/.local/opt/mew-termux` and prompts in your terminal. Run the same command again to resume setup. Use `~/.local/opt/mew-termux/mew status` to check the instance. This download has no Git history, so `./mew update` is unavailable with this installation.

Termux is experimental and full setup has not been verified. When running the source setup directly in Termux, it offers to install a missing Node LTS and npm, compiler, make, Python, and tmux using `pkg` without sudo. If Node fails to start because of mismatched Termux libraries, update the installed Termux packages with `pkg update` and `pkg upgrade`, then check `node --version` before retrying.

These prerequisite steps do not establish Android support. Native npm dependencies and the mandatory Chrome and Playwright browser preparation may still fail on Android; the latter currently supports Linux, macOS, and Windows hosts. Use a supported host if setup cannot finish.

### Finish setup

For source installation with `./mew setup`, enter:

- **Workspace folder:** the parent folder of your projects. The default is `~/mew-workspace`; each folder inside it becomes a project.
- **Port:** `5000` by default. If it is busy, setup chooses an available port nearby.
- **Postgres connection:** optional, for database tables. You can skip it and add it later.

The first administrator is created in the browser after setup, rather than through a terminal email prompt.

Setup installs npm dependencies, prepares ordinary Google Chrome and Playwright Chromium, builds the app, and starts the server. Browser preparation may need network access and sudo on Linux/WSL; run setup from an interactive terminal with permission to install system packages. The first download can take a few minutes.

On a fresh installation, open the **private setup link** printed by setup, enter your email, choose a password, and confirm it. Mew creates the administrator and signs you in. Existing installations keep their accounts and show ordinary login. Use **+** in the header to open a project folder, then select a file in the File explorer. [Account setup and recovery](../configuration/accounts.md#first-administrator).

For this source installation, after a reboot open Ubuntu or Terminal and start Mew from its installation folder:

```bash
cd ~/apps/mew
./mew start
```

<a id="remote-access"></a>

### Remote access

Use Mewlink to connect from another browser, or choose Tailscale or Cloudflare Tunnel below. Keep the host awake, online, and running mew. For the proxy alternatives, keep `MEW_BIND=127.0.0.1` and replace `5000` with your setup port.

#### 1. Mewlink

1. Sign in as owner on your local mew. Change any administrator-issued temporary password if required.
2. Open **Menu → Mewlink → Register device**. Follow the one-time URL, sign in to Mewlink, and choose your username and device name.
3. Wait for Online and copy the fixed URL, `https://link.mew.run/<username>/<device-name>`.
4. Open that URL from another PC or phone. It connects without a Mewlink sign-in and shows the host's mew login screen. Sign in with **that computer's local mew email and password**. Connecting browsers need no registration. A valid saved local session can resume on later visits.

Open [Mewlink](https://link.mew.run/) to sign in; a signed-in account enters its private `/{username}` device dashboard. The public [Mew homepage](https://mew.run/) introduces the product. Mewlink sign-in is used for registration, your device list and device removal. To give someone access, create their local mew account and configure its role, features and file permissions; a Mewlink account is not needed for local password sign-in. Application data remains blocked until local sign-in succeeds.

To protect your Mewlink account, open your profile in the Mewlink dashboard and find **2단계 인증** (Two-factor authentication). Register a passkey on a supported browser, or scan the QR code in your authenticator app and enter its six-digit code. You can register both and use either at sign-in. Generate and save the one-time recovery codes if you need a way to sign in after losing your authentication device. At your next sign-in, complete this step after your usual email or provider sign-in. Changes to these settings require a recent sign-in.

The host must stay running and online. Networks that block direct connections show an error. Run `./mew remote-access account` to see the registration instructions again. Operators should follow [Central service setup](../../.mew/docs/operations/remote-central.md). Applying this authentication change requires updating local mew and redeploying Mewlink; real external-network validation is separate.

For passwordless access, the visitor can choose **Sign in with Mewlink → Request access** on the device login screen. The owner approves the identity under **Account management → Mewlink account access**, linking it to an existing local user or creating one (member by default). Permissions remain local; remove the identity link to revoke access. The registration account and matching email do not grant access automatically. Local mew and Mewlink must both be updated for this flow; provider sign-in and external-network validation remain separate. See the [remote-access contract](../../.mew/docs/development/remote-access.md#verification-and-remaining-gates).

#### 2. Tailscale

Use this for your own devices. No domain purchase is needed, and access stays within your private Tailscale network (tailnet).

1. [Install Tailscale](https://tailscale.com/download) on the mew host and each device you want to connect from. Sign in to the same tailnet on all devices.

2. On the mew host, run:

   ```bash
   tailscale serve --bg http://127.0.0.1:5000
   ```

   Follow the printed link to enable HTTPS if prompted. On Linux, use `sudo` if the command reports a permission error. For WSL 2, install Tailscale on **Windows** and run this command in **PowerShell** after confirming that `http://localhost:5000` opens in your Windows browser.

3. With Tailscale connected on your phone or other computer, open the printed `https://<machine>.<tailnet>.ts.net` URL and sign in to mew.

See the official [Tailscale Serve guide](https://tailscale.com/docs/features/tailscale-serve) and [command reference](https://tailscale.com/docs/reference/tailscale-cli/serve).

#### 3. Cloudflare Tunnel

Use this for a stable HTTPS address that works in a browser without installing Tailscale on connecting devices. **A domain managed through Cloudflare DNS is required for this setup.**

1. Buy a domain using the official [Cloudflare domain registration guide](https://developers.cloudflare.com/registrar/get-started/register-domain/), or [add an existing domain to Cloudflare](https://developers.cloudflare.com/fundamentals/manage-domains/add-site/) and follow its nameserver instructions.
2. Follow the official [Cloudflare Tunnel setup guide](https://developers.cloudflare.com/tunnel/get-started/) to create a tunnel and install and run `cloudflared` on the mew host. For WSL 2, run `cloudflared` inside the same Ubuntu environment as mew.
3. Add a **Published application** route with a hostname such as `mew.example.com` and service URL `http://127.0.0.1:5000`. Leave the path empty so mew is served at `/`.
4. Keep `cloudflared` running, then open `https://mew.example.com` from another device and sign in to mew.

This creates a public HTTPS entry point; mew's account permissions still apply. See [Security](../operations/security.md) and the [deployment guide](../deployment/native.md#2-connect-an-https-proxy-or-tunnel) for proxy requirements and connection checks.

## Requirements and permissions

The server runs on Linux or macOS; Windows uses WSL 2. It needs Node 22.18+ or 24+, with Node 24 recommended. Terminals use tmux and a locally compiled `node-pty`, which is why setup needs Python and a C/C++ toolchain. Docker is optional for Postgres; running the mew app in a container is not currently supported.

Share your mew instance only with people you trust. By default, `manager` and `owner` accounts can run terminals and agents with the server user's OS permissions. Granting those features to another account gives it the same access. Read [Security](../operations/security.md) before making an instance available to others.

<a id="first-steps"></a>

## Using mew

Create the first administrator through the private setup link, or sign in with your existing account. Change an administrator-issued temporary password if required.

1. Open a working folder with the header **+**.
2. Select a Markdown or code file from the file list.
3. Open terminals, agents, or Git from the dock when needed.

[Screenshot tour](overview.md) · [First-use walkthrough](first-steps.md) · [User guides](MOC.md).

<a id="projects-files-and-search"></a>

### Projects, files, and search

Open a folder with the header **+**, then select a file on the left. `Ctrl+P` finds filenames; `Ctrl+Shift+F` searches file contents.

[Projects, files, and tasks](projects.md) · [Search and replace](../configuration/search.md) · [Project instructions](project-setup.md).

<a id="writing-code-and-media"></a>

### Writing, code, and media

Use **Hotview** to edit rendered Markdown and **Plain** for its source. File content saves automatically. Open code, tables, attachments, PDFs, and media from the file list.

[Editing, saving, and file history](editor.md).

<a id="git"></a>

### Git

Open **Git** from the dock to see changed files and commit history. Open a file to review its diff and select files for a commit.

[Git panel](projects.md#git-operations-panel).

<a id="collaboration-and-sharing"></a>

### Collaboration and sharing

Edit documents together and use comments, mentions, and chat. Roles, features, and file permissions control access for other accounts and guests.

[Collaboration and sharing](collaboration.md) · [Security](../operations/security.md).

<a id="terminals-agents-and-automation"></a>

### Terminals, agents, and automation

Open a terminal or agent from the dock. Install and authenticate your AI runtime first. Follow the guides for conversations, command buttons, and schedules.

[Terminals and agents](terminal-agents.md) · [Runtime setup](../configuration/agent-runtimes.md) · [Commands and schedules](commands.md).

<a id="browser-android-and-remote-desktop"></a>

### Browser

Use the server browser to open web pages.

[Login screens and browser](browser.md).

<a id="databases"></a>

### Databases

After configuring Postgres, use `/db` to insert a database table in a document. This is separate from Markdown tables; editing documents and code does not require a DB.

[Database tables](database.md).

<a id="layout-settings-and-accounts"></a>

### Layout, settings, and accounts

Open panels from the dock and drag tabs to arrange them. On phones, switch panels with the bottom dock. **Settings** controls theme, language, fonts, shortcuts, Mewpet, and your account.

[Split views and mobile](editor.md) · [Environment and accounts](../configuration/MOC.md).

<a id="running-and-updating"></a>

## Running and updating

Run these from the mew repository. On Windows, use the Ubuntu terminal. Setup and update install missing browser dependencies. Start and restart check them without installing; restart checks before stopping the running server. If this check fails, repair dependencies interactively, then retry your normal start or restart command:

```bash
npm run browsers:install
npm run browsers:check
```

An existing ordinary Chrome is reused. Chromium follows Mew's pinned Playwright version. Override paths, Linux arm64 limits, and separate native-login prerequisites follow the [browser dependency contract](../../.mew/docs/development/browser-dependencies.md).

```bash
./mew start                    # Start the server
./mew stop                     # Stop it
./mew restart                  # Restart it
./mew status                   # Show status and paths
./mew logs                     # Follow the server log
./mew update                   # Pull origin/main, install, build, and restart
./mew desktop-setup            # Prepare the desktop helper without restarting mew
./mew users add you@example.com owner
```

`./mew update` uses a fast-forward pull. For installations started with `./mew start`, you can also check for updates and install them from the app menu. Servers managed by systemd or another supervisor follow the separate [deployment and update procedure](../deployment/native.md).

Settings and runtime data live outside the clone by default:

| Contents | Location |
| --- | --- |
| Configuration | `~/.config/mew/config.env` |
| Accounts, sessions, and completed agent turns | `~/.local/share/mew/` |
| Logs | `~/.local/state/mew/` |

Deleting the clone leaves these files in place. Back them up along with your workspace and any Postgres data. See [server configuration](../configuration/environment.md#server-settings) for overrides.

To connect from a phone or another computer, follow [Remote access](#remote-access). The default server binding is local to the host. A personal `./mew start` installation does not register an automatic startup service.


On macOS, mew repairs a missing execute permission on `node-pty` 1.1.0's `spawn-helper` before opening a terminal. If a terminal stays blank, check the server log for `[mew:tmux]` errors.

<a id="documentation"></a>

## Documentation

Start at the [document map](../../.mew/docs/MOC.md). Detailed product specs, usage, operating procedures, and work records belong in `docs/`; this guide covers setup and everyday use. Update the relevant documentation whenever code changes.

| Topic | Start here |
| --- | --- |
| Projects, editing, terminals, browsers, commands, and databases | [User guides](MOC.md) |
| Environment variables, accounts, search, and agent runtimes | [Configuration](../configuration/MOC.md) |
| HTTPS, systemd, updates, and backups | [Deployment](../deployment/native.md) |
| Code structure, packages, UI, collaboration, and agent protocols | [Development docs](../../.mew/docs/development/MOC.md) |
| Product specs, operations, current work, and history | [Document map](../../.mew/docs/MOC.md) |
| Per-account features and file permissions | [Account settings](../configuration/accounts.md#my-account-and-account-management) · [Access control](../../.mew/docs/development/access-control.md) |
| Roles, authentication, and guest access | [Security](../operations/security.md) |

On Linux, `sh native/agent-memory/install.sh` installs memory limits for agent work. See [agent memory protection](../operations/agent-memory.md) for activation, checks, low-memory job suspension, queue holds, and error reporting.
