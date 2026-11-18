---
title: "Single-Command Execution and Prebuilt Distribution"
description: "Defines unattended mew-ide execution shared by npm and curl installation, managed Postgres, private control sockets, background/login startup, dedicated and existing Windows WSL paths, browser-first administrator setup, and runtime/package boundaries. Publication and clean-platform acceptance remain separate."
updated: "2026-11-18"
상위파일:
  - "architecture.md"
  - "../operations/cli-release.md"
---

## User Flow

After the first release and npm package are published, run `npx mew-ide` from a working folder on a computer with Node.js 24 and npm installed. Installation uses defaults without asking for a workspace, port, or database connection. The launcher downloads the versioned server, UI, dependencies, and terminal binaries, prepares browser prerequisites, and provisions [managed Postgres](managed-postgres.md). Cloning the repository, building the app, installing Docker, and compiling native dependencies are not part of the user flow. Git operations still require Git; external AI providers retain their installation and authentication requirements.

The normal POSIX entry installs a durable copy of the CLI and its dependencies, registers login startup, and starts Mew in the background. The first browser opens when the host is ready. `--foreground` retains terminal-owned execution; `--no-autostart` omits login registration. Windows CMD/PowerShell uses the [managed WSL installation](windows-installer.md). Native Windows host code remains available as a separate implementation, but is not the default npm installation route.

The [curl bootstrap](shell-installation.md) supplies a pinned private Node and
standalone CLI without host npm, then uses this same execution contract. Inside
existing WSL 2, login registration uses a per-user Windows task for the current
distribution and Linux user, and browser opening uses Windows interop. Native
Linux retains user systemd; macOS retains launchd. Source `./mew setup` remains
the separate local-build route.

On a fresh installation, choose the administrator email and password in the browser. The [first-administrator contract](first-owner-setup.md) retains the private, locally armed setup capability; ordinary HTTP cannot enable enrollment. After successful creation, agent setup opens first; closing it opens a popup with **Mewlink**, **Tailscale**, and **Cloudflare Tunnel**. Owners can reopen agent setup from **Menu → Agent Set**. The same popup opens from **Menu → Mewlink**. Provider accounts, network permissions, and external sign-in remain under the user's control; installation does not silently register a remote account or expose the host publicly. [Remote access](remote-access.md) owns the provider controls and limits.

Existing accounts, registrations, and database contents are reused. On POSIX, running the command again reopens the existing instance through private OS-user control instead of starting another server. `npx mew-ide status` checks readiness and `npx mew-ide stop` stops that instance without deleting data or disabling the next login's startup. `npx mew-ide disable-autostart` removes only Mew's login registration. In foreground mode, Ctrl+C stops the owned host. Sleep and remote connectivity limits follow the remote-access contract.

## Execution Contract

Only `apps/cli` is the published npm package, named `mew-ide`, with `mew-ide` and `mew` executable aliases. The root source workspace also has `mew-ide` metadata but has no executable entry; do not publish the root. The npm organization name does not reserve or replace the unscoped package name.

| Item | Boundary |
| --- | --- |
| npm package | `apps/cli/`, `mew-ide`, executables `mew-ide` and `mew`, initial version `0.1.0` |
| Supported runtime | Pinned to Node.js major 24. Linux glibc 2.35 or later and macOS 15 or later, each on x64/arm64. Native Windows x64/arm64 follows its [platform contract](windows-native.md); the [guided Windows installer](windows-installer.md) uses managed WSL 2 for feature compatibility |
| Executable distribution | `mew-cli-v<버전>` releases in GitHub `s-saens/mew`, `mew-runtime-<platform>-<arch>.tar.gz` |
| Default working folder | The current folder where the command is run. Change with `--workspace` |
| Configuration | Reads existing XDG `mew/config.env`, with CLI options and explicit environment variables taking precedence. Uses the folder for this run as the working folder instead of the previous `MEW_WORKSPACE` |
| Persistent data | Precedence: `--data-dir` → explicit `MEW_DATA_DIR` → existing config.env → XDG data `mew/`. Not stored in the app cache |
| Runtime storage | A durable sibling `<data-dir>.runtimes/<version>-<OS>-<arch>-node24`, outside account storage and temporary npx downloads. Override with `--cache-dir` |
| Database storage | Private sibling `<data-dir>.postgres`; explicit `DATABASE_URL` retains the external database instead |
| Local access | Loopback `127.0.0.1`, default port 5000 with automatic fallback through 5019. Explicit ports fail on conflict; `--port 0` selects an available port |
| First owner | Browser creation through a locally armed one-time link. Explicit `--owner-email` retains temporary-password automation; ordinary HTTP cannot enable enrollment |
| Multiple existing owners | Select an existing owner with `--owner-email`. If unspecified, uses the first owner in the existing account list |
| Browser | Opens the local address after the server is listening, including a private setup fragment when needed. `--no-open` skips opening; terminal output contains only the base address |
| Installer bridge | `--installer` disables browser opening and reserves stdout for readiness records. A private stdin request reopens or refreshes setup; other output goes to stderr |

