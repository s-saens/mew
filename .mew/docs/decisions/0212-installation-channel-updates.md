---
title: "0212: Check for updates through the installation channel"
description: "Adopts channel-specific Mew update discovery for source clones, curl, npm, the Windows wizard, and Termux, with a shared update screen and explicit installer execution."
status: accepted
date: "2026-11-23"
---

# Check for updates through the installation channel

## Context

Mew's existing update screen compares a Git clone with `origin/main`. The installers for curl, npm, the Windows wizard, and Termux distribute versioned releases through independent channels. A new commit can reach Git before an installer is available, and a release in one channel says little about what another channel can install.

## Decision

Keep Git commit checks for clones. Have packaged installations report the channel and version of the running distribution so the app can check that channel's releases. Show the result in the same update screen and notification flow.

Use the existing Git update job for eligible clones. For versioned releases, show how to run the original installer. Treat missing or ambiguous installation metadata as an unavailable check. See the [app update contract](../features/appearance-accounts-operations/application-updates-and-operations.md#mew-version-checks-by-installation-method) for channel rules.

## Alternatives and consequences

One release lookup for every user would simplify discovery but could offer an update that the user's installer cannot download. Inferring the channel from the current platform would also misclassify Windows hosts that run npm in a dedicated WSL distribution or curl in an existing one. Carrying installation identity keeps the check tied to the installed artifact across daemon restarts and login startup.

Users can keep their existing installation method and update on their own schedule. Packaged update availability depends on the original channel's metadata and published assets. Each channel can publish independently, so version numbers can differ until the publishing pipelines converge.
