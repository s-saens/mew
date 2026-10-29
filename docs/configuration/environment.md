---
title: "Server environment variables and CLI settings"
description: "Covers host configuration file precedence, environment variables, data locations, Mewlink origin, OAuth, Remote Desktop, and prebuilt CLI options. Development documentation owns the module initialization contract."
updated: "2026-10-29"
상위파일: "MOC.md"
---

# Server environment variables and CLI settings

Read this when changing configuration files and launch options as a host operator. Follow the respective guides for [installation and startup](../guides/getting-started-ko.md), [appearance, notifications, and keyboard shortcuts](appearance.md), and [account and permission management](accounts.md).

## Server settings

The server configuration file is `~/.config/mew/config.env` on Linux and macOS (respecting `XDG_CONFIG_HOME`), and `%LOCALAPPDATA%\mew\config\config.env` on native Windows. Source installations then also read the repository's `.env`. Because `server/config.ts` reads these using `process.loadEnvFile()`, existing values take precedence in the order **explicit process environment variables → config.env → repository .env**. `.env` supplies values not set earlier and does not overwrite values already set.

| Variable | Default | Purpose |
| --- | --- | --- |
| `MEW_WORKSPACE` | Parent of the app folder | Folder containing projects. Can be specified separately from the app installation path |
| `MEW_GITHUB_CLIENT_ID` | Built-in Mew OAuth app | Optional setting to replace it with your own GitHub OAuth app Client ID. Unset, empty, or whitespace-only values use the default app |
| `MEW_DATA_DIR` | Linux/macOS: `~/.local/share/mew` (respecting `XDG_DATA_HOME`), Windows: `%LOCALAPPDATA%\mew\data`. An older installation's `<앱>/.data` takes precedence if present | Accounts, sessions, feature/file permissions, and icons |
| `MEW_AGENT_MEMORY_SCOPE` | `auto` | Applies ACP and CLI task memory limits through the installed systemd slice. `required` refuses execution if it is not installed; `off` disables only OS limits. [Installation and memory protection](../operations/agent-memory.md) |
| `MEW_REMOTE_ORIGIN` | `https://mew.run` | Central HTTPS origin for new remote registrations. After registration, the saved origin is used. Existing `mew.saens.kr` registrations are maintained through the central service's support for allowed previous origins. To switch to an arbitrary service, unregister and register again. [Central service operations](../../.mew/docs/operations/remote-central.md) |
| `MEW_TEAM_PORT` | 5000 | Server port |
| `MEW_DESKTOP_ENGINE` | `rust` | Default Rust video thread. `legacy` is the previous JS worker transmission path for comparison and recovery. Requires restarting the server/resident helper app to take effect. [Engine contract](../../.mew/docs/development/remote-desktop-rust.md) |
| `MEW_DESKTOP_HELPER_DIR` | Project's `native/remote-desktop`; on WSL, `Mew/remote-desktop` under Windows LocalAppData | Installation path for the [Remote Desktop helper app](../guides/remote-desktop.md). On WSL, use an absolute Windows path |
| `MEW_DESKTOP_ICE_SERVERS` | `[{"urls":["stun:stun.l.google.com:19302","stun:stun.cloudflare.com:3478"]}]` | STUN JSON array for WebRTC address discovery. Use `[]` to disable external lookups. TURN and video relaying are not supported; direct connections may be impossible depending on NAT/firewall conditions |
| `MEW_DESKTOP_AUTO_NAT` | `1` | If an active direct connection is delayed, attempts temporary UDP mappings through PCP/NAT-PMP/UPnP on the OS default gateway. Disable with `0`. [Lifetime and OS network approval](../../.mew/docs/development/remote-desktop-connectivity.md) |
| `MEW_DESKTOP_UDP_PORT` | Automatically selected | Fixed UDP port for Windows/WSL, Mac, and native Linux hosts (1024–65535). Optional operator setting. Default connections use STUN and short-lived automatic NAT mappings without specifying a port |
| `MEW_BIND` | `127.0.0.1` | Address the server listens on. The published default is loopback; specify an exposed address only when direct LAN access is essential. Keep server deployments on `127.0.0.1` behind an HTTPS proxy or tunnel |
| `MEW_COLLAB_RUST` | Unset (=JS Yjs) | If `1`, uses Rust (yrs) for collaboration room state — run `npm run build:native` first ([Collaboration rooms](../../.mew/docs/development/collaboration.md)) |
| `DATABASE_URL` | Unset | Postgres for `/db`. If unset or unreachable, only the `/db` API returns 503 |

All are optional — the app starts even if none are set. To see where current values come from, use `./mew status`.

Central mewlink is a Cloudflare Worker separate from local A and uses its own vars, secrets, and OAuth credentials. It does not share the local GitHub Device Flow settings. For the full central configuration, follow [Central service operations](../../.mew/docs/operations/remote-central.md).

## GitHub OAuth connection

Mew includes a public Client ID in its code, so a default installation does not require registering an OAuth app or setting environment variables. Each user authorizes their own account through GitHub login. Tokens are stored per account on the installation server and do not share the app owner's account permissions.

To use your own app, register it under GitHub Settings → Developer settings → OAuth Apps and enable **Enable Device Flow**. Fill the URL fields on the registration screen with the actual service address, although the current device code flow does not use a callback. Set `MEW_GITHUB_CLIENT_ID=발급된_ID` in the server configuration outside the repository; it replaces the default app when the user restarts the server. Leading and trailing whitespace is removed; unset, empty, or whitespace-only values use the built-in app. A Client secret is not used. `server/git-providers.ts` owns the default implementation.

The app requests the `repo read:user` scopes. Company/organization repositories may require separate app approval and SSO. Log in again when a token expires or authorization is revoked; existing OS login is not used as a substitute. The default app is also subject to GitHub's per-app authentication limits. Users must verify actual app approval and whether Device Flow is enabled.

For usage, follow [GitHub login](../guides/projects.md#github-login); for key and ciphertext backups and storage boundaries, follow the [Git connection contract](../../.mew/docs/development/git-connections.md).

## Prebuilt CLI settings

The [CLI distribution contract](../../.mew/docs/development/cli-distribution.md) reuses data paths from existing config.env files and explicit environment variables. Explicit options such as `--data-dir` and `--port` take precedence, and the workspace is the current folder or `--workspace`. Specify an existing clone's internal `.data/` using `--data-dir`. The launcher sets `MEW_DISTRIBUTION=release` internally, blocking source updates, builds, restarts, and individual updates to bundled tmux. Before the first publication, the npm commands are not yet a public installation path.