For an existing owner, before starting the server it saves that owner's `user-ui-state.json` working folder as the folder for this run. A newly created browser owner receives the initial folder after the account claim. Other accounts' folders, accounts, conversations, and permissions are preserved. If an existing clone used `.data/` inside the repository, specify `--data-dir /절대/기존/mew/.data` explicitly. Arbitrary `.data/` found in the working folder is not automatically treated as account storage.

`apps/cli/src/lock.mjs` prevents duplicate launcher runs against the same data, and `server/instance-lock.ts` ensures the source server and CLI host own a shared `DATA_DIR/server.lock`. Locks held by live PIDs are not taken over, and locks for dead PIDs are recovered under a separate recovery lock. On exit, only the lock matching its own token is deleted. The CLI does not start if the XDG `mew.pid` from the previous version `./mew` is still running. Older manually started versions without pidfiles are outside automatic detection, so users must stop them before switching. The launcher does not forcibly stop existing servers.

## Download and Package Boundaries

After comparing the target file checksum in `SHA256SUMS` against the actual bytes, the archive is extracted in a temporary folder in the user cache. Absolute paths, parent-directory escapes, links outside the package, device files, and excessive sizes are rejected, while internal npm executables and relative workspace links are preserved. After checking the manifest's version, platform, architecture, Node major, entry point, and required files, the directory is made available atomically. Concurrent downloads reuse a single completed cache. Failed downloads clean up their temporary folders.

The archive cache for an already verified version is reused without another archive download. Browser dependency preparation may still need network access when a required browser is missing. If the cache is corrupted, users are instructed to delete only that executable distribution's folder, without deleting account data or user projects. Checksums verify release transfer integrity; they are not signatures that independently establish whether the provider's account has been compromised.

The runtime manifest must declare `browserDependencies: "server/browser-dependencies.js"` and include that installer. Initial preparation uses `--install` in the invoking terminal before background launch; login startup uses `--check`, so it cannot wait for a hidden sudo prompt or silently install software. OS authorization may still be required for missing native libraries. npm itself may ask permission to download an uncached package; `npx --yes mew-ide` suppresses that npm-owned confirmation. Neither is a Mew configuration questionnaire. Browser preparation finishes before the application's 60-second readiness timer starts. The [browser dependency contract](browser-dependencies.md) owns browser platform limits.

The POSIX daemon exposes only a private local socket in a mode-0700 control directory, with a mode-0600 socket. When the state path exceeds the Unix socket address limit, the CLI uses a short socket path in a mode-0700 directory under /tmp and verifies that the current OS user owns that directory. A repeated launch asks the host to rotate a pending setup capability through its existing IPC and opens the returned URL without writing it to logs or disk. The control endpoint and managed database live outside account data so provisioning does not make a fresh installation look like damaged account storage. Startup uses pinned installed files and never executes `npx` or selects a newer version at login.

The runtime then starts `server/cli-host.js` as a separate process. IPC in `cli-host.ts` carries listener addresses, the private first-owner setup URL and refresh requests, public remote status, and explicit legacy owner-creation responses. It does not send registration keys or login-session tokens. The raw setup capability travels only to the trusted launcher and browser, not ordinary logs. The [first-administrator contract](first-owner-setup.md) defines the installer stdin/stdout protocol. Parent termination, IPC disconnection, and SIGINT/SIGTERM cause the host to shut down.

The launcher sets `MEW_DISTRIBUTION=release`. App update status checks in this distribution do not call Git. It rejects source builds, restarts, pull operations, and individual updates to bundled tmux, and directs users to stop Mew and rerun their installation entry: `npx mew-ide@latest` or the newer published curl script. Existing update boundaries for external agents remain in place. Automatic replacement of the running app is not provided, and npx also handles checking the latest npm version.

## Verification and application

Isolated fixtures check CLI downloads, caching, escape links, duplicate launches, owner creation, conflicts, cancellation, working folders, actual readiness events, remote status filtering, runtime source transformation, worker/import/export handling, exclusion of personal files, and blocking release operations. Native loading, supported platforms, and actual external connectivity checks in the [release procedure](../operations/cli-release.md) are separate gates.

The implementation work record distinguishes local checks from clean-platform installation, OS login/reboot acceptance, and publication. Until the matching runtime release and npm package are published and accepted on supported hosts, these commands describe the delivery contract rather than an available public installer.

## Documentation and product resources

The built-in documentation skill includes the original text, shared references, pinned external skills, and licenses from `resources/skills/`, and Mewpet MCP help includes `resources/help/`. Project knowledge `.mew/docs` and tasks, freeform documents, and production source materials `assets/` are not included in the product runtime. The app's `public/mewcat` contains the final files read by the manifest. Cargo manifests, lockfiles, and Rust source needed to verify native helper versions and sources are included; test fixtures, local vendor directories, and target directories are excluded.
