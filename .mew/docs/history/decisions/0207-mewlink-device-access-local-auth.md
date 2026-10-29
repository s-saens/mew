---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
title: "0207 — mewlink accounts manage devices, and local mew authenticates device use"
description: "Define unauthenticated WebRTC connections to device addresses, local email and password authentication, boundaries for central registration and management accounts, restricted unauthenticated transport, and per-device session storage."
created: 2026-10-12
updated: 2026-10-12
---

- Date: 2026-10-12
- Status: Adopted
- Application status: implementation and isolated automated verification complete · not applied to production
- Partially supersedes: [0195](0195-mew-account-based-p2p-remote-access.md) — The scope that permitted device work through visitors' central account login, member mapping, and central session revocation
- Partially supersedes: [0203](0203-mewlink-workers-p2p-ui.md) — The scope that bound launch to accounts and central sessions and transferred the local UI only after authentication
- Decision makers: user (requested separation of registration and device access authentication), Codex (implementation contract)

## Background

The central account required for device registration and the mew account on the actual computer both appear during access. The user requested opening `mew.saens.kr/<유저이름>/<기기이름>` like a regular website and authenticating on that computer's mew login screen. Removing a login step alone does not guarantee faster connections or screen transfer.

## Decision

- Mewlink login owns device registration, deletion, the My Devices list, and central account management. Central login or matching email addresses do not grant permission to use local mew.
- Public device addresses initiate connections without central login. The central service verifies registered devices, origins, request limits, short-lived one-time launches, and WebRTC identity proofs. A visitor launch subject is a random value for the connection, not a local user identity.
- Retain checks of device keys, temporary browser keys, challenges, generations, SDP fingerprints, issuers, audiences, signatures, and expiration, along with single-use consumption, before and after connection. Device deletion, host shutdown, and connection lease expiration clean up connections.
- Before local login, provide only the installed static UI and authentication-only routes. Do not apply general guest file permissions to these routes, and block files, work APIs, and WebSocket. Temporary passwords additionally allow only the password-change route.
- Determine actual work permissions through local mew's approved email and password and server-side sessions. Retain existing contracts for password changes, account deletion, session expiration, roles, features, file permissions, and revocation. Do not use central member mapping UI or approvals in the device access flow.
- The browser's local session token for reconnection is separate from the central login cookie. Store it only in per-device storage on the central host, and use it to resume the session with the server over a WebRTC connection from the central origin. The launch frame on the app origin receives only a MessagePort stripped of credentials. Do not pass tokens to the installed app frame, and strip credential headers from bridge responses for the installed app and launcher. Do not send passwords to central authentication APIs, storage, or logs.
- Scope the installed app's data caches, tabs, drafts, and settings by local account and instance ID. On login, logout, or user switching, clean up the previous account's work and screens before applying the new scope.
- Centrally limit the rate of new connections by IP and device, and limit pending and total connections. Local login applies failure limits by the connecting IP signed by the central service and by local account. Terminate unauthenticated connections after a finite period; browser refreshes must not keep them alive indefinitely.
- Retain native installation, loopback binding, direct DataChannel transport, separation of login and app origins, and no TURN usage. Continue excluding central source code from the public mew Git repository. Host IP exposure and resource consumption risks before public connections are greater than with an approach that requires central login first.

## Rationale

Separating addressing and transport from user authorization, as in a regular web service, allows access with a local account without the device registrant's central account. Keep the existing login screen, passwords, and roles as the basis. Because unauthenticated visitors can connect to the host, apply transport and authentication boundaries and resource limits separately.

Technical basis: [WebRTC Security RFC 8827](https://www.rfc-editor.org/rfc/rfc8827.html), [OWASP Session Management](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html). The [Remote Access Contract](../../development/remote-access.md) owns the current implementation, verification, and production scope.
