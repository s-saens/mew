---
title: "Mew Access Model — Installation Locations, Ports, and OS Execution Boundaries"
created: 2026-07-27
updated: 2026-10-22
description: "Explains project locations, ports, OS execution permissions, and access boundaries for a standalone Mew installation. Links roles, sharing, and data retention to the security operations standards, and actual authorization decisions to the access control contract."
---

# Access Model

[Security Operations Standards](security.md) is the canonical source for roles, file permissions, guest sharing, and authentication. This document explains the location, port, and OS permission boundaries of server operations. For execution instructions, follow the [Korean User Guide](../guides/getting-started-ko.md); for checks on public installations, follow [Deployment Operations](deployment.md).

## Source and Working Directories

The source for this development environment is at `~/dev/mew` and is separate from the Liiiiv workspace. The Mew repository also owns the documentation, guidelines, and decisions. Other installations may use any source location.

The server's default working directory is specified by `MEW_WORKSPACE`, and each account's active project is isolated through the request context. When moving the source folder, also update open projects and saved paths according to the [relocation procedure](project-location.md). [Architecture](../../.mew/docs/development/architecture.md) owns the detailed execution and storage contracts.

## Ports

| Port | Purpose | Access scope |
| --- | --- | --- |
| 4999 | Vite development UI and HMR | Restricted to a private development network or loopback |
| 5000 default | Mew server | Follows the configured bind, HTTPS, and Mewlink connection policies |

The development server serves source code and pre-build assets, so do not use it as a public entry point. The current [login virtual screen](../../.mew/docs/development/login-desktop.md) transmits video and input and does not use CDP or DOM relaying. The CDP approach used at the time is preserved in [past experiments](../../.mew/docs/history/browser-dom-oauth.md).

## OS permission boundary

Terminals and agents run with the permissions of the OS user running the server. Repository separation and project selection do not isolate OS file access. Users with shell access can also access other folders and secrets available to that OS user, so public installations must use a dedicated non-administrator user and only the necessary folders.

File API path and role validation and shell permissions are separate boundaries. Current access scopes by role follow the [security policy](security.md) and [access control contract](../../.mew/docs/development/access-control.md). Do not make company-wide project, account, or service lists required references for Mew operations.

## Previous operational basis

The tailnet, issued accounts, and workspace exposure scope recorded in the Liiiiv environment are preserved in the [previous access model](../../.mew/docs/history/liiiiv-access-model.md). The operational state at that time does not represent the current installation's state or permission policy.
