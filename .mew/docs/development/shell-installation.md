---
title: "Shell bootstrap installation"
description: "Defines the curl installer for existing WSL 2, Linux, and macOS: pinned private Node, standalone CLI release assets, integrity and preservation checks, login startup, and reuse of automatic Postgres and browser enrollment. Includes macOS Bash compatibility, supported-host requirements and release boundaries."
updated: "2026-11-18"
---

# Shell bootstrap installation

The shell route complements npm and source installation. Its user-facing entry
belongs to the [installation guide](../../../docs/guides/getting-started-en.md#install-with-curl-after-the-first-release):

```bash
curl -fsSL https://raw.githubusercontent.com/s-saens/mew/main/install.sh | bash
```

The script is implemented in `install.sh`. Publication of that source and the
matching GitHub assets is separate from implementation. The initial assets are
not published; source setup remains available.

## Host and bootstrap contract

The installer supports macOS system Bash 3.2. Generated launcher paths preserve apostrophes, and cleanup preserves installation failures in the exit status.

Run as an ordinary user in an existing WSL 2 distribution, Linux glibc 2.35+,
or macOS 15+, on x64/arm64. Bash, curl, tar/gzip, standard text tools, and either
`sha256sum` or `shasum` must already work. The script does not require a host
Node, npm, Git, compiler, or repository checkout. Git and external agent tools
retain their own prerequisites.

The script pins Node.js **24.21.0** and the SHA-256 of each of its four official
`.tar.gz` archives. Update these values only after comparing the exact files
with the [official Node checksum manifest](https://nodejs.org/dist/v24.21.0/SHASUMS256.txt).
It installs the complete official distribution, preserving bundled notices.
It neither modifies a system Node installation nor edits shell profiles.

`MEW_INSTALL_VERSION_DEFAULT` must equal `apps/cli/package.json`'s version.
The matching `mew-cli-v<version>` GitHub release supplies
`mew-cli-standalone.tar.gz` and `SHA256SUMS`. The standalone archive contains
the CLI executable, source, license, and complete production dependency
closure, including dependency notices. Node supplies npm for Mew's child tools;
the user does not run npm during bootstrap.

Downloads allow HTTPS and HTTPS redirects only. Node uses its embedded hash;
the CLI uses exactly one matching entry in the release checksum list. Validate
before extraction or execution. CLI archives admit only relative files and
directories in the package whitelist; links, devices, traversal paths, and
unexpected root entries are rejected. Release checksums establish transfer
integrity, not an independent signature over a compromised publishing account.

## Paths and preservation

| Path | Purpose |
| --- | --- |
| `${XDG_DATA_HOME:-~/.local/share}/mew-bootstrap` | Private installation root, override with absolute `MEW_INSTALL_DIR` |
| `<root>/node/v24.21.0-<platform>-<arch>` | Verified private Node distribution |
| `<root>/cli/<version>` | Verified standalone CLI and production dependencies |
| `~/.local/bin/mew-ide` | Launcher wrapper, directory override `MEW_INSTALL_BIN_DIR` |

The script prints the absolute wrapper path because `~/.local/bin` may not be
on the current shell's `PATH`. The wrapper forwards all arguments without shell
interpolation and supplies the private Node to child tools. CLI service hosts
also put their actual Node directory on `PATH`, including after login.

These paths are separate from account data and managed Postgres. The
[CLI contract](cli-distribution.md) owns those stores and all application
configuration. Explicit `MEW_DATA_DIR` and existing CLI options retain their
meaning.

The root must be empty or carry Mew's exact ordinary-file marker. Preserve
unrelated commands and directories; reject root, marker, parent, and version
symlinks. Download and validate in a private temporary directory, then move
completed version directories into place. Serialize installation with a
root-local lock. Interrupted downloads remove their own temporary files and
lock; after a hard kill, remove only the reported stale installation lock.
Existing corrupt version directories are reported for targeted repair, not
silently erased. Wrapper replacement is atomic and rechecks its ownership.

## Application setup and login

After bootstrap, execute the existing CLI. It owns prebuilt-runtime download,
browser prerequisites, managed Postgres, default ports, private first-owner
enrollment, background execution, and the three-provider remote popup. The
shell route adds no configuration questionnaire. Restore terminal input when
the script arrived through a pipe so OS authorization can still use the
invoking terminal. Browser preparation may require OS authorization; Linux
arm64 retains the explicit compatible Chrome requirement.

Native Linux registers a user systemd service; macOS registers a LaunchAgent.
An existing WSL installation instead registers a Windows per-user login task:

- Invoke the same distribution and Linux user with fixed private Node and
  staged CLI paths and `--service`. Do not start the scheduled task during
  installation; the ordinary CLI starts the current instance.
- Identify the task by distribution, Linux user, data directory, and current
  Windows SID. Require its matching principal and Mew description before
  replacing or removing it. Never terminate or reconfigure a distribution.
- Pass private settings by filename. An explicit database connection is retained
  in the mode-0600 settings file. Credentials and first-owner capabilities do
  not appear in task definitions or browser-launch scripts.
- Require functioning Windows interoperability and PowerShell/Task Scheduler
  access. Fail clearly when unavailable. WSL user systemd is not required.
- Open the Windows browser through encoded PowerShell arguments, retaining
  private setup fragments only for the direct browser invocation. A failure
  reports recovery without printing the capability.

This uses [Windows interoperability](https://learn.microsoft.com/en-us/windows/wsl/wsl-config#interop-settings)
and [per-user scheduled tasks](https://learn.microsoft.com/en-us/powershell/module/scheduledtasks/register-scheduledtask).
Windows reboot/login and browser behavior still require clean-machine
acceptance. Fixtures do not establish that acceptance.

The installed wrapper supports `status`, `stop`, and `disable-autostart`.
Stopping preserves account and database data. For updates, stop the current
instance and rerun a newer published shell installer; login startup never
downloads or selects a newer release. A running instance is reopened rather
than replaced.

## Packaging and verification

`node apps/cli/tools/bundle-standalone.mjs --output <directory>` produces the
standalone archive, its checksum, a version-matched `install.sh`, and the
script checksum. It packages from a whitelist, rejects unsupported inputs,
retains transitive dependencies, and uses stable archive metadata. The
[release procedure](../operations/cli-release.md) owns publication and gates.

`npm run test:cli` includes isolated shell, standalone, and WSL fixtures. They
exercise failed transfers, checksum failures, preservation, cached relaunch,
quoted paths/arguments, dependency independence, immutable release asset
checks, Windows task payloads, and browser capability privacy. No fixture
registers an actual OS task or starts an application server. See the
[implementation record](../work/curl-installation.md) for checks actually run.
