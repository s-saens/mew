---
title: "ADR 0015: Browser Trust and Selective Access Revocation"
description: "Decision to combine local authentication sessions with explicitly trusted, per-host non-extractable browser keys for automatic reconnection and allow the central owner to revoke browser access. Defines the 90-day inactivity lifetime, short connection leases, account and credential revalidation, consent bypass prevention, and security and production application boundaries."
created: 2026-10-19
updated: 2026-10-19
---

# ADR 0015: Browser Trust and Selective Access Revocation

## Status

Accepted. Implementation and isolated verification are complete; user builds, server application, and central deployment are performed separately.

## Background

Mewlink's central account owns device management and optional external identity verification, while the host's local account owns actual work permissions. Short connection leases and browser keys that change on each connection make it difficult to persistently identify a browser trusted by the user or revoke access for just one browser. Manual reconnection after sleep or network loss also interrupts persistent login and preservation of work drafts.

Extending connection leases indefinitely delays central disconnection and access revocation, while bearer tokens without expiration allow long-term reuse after theft. Browser trust and transport recovery need to be managed separately while preserving existing authentication and permission checks.

## Decision

After the user logs in with a local password or approved external identity and consents to **Stay signed in on this browser → Remember** in the central parent, issue a trusted session bound to the current account, authentication method, credential ID, and browser public key fingerprint. Renew its lifetime based on 90 days of inactivity and discard the previous bearer session. Reject resumption with a different key, and continuously check password changes, approved connection revocation, account deletion, and permissions. Trusted sessions for external authentication also verify the original approved connection and can resume independently of the central cookie.

Store a non-extractable Ed25519 key for each host instance in IndexedDB on the central origin, and share the key among tabs for the same host. Do not share one key across the entire origin, to reduce correlation of visits across different hosts. Downgrade new sessions to sessionStorage, then promote them to per-device localStorage only after confirming trust status, while retaining compatibility with previous 30-day tokens. If IndexedDB storage is unavailable, connect with an in-memory non-extractable key without guaranteeing key persistence for the next visit. Do not provide keys or tokens to the app iframe, and block trust requests from the app bridge so they cannot bypass consent in the central parent.

The host registers trust centrally only for connections with verified authentication and consent. The central service manages access records by host instance and key fingerprint; the owner's **Manage Connected Browsers → Revoke Access** immediately terminates all tabs using the same key and blocks new connections. Persist revocation records so late trust registration or reconnection cannot restore access. Other browsers, other hosts, and the host registration itself remain separate.

Keep the 60-second connection lease, renewal every 20 seconds, and termination of work upon central disconnection. After a transient full disconnection, attempt automatic reconnection with a new launch and a wait of up to 30 seconds. After verifying the same local account and authentication method, continue using the existing app iframe and drafts, cancel previous requests, and do not automatically rerun saves or commands. Logout, revocation, and explicit authentication denial clear stored tokens and stop automatic retries.

This decision supplements the browser key, resume token storage, and manual reconnection contracts in the [Remote Access Contract](../development/remote-access.md). Preserve the separation of central login and local work permissions, the credential boundaries of approved external identities, and direct P2P transport. [Remote Access](../development/remote-access.md#keeping-browser-login-and-revoking-access) and [Browser Storage](../development/browser-storage.md#storage-scope-for-remote-local-account-connections) own specific APIs, lifetimes, and storage boundaries.

## Rationale and Impact

Per-browser keys prevent resumption with only a copied token and allow access to one browser to be revoked while preserving other browsers. Short connection leases remain, so stored login trust does not replace current work permissions. Automatic reconnection reduces repeated user logins without assuming whether work in progress succeeded.

Non-extractability does not guarantee protection against same-origin XSS, malicious extensions, or OS compromise. Deleting the key and authenticating with a new key and valid login method creates a new browser identity, so revoking access does not revoke the password or external account itself. If the authentication method is also compromised, a password change or revocation of the approved connection is required. Reauthentication is required after 90 days of inactivity or security revocation. Actual connection persistence while a phone sleeps and recovery on all external networks are not guaranteed.

The user applies the local server and app together with the private central service and deploys D1 `0005_browser_access.sql`. The central folder remains excluded from public Git, so distinguish public code commits from retaining and deploying the central copy. Follow the [Central Deployment Guide](../work/mewlink-deployment-history.md#applying-persistent-browser-login-and-access-revocation-2026-10-19) for production application.

## Verification Boundaries

Passed central `npm run check` and Workers Vitest checks across 9 files and 56 tests, local type checks, and 69 host and transport tests. Verified owner and Origin checks, revocation across multiple tabs with the same key, isolation of other browsers and hosts, revocation races involving pending and late re-registration, and prevention of consent bypass through the app bridge. Separate native P2P browser checks and Chromium trust/recovery checks with a mock launcher also verified key reuse, session storage boundaries, preservation of the same iframe and drafts, prevention of command re-execution, and stopping after revocation. See [Remote Access](../development/remote-access.md#verification-and-remaining-gates) for detailed verification and limitations of the existing full test suite. Actual production deployment and local application, phone sleep, and external network recovery require separate verification.
