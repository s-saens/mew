---
title: "Security operations guidelines"
description: "Guidelines for operators sharing a Mew instance to assess roles and file permissions, owner and manager project access, server control features, Mewlink login and browser access revocation, and data retention risks. Links implementation, authentication, and storage details for each feature to development contracts and explains how to report vulnerabilities privately."
created: 2026-10-22
updated: 2026-10-26
상위파일: "MOC.md"
---

# Security operations guidelines

Before providing an instance to others, review this document to determine which features to allow and what to expose and retain. The [access model](access-model.md) owns operating locations and ports, [deployment operations](deployment.md) owns checks before and after public exposure, and the [access control contract](../../.mew/docs/development/access-control.md) owns server permission decisions, storage, and real-time revocation.

## Before sharing accounts

Mew supports not only file editing but also running commands on the server through terminals and agents. Allowing server control features such as agents, terminals, remote desktop, and the server file explorer grants access within the server OS user's permissions. These features default to manager and owner, but the owner can also allow individual features for members. **Allow server control features only for people you trust enough to give an SSH account.**

Per-file permissions apply only to the Mew file API. They do not restrict file access through shells or agents. Do not also allow server control features for accounts from which specific files must be hidden. Run public installations as a dedicated, non-administrator OS user with access only to the required projects.

## Roles

Roles are guest &lt; member &lt; manager &lt; owner and define **feature defaults**. The owner adjusts feature and file permissions for each account and for guests in account management.

| Default features | guest | member | manager | owner |
| --- | --- | --- | --- | --- |
| View files and edit contents | Allowed paths only | Allowed | Allowed | Allowed |
| File creation, deletion, renaming, uploads, and history | Blocked | Allowed | Allowed | Allowed |
| DB, collaborative editing, comments, and chat | Blocked | Allowed | Allowed | Allowed |
| Agents, terminals, localhost app access, remote desktop, and Android | Blocked | Blocked | Allowed | Allowed |
| Server file explorer, Git workbench, system, and scheduled tasks | Blocked | Blocked | Allowed | Allowed |
| Project listing, addition, switching, icon changes, folder creation, and Git clone/initialization | Blocked | Blocked | Allowed | Allowed |
| Account management and docs settings/import/export | Blocked | Blocked | Blocked | Allowed |

The last row contains administrative features determined by role and cannot be delegated through the feature table. The last owner cannot be demoted or deleted, and users cannot delete their own currently logged-in account. Server control features cannot be enabled for guests. Terminal-based agents require both agent and terminal permissions.

### Per-file permissions

Within the file features allowed for an account, apply the most specific rule for each path: inherit, block, read, or edit. Logged-in accounts are allowed access when no rule exists, so they can also read `.env*` unless explicitly restricted. Guests are blocked from all paths until explicitly allowed, and `.env*` is denied even when an allow rule exists. Permissions belong to the local user ID and actual workspace root and cannot be bypassed through aliases or symbolic links.

The server also checks file permissions for searches, downloads, attachments, and collaboration. Features that handle project-wide data, such as Git and DB administration, are denied if any files within the project have partial restrictions. The general file API blocks access to the server data folder, protected paths, and locations outside the workspace. This block remains in effect even if the actual data folder's name or location changes. Even the owner cannot rename or delete protected projects such as the app itself.

The server file explorer is a separate feature intended to provide access across the OS and does not apply workspace file boundaries or blocklists. Administrative operations such as docs import/export and workspace changes are owner-only. Specific decisions and exceptions follow the [access control contract](../../.mew/docs/development/access-control.md).

### Git operations and external account connections

