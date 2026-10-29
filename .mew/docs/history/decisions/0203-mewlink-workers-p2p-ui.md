---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
title: "0203 — mewlink provides only authentication and connection on Workers and also transfers the mew UI over P2P"
description: "Migrated decision that reduces the central mew UI deployment to a connection frontend and selects Workers, Static Assets, D1, per-device Durable Objects, and a separate app origin. Links subsequent decisions on local authentication, the mew.run domain, and the private dashboard."
created: 2026-10-07
updated: 2026-10-07
---

- Status: Adopted
- Application status: Implementation and local automated validation complete · Not deployed
- Subsequent decision: [0207](0207-mewlink-device-access-local-auth.md) — Central accounts handle registration and management only; device addresses authenticate with a local mew account after connecting without login.
- Subsequent address decision: [Mew 0005](../../decisions/0005-mewlink-domain-and-private-dashboard.md) — Use `mew.run` as the public address, `app.mew.run` as the app origin, and `/{username}` for the private dashboard.
- Partially supersedes: The central web client deployment scope and central execution and storage choices in [0195](0195-mew-account-based-p2p-remote-access.md)
- Decision makers: User (serve even the UI locally over P2P and deploy through Cloudflare integration), Codex (implementation contract)

## Decision

The central service is named mewlink. Place it in `mew/mewlink/`, excluded from the public mew Git repository, and deploy the login, device selection, and connection frontend and backend together using Workers + Static Assets. The Worker handles Google, GitHub, and Apple authentication; D1 owns accounts, sessions, registrations, and one-time requests; Durable Objects own persistent per-device WSS connections and signaling. A separate Pages project is not required.

Receive the actual mew HTML, JS, CSS, workers, images, and work APIs from registered local A over an authenticated DataChannel. The central deployment does not include the parent mew's `dist/`. Locally, provide a route that reads only static files from the user's build; do not add proxies for arbitrary files, ports, or development servers.

Separate the login origin from the P2P app execution origin. Do not provide the login host's `__Host-` session cookie to the app host. Connect to a specific device, account, and session using a short-lived, one-time launch proof, and do not provide authentication or account management APIs on the app host. App frame resources use only the transport of the exactly corresponding connection page and tab; do not fall back to a central data path when the connection ends or a request is unidentified. Retain 0195 for decisions on direct connections, final local authorization, member revocation, short leases, and no TURN use.

## Reasons and limitations

A provides the UI that matches its running version, reducing the burden of synchronizing central UI versions. Separating the P2P app code from the login origin prevents local code from taking over central login cookies or access approvals for other devices. Trust in the central authentication, signing, and connection code and in A's code remains necessary. Browser storage on the app origin shared by remote devices is not described as mutually untrusted execution environments.

The initial UI loads after the P2P connection is established and is unavailable when A is offline. The service worker and connection page route resource paths. Do not mark the release as complete before production validation with actual external networks, OAuth providers, and Cloudflare.

The [Remote Access Contract](../../development/remote-access.md) and [mewlink Deployment](../../operations/remote-central.md) own the canonical sources for functionality and operations.
