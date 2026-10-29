---
updated: "2026-10-23"
title: "Native server deployment"
description: "Covers installing the s-saens/mew source server, changing the remote URL of older clones, the CLI path before publication, dedicated-user, HTTPS, and systemd operations, and Mewlink registration and locally authenticated P2P access through the hamburger menu. Explains preserved update terminals, backups, recovery from missing node-pty native modules, and support limitations for subpath and app container deployments."
상위파일:
  - "../../.mew/docs/MOC.md"
  - "_deployment.md"
---
[Installation and execution](../guides/getting-started-ko.md)

For the prebuilt CLI execution path and first public publication, follow the [CLI distribution contract](../../.mew/docs/development/cli-distribution.md) and [release procedure](../../.mew/docs/operations/cli-release.md). The following procedures cover existing clone-based installations and server operations. Because the CLI runs from the app cache, do not use this document's `./mew update` or systemd unit as-is.

## Deployment paths and prerequisites

The currently supported deployment path is **native installation on Linux or macOS**. On a personal computer, `./mew setup` is sufficient; on a server, use a dedicated OS user, local binding, an HTTPS proxy (or tunnel), and a process manager as described below.

| Scenario | Recommended path |
| --- | --- |
| Solo use on your own computer | Native installation, then `./mew setup` |
| Access from your own devices, including phones | Native installation + VPN or HTTPS tunnel |
| Server for a small, trusted team | Native installation + `127.0.0.1` binding + HTTPS reverse proxy + systemd |
| Public or multitenant service | Not supported — the permission model and terminal features are unsuitable |

The app assumes deployment at **the root path (**`/`**) of a separate hostname**. Because the client uses `/api` and WebSocket paths as absolute paths, deployment under a subpath such as `/mew` is not supported.

> **Containerized app deployment is not currently supported.** The Dockerfile has been removed from this repository, so `docker compose --profile app up -d --build` does not succeed. `docker-compose.yml` is currently used only to start Postgres for the `/db` feature. Restoring a containerized app deployment path requires restoring the Dockerfile, operations contract, and security review together.

## Server deployment (native)

The following example runs a Linux server under a dedicated non-administrator account named `mew`. Adjust the account name, paths, and domain for your environment. Use **absolute paths in** `config.env` **rather than** `~` or `$HOME`**.** The configuration file is not a shell script and does not expand paths.

## 1. Prepare the server and file paths

Node 24 is recommended (minimum Node 22.18). `git`, C/C++ build tools, `python3`, and `tmux` are required because `node-pty` is built locally and tmux provides terminal functionality.

```bash
# Debian/Ubuntu 예시 — root가 아닌 mew 사용자로 서비스를 운영한다.
sudo apt install git build-essential python3 tmux
sudo adduser --disabled-password --gecos "" mew   # 아직 없다면 한 번만

sudo -iu mew
git clone https://github.com/s-saens/mew.git ~/apps/mew
install -d -m 700 ~/workspace ~/.config/mew ~/.local/share/mew

cat > ~/.config/mew/config.env <<'EOF'
MEW_WORKSPACE=/home/mew/workspace
MEW_DATA_DIR=/home/mew/.local/share/mew
MEW_TEAM_PORT=5000
MEW_BIND=127.0.0.1
EOF
chmod 600 ~/.config/mew/config.env

cd ~/apps/mew
./mew setup
```

If a configuration file already exists, `setup` does not ask for the workspace folder and port again. After installing app dependencies, it also prepares the Remote Desktop helper app; on Mac, it opens permission settings on the server Mac to check approvals. It then builds and starts the app and asks for the first owner account's email address. If helper app installation or permission preparation fails, it displays errors and warnings and continues installing Mew (Ctrl+C cancels). On an already running server, you can rerun preparation alone using `./mew desktop-setup` in the installation folder without building or restarting the server. Preparation does not enable screen capture, input control, or automatic startup at login. Installing components on a server without a desktop does not create a screen to share. For OS-specific library, login, and permission requirements, follow [Remote Desktop preparation](../guides/remote-desktop.md#first-connection). Change the password immediately after logging in with the printed temporary password.

