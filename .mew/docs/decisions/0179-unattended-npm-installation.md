---
title: "0179: Install Mew and its database from one npm command"
description: "Accepts the unscoped mew-ide installer with default configuration, managed Postgres, durable background/login startup, Windows WSL preparation, and one browser remote-access chooser. Preserves private first-owner setup and separates publication from implementation."
status: accepted
date: "2026-11-17"
---

# 0179: Install Mew and its database from one npm command

## Context

The requested experience is `npx mew-ide` after the user installs Node.js/npm.
Requiring Git cloning, compiler installation, a Postgres connection string, or
answers to a terminal setup questionnaire prevents that experience. Restarting
the computer should not require returning to a Linux terminal to launch Mew.

The existing prebuilt CLI, [browser-first administrator setup](0142-browser-first-owner-setup.md),
and [private Windows WSL installer](0143-windows-installation-wizard.md) provide
the foundations. The npm organization name is separate from the unscoped package
name; initial publication must verify the latter's availability and ownership.

## Decision

Publish only `apps/cli` as `mew-ide`, retaining `mew` as an executable alias.
Keep existing immutable `mew-cli-v<version>` runtime tags. The installer uses
defaults for the workspace and local port, provides a private local Postgres
cluster automatically, and installs durable launcher files and login startup.
POSIX launches run in the background and expose private OS-user control for
readiness, reopening, and stopping. Explicit foreground execution remains.

Windows CMD/PowerShell prepares the installation-owned WSL environment using
the existing installer sources. It preserves unrelated distributions, exposes
required Windows approval/restart boundaries, and opens the Windows browser.
This extends ADR 0143's delivery entry point; it does not restore Mewnager or
remove the separate native Windows implementation.

Use the checksum-pinned runtime and pinned embedded Postgres distribution.
Keep database storage and versioned executable files outside the account data
directory, both for preservation and for conservative fresh-owner detection.
Honor an explicit external `DATABASE_URL`. Refuse incompatible cluster majors
instead of resetting or silently migrating existing data.

The first administrator still chooses an email and password through the
locally armed, one-time browser capability. Successful creation opens one popup
with Mewlink, Tailscale, and Cloudflare Tunnel. **Menu → Mewlink** opens the same
popup. Provider login and external network authorization remain browser actions;
local installation does not silently create remote accounts or expose a host.

## Alternatives and rationale

- Source setup for every user requires development dependencies and local builds.
- Requiring Docker or an existing database introduces another installation flow.
- SQLite or a browser database would change the existing Postgres table contract.
- Rerunning npx at every login adds network/version selection to OS startup.
- Requiring users to enter WSL leaves platform preparation with the user.
- Public unauthenticated administrator enrollment would weaken ADR 0142's
  local-authority boundary and is unnecessary for this browser experience.

## Consequences

The normal Mew installation asks no application configuration questions. npm's
own uncached-package confirmation and OS elevation/reboot requirements remain
outside that application promise. Node.js 24 remains a host prerequisite.

The product owns Postgres preservation, process cleanup, version compatibility,
redistribution notices, and clean-platform acceptance. Windows's initial managed
WSL route remains x64-only. Background/login behavior requires actual OS tests;
unit fixtures do not establish reboot acceptance or public package availability.

Current contracts belong to [CLI distribution](../development/cli-distribution.md),
[managed Postgres](../development/managed-postgres.md),
[Windows installation](../development/windows-installer.md), and
[remote access](../development/remote-access.md). The
[work record](../work/unattended-npm-installation.md) records actual checks and
remaining publication/platform gates.
