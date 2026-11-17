---
title: "0180: Add a curl bootstrap alongside npm and source installation"
description: "Accepts a versioned shell bootstrap with private pinned Node and a standalone CLI bundle. Extends the unattended installer to existing WSL distributions using Windows login tasks while retaining npm and source setup."
status: accepted
date: "2026-11-17"
---

# 0180: Add a curl bootstrap alongside npm and source installation

## Context

[ADR 0179](0179-unattended-npm-installation.md) establishes the unattended npm
entry and browser account setup. Users also need a single command inside an
existing WSL distribution without first installing npm or cloning Mew. The
source `./mew setup` route remains useful for contributors and source builds.

An existing WSL distribution may lack a working user systemd service manager.
A user service alone also does not arrange for Windows login to launch that
distribution. The Windows npm route's owned distribution is a separate path.

## Decision

Keep three entries: npm, `curl .../install.sh | bash`, and source setup. The
shell script installs a checksum-pinned private Node distribution and a
version-matched standalone CLI bundle from the existing immutable GitHub
release. It delegates application setup and execution to that same CLI.

The shell installer uses private, versioned user paths outside account data,
preserves unrelated files, and installs a wrapper without editing shell
profiles. It includes production dependencies and redistribution notices;
the existing binary-runtime and Postgres publication gates still apply.

For CLI execution inside existing WSL 2, replace the earlier generic POSIX
systemd assumption with an owner-scoped Windows login task. Invoke the same
distribution and Linux user using fixed installed paths. Open the Windows
browser through the existing safe PowerShell transport. Preserve the dedicated
WSL route for Windows CMD/PowerShell npm installation.

## Alternatives and rationale

- Installing global Node/npm through the host package manager adds OS-specific
  system changes and version selection before Mew can run.
- Cloning and building from the curl script repeats the source route and
  introduces compiler requirements and longer installation.
- A separate implementation of application setup would duplicate database,
  enrollment, and lifecycle contracts.
- Downloading from npm during login adds availability and version selection to
  a path that must use installed files.
- Requiring WSL users to configure systemd or always open Ubuntu manually
  fails the intended reboot-and-login experience.

## Consequences

Shell-route users supply a supported OS terminal and basic download/archive
tools; the bootstrap supplies Node. OS authorization and provider sign-in
remain separate from Mew configuration. Windows interop and task registration
must work in an existing WSL installation.

Releases gain a standalone CLI archive and script, both in `SHA256SUMS` beside
the six platform runtimes. All assets and the script version must agree.
Publishing and clean-platform login acceptance remain explicit gates. Current
contracts belong to [shell installation](../development/shell-installation.md)
and [CLI distribution](../development/cli-distribution.md).
