---
title: "First administrator setup"
description: "Defines locally armed, one-time browser creation of the first owner, fresh-install detection, durable closure, account locking, and installer IPC. Covers token privacy, recovery, and existing-account preservation."
updated: "2026-11-05"
---

# First administrator setup

A new installation creates its first `owner` in the browser. The user chooses an email and password and enters the workspace already signed in. Existing installations keep their accounts and passwords. This is installation bootstrap, not public signup; subsequent accounts follow [account management](../../../docs/configuration/accounts.md).

## Fresh installation and local authority

Only a local CLI or installer can call `prepareFirstOwnerSetup` before loading the application server. HTTP requests cannot enable or reset setup. `server/account-storage.ts` owns `DATA_DIR/owner-setup.json` and the shared account lock; `server/first-owner-setup.ts` owns the capability and claim rules.

The account directory must contain no accounts. An existing `users.json`, including an empty one, or other persisted application state prevents an unmarked installation from becoming fresh. Only transient account, server, and CLI lock files are ignored. This conservative check treats damaged or partially restored installations as recovery cases.

The durable setup state is either `pending` or `closed`. Pending state contains a SHA-256 token hash, expiration, and optional initial workspace; the raw token is never persisted. The token has 32 random bytes encoded as 43 base64url characters and expires after one hour. A trusted local reopen rotates it and invalidates previous links. Expiration leaves setup pending so the UI can explain how to reopen it; expired links cannot create an account.

Any account creation seals setup, and reading an existing populated account store migrates it to closed state. Closure is written before account persistence and survives account deletion or loss of `users.json`. A crash between closure and account write requires local recovery. Do not remove the closure marker to repair missing accounts; restore the account store or use the authorized host user-management CLI.

## Account transaction and HTTP boundary

`accounts.lock` serializes account mutations across the application and local CLI. Every mutation reloads the authoritative store under the lock. Claiming setup rechecks the token, expiration, pending state, and absence of **all** accounts inside that transaction. Simultaneous claims can create only one owner. The ordinary password policy and hash are reused; the new credential has `mustChangePassword=false`.

| Request | Contract |
| --- | --- |
| `GET /api/auth/me` | Returns optional `setupRequired` along with the existing authentication status. Never returns a token or enables setup. |
| `POST /api/auth/setup` | Accepts `{ token, email, password, displayName? }`. A successful claim returns status 201, the existing authenticated status shape, and the normal session cookie. |
| Invalid fields | 400; no account is created. |
| Invalid or expired capability | 403; no account is created. |
| Closed setup, competing claim, or busy account transaction | 409; the client refreshes authentication state. |
| Repeated failed capability claims | 429 through the existing login throttling policy. |

Both responses use `Cache-Control: no-store`. Existing request-origin checks apply. Mewlink/P2P requests cannot bootstrap an owner, even with a token; their authentication status does not expose pending setup. Local setup does not grant guest access or change ordinary work authorization. See [access control](access-control.md).

## Browser entry

The trusted launcher opens `<local-base-url>#setup=<token>`. The fragment is consumed and removed with `history.replaceState` before account or workspace UI loads. It stays only in page memory, never browser storage, query strings, or API response bodies. Submission carries it in the JSON request body. Application and installer logs must not contain the private setup URL.

While setup is pending, the workspace is not imported. The compact setup form asks for email, password, and confirmation and uses the existing login theme and localized UI. A successful claim enters the workspace without a temporary-password step. Missing, rejected, or expired links show local reopen guidance. An already completed setup refreshes status and uses the ordinary login screen when a session is absent. Existing local guest behavior is unchanged outside pending setup.

## CLI and installer transport

The prebuilt CLI defaults to browser setup. Its host prepares state before loading the server, sends the base listener URL plus an optional private `setupUrl` over parent-child IPC, and saves the selected initial workspace after creation. Normal output prints the base URL; automatic browser opening receives the private URL. `--owner-email` preserves explicit local automation that issues a temporary password. `--no-open` requires the operator to arrange a trusted local setup or use explicit account administration.

`--installer` disables automatic browser opening and reserves stdout for structured readiness and reopen-error records. `MEW_INSTALLER_READY {"url":"..."}` supplies the address; `MEW_INSTALLER_ERROR {"code":"reopen-failed"}` reports a failed reopen without disclosing raw errors or credentials and without stopping the running host. Preparation, child output, and ordinary messages go to stderr. The Windows controller consumes these lines in memory and opens the Windows browser. Its private stdin command `MEW_INSTALLER_OPEN` requests another address through host IPC, rotating a pending setup capability without restarting the host. Once initialized, reopening returns only the base URL. Closing the installer control input shuts down its owned CLI host through the normal shutdown path.

For source installations, `./mew setup` calls the local `usersCli setup --json` operation before server startup, then prints a private setup link to the operator's terminal. It never writes that link to the server log. An operator can explicitly request a replacement local link with the same user CLI operation while setup remains pending; its JSON output is a credential and must not be recorded in shared logs. Existing user add/reset commands remain the account recovery tools.

If `accounts.lock` or its recovery guard is left unreadable or stale, setup fails closed. A local operator must establish that no account mutation process is active before repairing a stale file. This is not an automatic enrollment reset. Preserve the account store and closure marker.

[Decision](../decisions/0142-browser-first-owner-setup.md) · [CLI distribution](cli-distribution.md) · [Windows installer](windows-installer.md)