Keep only projects that mew will read and write in `MEW_WORKSPACE`. Do not include paths that must not be accessible even to the mew user, such as the entire home directory, server configuration, or other services' data. The configuration file and data folder must be owned by the OS user running mew.

To use Mewlink remote access, the local owner changes the temporary password, then registers A once under **Mewlink → Remote Access**. The remote access option in `./mew setup` or `./mew remote-access account` guides you through this sequence. Follow [Central Service Operations](../../.mew/docs/operations/remote-central.md) for the central service's HTTPS and OAuth configuration. Keep A's HTTP port on loopback and connect to the central service through outbound WSS; transfer work data directly between A and the browser over WebRTC. See the [implementation contract](../../.mew/docs/development/remote-access.md). Visitors open the device address without logging in to the central service and log in with their local mew email and password. Central accounts handle registration and management only. Applying the new authentication flow requires redeploying the central service and updating the local installation; actual external-network verification is performed separately.

## 2. Connect an HTTPS proxy or tunnel

Keep `MEW_BIND=127.0.0.1` and do not expose the service port directly to the outside. Place a reverse proxy or tunnel that terminates HTTPS in front of it. The proxy configuration requires all of the following.

- Forward requests for the public domain to `http://127.0.0.1:5000`. Do not add or remove path segments.
- Preserve the original `Host` header and send `X-Forwarded-Proto: https` for HTTPS requests. This is required for login cookies to be issued with `Secure` and for CSRF Origin checks to work correctly.
- Pass WebSocket upgrades through on all paths. Collaboration, presence, terminals, agents, databases, login video, and localhost app previews all use WebSocket.
- Do not cache `index.html` or `/api` responses long-term at the proxy. The app manages the static `/assets` cache itself.

After connecting the proxy or tunnel, check the following on the actual domain in this order.

1. `https://<도메인>/api/auth/me` returns a JSON response.
2. After logging in through the browser, the temporary password change screen appears first.
3. Open the same document in another browser window and verify that collaboration connects and autosave works.
4. Verify that a manager or owner account can open a terminal. Perform this check only with a test account, since it grants actual shell access.

The development server `npm run dev` (4999) exposes HMR and source maps, so do not expose it through a tunnel, proxy, or firewall.

## 3. Keep running after reboot (systemd)

`./mew start` is a simple personal-use option that launches the process with `nohup` and does not start automatically after reboot. Use only one process manager on the server. If you use systemd as shown below, do not mix it with `./mew start|stop|restart|update`; start, stop, and restart only with `systemctl`.

First stop the process launched by `./mew setup`, then create a unit using the actual user, paths, and Node path. Check Node's absolute path with `command -v node`.

```ini
# /etc/systemd/system/mew.service
[Unit]
Description=mew workspace editor
After=network.target

[Service]
Type=simple
User=mew
Group=mew
WorkingDirectory=/home/mew/apps/mew
Environment=HOME=/home/mew
Environment=PATH=/usr/local/bin:/usr/bin:/bin
UMask=0077
ExecStart=/usr/bin/node server/serve.ts
Restart=on-failure
RestartSec=3

[Install]
WantedBy=multi-user.target
```

```bash
# mew 사용자에서: setup이 띄운 nohup 프로세스를 먼저 정리
cd ~/apps/mew && ./mew stop
exit

# 관리자로 돌아와 unit 반영과 시작
sudo systemctl daemon-reload
sudo systemctl enable --now mew
sudo systemctl status mew
journalctl -u mew -f
```

If Node or an agent CLI is installed in a user-specific location through tools such as `nvm` or `mise`, include that absolute path in systemd's `PATH` as well. systemd does not read login shell initialization files.

<br/>

## 4. Updates, backups, and failure checks

