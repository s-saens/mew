---
title: "Single-Command Execution and Prebuilt Distribution"
description: "The distribution contract for CLI execution, configuration, updates, and separation of persistent data; inclusion of bundled skills and tool help in resources; exclusion of project documentation and authoring sources; and preservation of required native source."
updated: "2026-10-29"
상위파일:
  - "architecture.md"
  - "../operations/cli-release.md"
---

## User Flow

After the first release and npm package are published, run `npx @liiiiv/mew-cli@latest` from a working folder on a computer with Node.js 24 installed. The launcher downloads the server, UI, and dependencies for that version, OS, and architecture and runs the local server in the foreground. Cloning the app repository, building TypeScript/Vite on the user's computer, compiling C/C++, and installing tmux are not required. Git operations require Git on the host; installation and authentication for external AI tools and remote desktop OS permissions follow existing procedures.

If no owner exists, it asks for an email address and displays a temporary password in the terminal. Existing accounts are reused without resetting their passwords. After logging in, change the password and proceed with existing Mewlink registration through **Mewlink → Remote Access → Register Device**. The launcher prints a QR code when the registration completion link or online access address changes. It does not add new central authentication or anonymous work permissions. Initial registration requires Mewlink login in the browser and selection of a device name.

Existing registration is reused on the next run. Ctrl+C stops the local server and preserves persistent state. Sleep, central disconnection, WebRTC direct connection limitations, and the scope of actual external network verification follow the [Remote Access Contract](remote-access.md).

## Execution Contract

The `mew-ide` metadata in the root `package.json` and the executable package `apps/cli` are separate. The root does not expose `main` or `bin`; the actual `mew` command is provided by `bin/mew.mjs` in `@liiiiv/mew-cli`.

| Item | Boundary |
| --- | --- |
| npm package | `apps/cli/`, `@liiiiv/mew-cli`, executable `mew`, initial version `0.1.0` |
| Supported runtime | Pinned to Node.js major 24. Linux glibc 2.35 or later and macOS 15 or later, each on x64/arm64. Windows uses the Linux environment in WSL 2 |
| Executable distribution | `mew-cli-v<버전>` releases in GitHub `s-saens/mew`, `mew-runtime-<platform>-<arch>.tar.gz` |
| Default working folder | The current folder where the command is run. Change with `--workspace` |
| Configuration | Reads existing XDG `mew/config.env`, with CLI options and explicit environment variables taking precedence. Uses the folder for this run as the working folder instead of the previous `MEW_WORKSPACE` |
| Persistent data | Precedence: `--data-dir` → explicit `MEW_DATA_DIR` → existing config.env → XDG data `mew/`. Not stored in the app cache |
| Executable cache | `${XDG_CACHE_HOME:-~/.cache}/mew/runtimes/<버전>-<OS>-<arch>-node24`, change with `--cache-dir` |
| Local access | loopback `127.0.0.1`, configured port or 5000. `--port 0` selects an available port |
| First owner | `--owner-email` or interactive email entry. In noninteractive mode, exits without creating an account if no email is provided |
| Multiple existing owners | Select an existing owner with `--owner-email`. If unspecified, uses the first owner in the existing account list |
| Browser | Opens the local address after the server is actually listening. Skip with `--no-open`; the address is displayed in the terminal even if automatic opening is unavailable |

Before starting the server, it saves the selected owner's `user-ui-state.json` working folder as the folder for this run. Other accounts' folders, accounts, conversations, and permissions are preserved. If an existing clone used `.data/` inside the repository, specify `--data-dir /절대/기존/mew/.data` explicitly. Arbitrary `.data/` found in the working folder is not automatically treated as account storage.

`apps/cli/src/lock.mjs` prevents duplicate launcher runs against the same data, and `server/instance-lock.ts` ensures the source server and CLI host own a shared `DATA_DIR/server.lock`. Locks held by live PIDs are not taken over, and locks for dead PIDs are recovered under a separate recovery lock. On exit, only the lock matching its own token is deleted. The CLI does not start if the XDG `mew.pid` from the previous version `./mew` is still running. Older manually started versions without pidfiles are outside automatic detection, so users must stop them before switching. The launcher does not forcibly stop existing servers.

## Download and Package Boundaries

After comparing the target file checksum in `SHA256SUMS` against the actual bytes, the archive is extracted in a temporary folder in the user cache. Absolute paths, parent-directory escapes, links outside the package, device files, and excessive sizes are rejected, while internal npm executables and relative workspace links are preserved. After checking the manifest's version, platform, architecture, Node major, entry point, and required files, the directory is made available atomically. Concurrent downloads reuse a single completed cache. Failed downloads clean up their temporary folders.

The cache for an already verified version is reused without network access. If the cache is corrupted, users are instructed to delete only that executable distribution's folder, without deleting account data or user projects. Checksums verify release transfer integrity; they are not signatures that independently establish whether the provider's account has been compromised.

The runtime starts `server/cli-host.js` as a separate process. IPC in `cli-host.ts` carries only account setup requests, temporary passwords, actual listener addresses, and public remote status; it does not send registration keys or session tokens. Parent termination, IPC disconnection, and SIGINT/SIGTERM cause the host to shut down.

The launcher sets `MEW_DISTRIBUTION=release`. App update status checks in this distribution do not call Git. It rejects source builds, restarts, pull operations, and individual updates to bundled tmux, and directs users to rerun `npx @liiiiv/mew-cli@latest`. Existing update boundaries for external agents remain in place. Automatic replacement of the running app is not provided, and npx also handles checking the latest npm version.

## Verification and application

Isolated fixtures check CLI downloads, caching, escape links, duplicate launches, owner creation, conflicts, cancellation, working folders, actual readiness events, remote status filtering, runtime source transformation, worker/import/export handling, exclusion of personal files, and blocking release operations. Native loading, supported platforms, and actual external connectivity checks in the [release procedure](../operations/cli-release.md) are separate gates.

App builds, starting/restarting the current server, GitHub Release creation, and npm publishing were not performed during this implementation work. Therefore, npm commands for the unpublished package are not presented as an already available installation path.

## Documentation and product resources

The built-in documentation skill includes the original text, shared references, pinned external skills, and licenses from `resources/skills/`, and Mewpet MCP help includes `resources/help/`. Project knowledge `.mew/docs` and tasks, freeform documents, and production source materials `assets/` are not included in the product runtime. The app's `public/mewcat` contains the final files read by the manifest. Cargo manifests, lockfiles, and Rust source needed to verify native helper versions and sources are included; test fixtures, local vendor directories, and target directories are excluded.