Git operations run with the requester's feature and project access permissions and connected external account. Mew's Git connections do not automatically import existing OS credentials or change shared Git settings. Credentials stored under the same OS permissions cannot be isolated from users with shell or server file features. Terminals, general agents, and external clone operations retain the OS execution environment. Connections, storage, and cleanup on account deletion follow the [Git connection contract](../../.mew/docs/development/git-connections.md); operation follows [GitHub login](../guides/projects.md#github-login).

## Guest boundaries

The owner configures guest rules in **Account Management → File and Folder Permissions**. These rules apply to all visitors who are not logged in. Folder permissions are inherited by descendants, so check for separate allow rules on descendants when stopping sharing. File creation, deletion, renaming, history, shell access, DB access, collaborative editing, and chat are not allowed.

Inaccessible projects and files are hidden from the tree and search. presence also provides only paths accessible to the viewing account, and the total active session count and user and device lists are sent only to logged-in users. Public connection IDs are separate from authentication sessions.

Knowing an attachment link still requires read permission for that file. When sharing a document, also allow the required attachment paths. Policy changes are reflected in open connections and the UI but do not retroactively revoke downloaded data or running OS processes. The [access control contract](../../.mew/docs/development/access-control.md) defines server boundaries for attachments, sharing, and revocation.

## Mewlink device access

Mewlink manages device registration, listing, and deletion and optionally verifies external identities for Mew login on the host. A device address can be connected to directly without central login, but even files allowed through general guest sharing cannot be opened before local Mew login. Being the device registrant, possessing the random connection value, or having the same email address alone does not grant local user permissions.

New external users require owner approval and are registered as members without passwords upon approval. Existing email users can link to their own accounts using a verified Mewlink identity and a completed password login on the same connection. Linking one's own account does not create a new account or elevate its role. Roles, features, and file permissions belong to the same local user ID. Moving or removing a link revokes previous external access while preserving the existing account, data, and local password.

Direct connections before login expose the host IP and connection resources to visitors. Even with request and concurrent connection limits and unauthenticated connection timeouts, the exposure differs from requiring central login first. Authentication and connection lifetimes, verification, and the scope of production application follow the [remote access contract](../../.mew/docs/development/remote-access.md).

### Keeping browser logins and revoking access

If a logged-in user consents to **Stay signed in on this browser → Remember** in the central parent, the login is retained and bound to the current local account, authentication method, and host-specific browser key. It expires after 90 days of inactivity, and its lifetime is renewed during valid use. Password changes, external connection revocation, account deletion, and current permission checks also apply. Restoring a connection does not automatically replay previous saves or commands.

The central device owner can disconnect all tabs for a specific key and block reconnection through **Manage Connected Browsers → Revoke Access** on the dashboard. This does not apply to other browsers or hosts. **Unregister** is a separate revocation for the entire host.

A lost device with a persistent login can continue using server control permissions. Preventing browser key extraction does not prevent same-origin XSS, malicious extensions, or OS compromise from using the key. Someone who clears browser data and creates a new key may also authenticate again with a valid password or approved external account. If authentication methods have also been compromised, change the password and revoke external connections.

Reauthentication is required after expiration or security revocation. Connections are not guaranteed to remain active during sleep or recover from every network transition. Key and token storage and lifetimes follow the [browser storage contract](../../.mew/docs/development/browser-storage.md#storage-scope-for-remote-local-account-connections), and the design rationale follows the [browser trust decision](../../.mew/docs/decisions/0015-trusted-browser-access.md).

## Authentication

Only local email accounts or explicitly linked external identities can log in; there is no public signup. Temporary passwords must be changed at the first password login before work features can be used. Approved external login is a separate authentication method, and editing an external profile does not remove the temporary password change requirement. Changing a password disconnects password sessions on other devices. Authentication state and revocation during active connections follow the [access control contract](../../.mew/docs/development/access-control.md), and Mewlink authentication lifetimes follow the [remote access contract](../../.mew/docs/development/remote-access.md).

## Agent window

Agent file tools and commands run with the permissions of the OS user running the server. They can access files outside the workspace, and there is no separate OS-level isolation. Switching the project being viewed does not isolate execution permissions.

**The default permission mode is “Allow All,” which runs without approval and applies to agent windows and scheduled tasks.** If prompt injection from an untrusted document or webpage succeeds, commands may run without intermediate confirmation. Change the mode for each session in the window or adjust the server default. Runtime installation also runs with the server OS user's permissions. Mode and installation settings follow [agent runtimes](../configuration/agent-runtimes.md), and session and execution contracts follow [agent sessions](../../.mew/docs/development/agent-sessions.md).

## Remote desktop

Remote desktop provides the server's actual logged-in desktop, not a virtual screen for each account, and includes the Windows screen under WSL. A Windows virtual display is also an extended screen of the same logged-in desktop. Each server is limited to one control connection. Multiple servers under the same OS user do not share a control lock, so run only one server for remote control.

OS approval, active users, locking, and input revocation follow the [remote desktop contract](../../.mew/docs/development/remote-desktop.md) and [POSIX contract](../../.mew/docs/development/remote-desktop-posix.md). External direct access allows only temporary connections for active sessions, preserves existing firewall blocks and mappings for other apps, and does not bypass a VPN through an arbitrary physical LAN. Firewall approval and cleanup follow the [connectivity contract](../../.mew/docs/development/remote-desktop-connectivity.md); driver permissions, official signing, and the scope of installation checks on actual hardware follow the [virtual display contract](../../.mew/docs/development/remote-desktop-virtual-display.md).

## Virtual login screens and localhost apps

The general internal DOM browser has been removed. OAuth and account management use a separate login video screen on Linux/WSL, isolated from the host desktop's input and clipboard. Input, screen content, and authentication codes are not saved or logged. CPU/GPU resources and server OS permissions are shared, so this is not a file sandbox.

A login screen belongs to the account that created it and the feature permissions for its authentication task. Agent authentication checks agent permission, while GitHub connections check Git or file editing permission; no separate general browser permission is required. Users can view, provide input to, and close only their own screens. Support conditions, shutdown lifetimes, and the scope of verification of actual authentication follow the [virtual login screen contract](../../.mew/docs/development/login-desktop.md).

`/<port>` app access requires login and permission for the localhost app access feature. Targets are allowed loopback HTTP(S) ports; Mew's own port and bypasses to other targets are denied. Development app JavaScript runs on the connecting device. Apps do not share an origin with the Mew session or full API permissions, and the host's provider credentials, Mew cookies, and visitor IP are not forwarded to the app upstream. Isolation, proxying, and storage standards follow the [localhost app preview contract](../../.mew/docs/development/port-preview.md).

## Android Panel

Android screen viewing and input are protected at the same level as a local development server. Gateway addresses are restricted to loopback, and SDK paths and acceleration status are treated as server operational information. Status queries alone do not start or install the Emulator or create AVDs. Explicit preparation operations and gateway permissions follow the [Android feature contract](../../.mew/docs/features/browser-android-remote-desktop/android-environment-checks-and-screen-connection.md).

## Settings for external access

The default listening address is loopback (`127.0.0.1`). Check the exposure scope when changing the listening address for direct LAN access. For public installations, retain the loopback bind and public entry point according to [deployment operations](deployment.md).

- Use Mewlink or an HTTPS proxy, tunnel, or VPN instead of exposing the Mew port directly to the internet.
- Use HTTPS. The proxy must forward the original Host and whether the request used HTTPS, and relay WebSocket upgrades.
- Minimize the number of accounts and server control permissions, and use guest path rules for read-only sharing instead of member accounts.
- Do not expose the development server externally, because it serves source code and assets before building.

The current distribution does not support running the app in a container. Do not expose it on the assumption that a container isolates shell access. Installation and application of changes follow [native server deployment](../deployment/native.md), and boundaries for each connection type follow the [access model](access-model.md).

## Chat and direct messages (DMs)

The chat screen shows only conversations you participate in, but **administrators who can read server files can also read other people's DMs.** Conversations are stored in plaintext on the server, so do not leave content that must be hidden from accounts with shell or server file permissions. Read receipts retain each user's last viewing time.

Only the most recent 500 lines are retained across group chats and DMs combined. Older conversations are deleted when this limit is exceeded, so a high volume of group chat messages can also cause DMs to be deleted. Guests cannot view or send chat messages.

## Stored data

Restrict access to server data and backups, including accounts, sessions, permission rules, and conversations, and do not commit them to the repository. Locations and settings follow [environment configuration](../configuration/environment.md), and backup and recovery scope follows [server deployment](../deployment/native.md#4-updates-backups-and-failure-checks). OS user access must be restricted separately from file permissions.

Do not store provider OAuth bearer tokens in the Mew UI or runtime settings. Any such keys remaining from earlier installations are removed at startup. There is also no feature for the server to request arbitrary URLs to retrieve external link titles and descriptions. Uploads are accepted only on temporary disk and limited to 25 MiB per file and 20 uploads per 15 minutes per account. Large file sharing is not supported.

The contents of recently opened documents may remain on the browser device. The new persistent content cache uses IndexedDB scoped by account and root; only valid entries from the existing localStorage cache are migrated, and their originals are deleted after successful migration. Logging out or switching accounts also invalidates previous cache operations still in progress. Retroactive revocation of downloaded data is not guaranteed, so log out after using a shared device. Cache lifetimes, cleanup, and the distinction from unsent drafts follow the [file content cache](../../.mew/docs/development/file-loading.md) and [browser storage contract](../../.mew/docs/development/browser-storage.md).

## Reporting vulnerabilities

Please report vulnerabilities privately through this repository's GitHub Security Advisories instead of public issues. Include reproduction steps and the output of `./mew status`.