If you installed from the previous `liiiiv-life/mew` repository, first apply the [remote URL change](../../.mew/docs/operations/repository-maintenance.md#transferring-github-ownership) after the GitHub Transfer is complete. Launcher and app update checks use the clone's configured `origin/main`.

Personal installations run with `./mew start` can check for new commits on `origin/main` and update through **Update** in the header menu. If new commits are available, it runs `./mew update` in a dedicated tmux session. Open the execution output using the item's terminal icon, and click the **Refresh** icon to load the new interface after pull, dependency installation, build, and restart all succeed. Because it uses `git pull --ff-only`, it fails without automatically merging if the local branch has diverged or conflicts with working files, preserving the working tree. If dependency installation or the build fails, it does not restart the server and leaves a failure status and collapsible execution log on the update screen. Even if pull succeeds and the Git commit is current, a failed job can rerun the entire procedure with **Retry**. An interrupted tmux job is marked as failed, and the startup wait allows an execution grace period of up to 30 seconds. Reopening the page during an update lets you continue monitoring progress. tmux starts the job command directly without login shell initialization and preserves the session after completion so you can inspect the output. If the browser disconnects during restart, reconnect to Mew and open the same session. A server launched by an external supervisor such as systemd is not restarted by this button; the screen indicates that a manual update is required. The detailed session behavior contract follows [App Updates and Operations Entry](../../.mew/docs/features/appearance-accounts-operations/application-updates-and-operations.md).

Always record the current commit and data backup location before deployment. The following state remains even if the app clone is deleted; losing this state removes accounts, sessions, guest rules, and the UI ledger.

| Target | Default location | Reason for backup |
| --- | --- | --- |
| Configuration and external service credentials | `~/.config/mew/config.env` | Restore workspace, port, DB connections, and other settings |
| mew app data | `~/.local/share/mew/` or `MEW_DATA_DIR` | Accounts, sessions, guest rules, and chat |
| Work files | `MEW_WORKSPACE` | Actual files edited by mew — assess separately whether Git alone is sufficient |
| `/db` data | Postgres referenced by `DATABASE_URL` | Not included in the app data folder |

Configuration files and app data contain secrets and password hashes, so include them only in encrypted backups and do not copy them to Git or shared folders. Preserve accounts, sessions, and guest rules; they are not caches that can be deleted and regenerated.

For systemd operations, update as follows. Because the build changes `dist/` directly, announce a brief update window on servers with connected users and complete the procedure in one pass.

```bash
# mew 사용자에서 빌드한다.
sudo -iu mew
cd ~/apps/mew
git status                 # 작업 트리가 깨끗한지 먼저 확인
git pull --ff-only
npm ci --no-audit --no-fund
npm test                   # 권장: 새 버전 검증
npm run build
exit

# 관리자로 돌아와 새 빌드를 재시작한다.
sudo systemctl restart mew
sudo systemctl status mew
```

If a problem occurs, first check server logs with `journalctl -u mew -n 100 --no-pager`. For personal installations run through `./mew`, use `./mew status` and `./mew logs`. To roll back, revert the app clone to the last known good commit, then follow the same dependency installation, build, and restart procedure. Do not roll back by deleting or overwriting the workspace or `MEW_DATA_DIR`.

### Missing node-pty native module

If server logs show `Failed to load native module: pty.node` after `✓ built`, the browser build completed, but a server-side native dependency is missing. Perform the recovery and checks below in the app clone using the Node version and OS user that run the server. Linux requires C/C++ build tools and `python3`; avoid installing dependencies with installation scripts skipped.

```bash
npm rebuild node-pty --foreground-scripts
node -e 'require("node-pty"); console.log("node-pty loaded")'
```

This command repairs dependencies only and does not change `dist/` or the server's running state. After verifying that the module loads, the user runs `./mew start` for a personal installation or the service's start command for a systemd installation. If the browser build already succeeded, there is no need to rebuild for this repair.

## App Update API

| Route | Role | Function |
| --- | --- | --- |
| `GET /api/mew-update/status` | manager·owner | Query ahead/behind status for `HEAD` and `origin/main`, launch method, and update job status. Fetch first if `?refresh=1` is specified |
| `POST /api/mew-actions/update/run` | manager·owner | Run the fixed update command in a preserved tmux session only on servers using the built-in `./mew start` launcher |

### Unified updates for installed dependencies and agents

- When a manager or owner enters the app, it queries the current and latest versions of installed items. If updates are available, Mewcat reports the count and representative items; **View Updates** opens the unified screen. **Check Again** on that screen repeats the remote version lookup. Concurrent lookups on the same server are combined.
- The list includes Mew's Git commit, installed standalone agent CLIs, and Mew-related system tools. App npm dependencies (including development, optional, and transitive dependencies), bundled ACP adapters, internal `@mew/*` packages, and items that are not installed are excluded from individual latest-version checks, notifications, and updates.
- Latest npm versions are queried from the official registry's `latest` tag; Hermes from PyPI; Cursor from the version in its official installation script; Antigravity from the official ACP Registry; Prime from the stable channel of the distribution repository used by its official installation script; Rust from the stable channel; and uv from official GitHub releases. Prime follows the `PRIME_AGENT_DOWNLOAD_BASE_URL`, `PRIME_AGENT_RELEASE_CHANNEL`, and `PRIME_AGENT_VERSION` settings in the same way as its official updater. Node shows the latest LTS version. For apt tools, installed versions and candidates are compared using the host's current package lists; the package lists themselves are not refreshed.
- Each item has current and latest versions and an **Update** button. With `terminal` permission and a created session, use the terminal icon beside it to view output in the same popup used by command buttons. Closing the popup preserves the job and session. Only items with a confirmed installation method and automatic update command can run. Items that cannot be updated automatically, such as Node managed by an external installation manager, apt requiring administrator privileges, non-npm Codex CLI installations, and version-pinned Antigravity ACP, display the reason. Failed lookups and unknown versions are not treated as up to date.
- Mew updates install the app dependency set in that commit's `package-lock.json` using `npm ci --no-audit --no-fund`. The screen and API do not update app dependencies to the latest versions individually or in bulk, and also reject requests using old `npm:*` IDs. Standalone CLI updates do not change the app manifest or lockfile, but do not guarantee compatibility with Mew integration. To update app dependencies, developers change related packages together in a separate workspace, validate them with type checks, tests, and builds, then incorporate the code and lockfile together. The rules prohibiting agents from building or restarting the server still apply.
- Standalone agents allow only **individual updates**. They are excluded from bulk selection, and the API also rejects requests for multiple items that include an agent. Immediately before execution, it checks processes belonging to the same OS user for Mew-supervised or CLI executions of that runtime and blocks the update if any are found. Installation also does not proceed if the process query fails. It cannot lock out processes started externally after the check.
- **Update All** processes only executable system tool updates sequentially in a single tmux session, and each row opens that same session. It continues processing the remaining items even if one fails, recording each item's pending, running, completed, or failed status and errors. Work continues even if the window is closed. The queue, item results, and session links are saved in `dependency-update-job.json` and executed by a separate worker, allowing restoration after the Mew server stops or restarts. If the worker is gone, remaining pending and running items are marked as failed. Individual updates use a session per item, and the next run for the same target replaces the previous completed session.
- If Mew is included in the bulk selection, the existing Mew update flow is invoked last, after all dependency updates succeed. If any item fails, the Mew restart is deferred. Mew retains the existing main and process manager restrictions and does not automatically merge Git conflicts. Closing the entire app page allows dependency jobs on the server to continue but cancels the client's scheduled follow-up Mew run.
- The API accepts only item IDs. Clients cannot specify shell strings, versions, or file paths, and the installed item list and latest versions are checked again when a request is made. Only one unified update job runs on the same server, and it cannot start concurrently with Mew build, restart, or update jobs.

| Route | Role | Function |
| --- | --- | --- |
| `GET /api/updates/status` | manager·owner | Installed items, versions, execution availability, and most recent job status. Query remote sources again with `?refresh=1` |
| `POST /api/updates/run` | manager·owner | Request individual or bulk updates for registered installed items using `{ ids: string[] }`. Return job status immediately |

### Runtime for updates launched from the UI

Updates launched from the UI use the running server's absolute Node path. Job scripts are invoked with Bash, and the PATH for dependency installation and builds and the server restart (`MEW_NODE`) are pinned to the same Node. This prevents startup failures caused by a different Node version in the tmux environment or a missing executable bit on `mew`. Failure reasons, stages, and retry status remain on the update screen, and the existing main/process manager boundaries are maintained.
