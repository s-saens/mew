---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
title: "0195 — Separate central account authentication from P2P transport for mew remote access"
description: "Preserves the original decisions on identity, direct transport, local authorization, and no TURN for account-based mew remote access. Subsequent ADR 0203 partially supersedes central UI deployment and runtime configuration."
created: 2026-10-05
updated: 2026-10-07
---

- Date: 2026-10-05
- Status: Adopted
- Subsequent decision: [0203](0203-mewlink-workers-p2p-ui.md) — Central UI deployment scope, Workers/D1/DO, and separate internal app origins. Preserve the original decision text below.
- Subsequent decision: [0207](0207-mewlink-device-access-local-auth.md) — Central accounts handle registration and management only; device addresses authenticate with a local mew account after connecting without login.
- Implementation status: Connectivity and P2P UI implementation and local verification complete · Not deployed
- Partially supersedes: [0111](0111-mew-native-deployment-and-supervisor.md) — Design that adds an opt-in P2P path to a scope where HTTPS proxies and tunnels on separate hostnames were the only external access paths
- Partially supersedes: [0112](0112-mew-public-release-security-and-credential-boundaries.md) — Scope where external access used only HTTPS proxies and tunnels; retain secure local defaults and provider credential boundaries
- Decision makers: User (specified an architecture for access through account login alone and the domain), Codex (design documentation)

## Background

Requiring each installer to configure a domain and tunnel or install a VPN on every connecting device makes self-hosted mew difficult to use from anywhere. The user wants to register server A just once and connect from arbitrary browsers B, C, and D by logging in with the same account or an approved member account. Connecting device registration and per-device approval procedures are not required.

Choose a direction in which the central service provides routing and account authentication, while file, terminal, agent, and screen data travels directly between the user's server and browser. Set the domain to mew.saens.kr under the user-owned saens.kr.

## Options

1. Retain per-user VPN and HTTPS tunnel configuration as the default — Uses the current implementation unchanged but does not resolve the setup burden for installation and access.
2. A central reverse tunnel carries work data — Makes browser access easy but increases central bandwidth costs and the scope of data processing.
3. Separate central account authentication and signaling from WebRTC direct transport — Provides the desired login experience and data path but requires transport layer implementation and fails to connect on some networks.

## Decision

Adopt design direction 3. This record does not mean the service has been launched or existing authentication has been changed.

- The central access address is `https://mew.saens.kr/<user-id>/<device-name>`. device-name is the name of the registered server, not a registered name for the connecting browser.
- The local owner on server A approves initial registration. A then automatically maintains an authenticated connection to the central service. B, C, and D open the URL and log in with an account, without requiring a separate VPN, connecting device registration, or A's approval each time.
- The central service owns trusted web client deployment, external account login, server registration and routing, access approval, and signaling. It does not proxy, store, or execute work data. Distinguish authentication and connection metadata from work data.
- Use WebRTC DataChannel for file, terminal, agent, and collaboration transport. A verifies account identity and proof of access and makes the final authorization decision based on local roles, capabilities, and file permissions. Do not grant owner or shell privileges based solely on central login or a URL.
- Explicitly approve linking a stable external account identifier to a local mew account. Do not automatically link existing accounts based only on email strings. Retain existing Git provider connections and AI provider authentication as separate contracts.
- The server retains native installation and loopback HTTP binding. Do not add publicly exposed HTTP ports, development servers, or proxies for arbitrary local services. `/user-id/device-name` is a selection route in the central web client, not a deployment of local mew under a subpath.
- The initial path uses direct connections only. Use STUN for address discovery, and do not automatically add TURN or central work data relaying. Explicitly report direct connection failures and support only environments where connections are possible. Introducing TURN requires a separate subsequent decision that reviews the data path, costs, and security contract together.
- Existing remote desktop direct transfer, OS approval, single control connection, and input lease retain the current contracts and [0189](0189-mew-desktop-external-direct-connectivity.md). Adding app remote access does not permit video relaying.
- Protect and separate central authentication, connection proof signing, web code deployment, and production administrator privileges. Trust in central issuance authority and deployed code remains; do not claim that P2P encryption guarantees safety against a complete compromise of the central service.

## Rationale

Account login is available without registering a connecting device. Separating signaling from actual transfer keeps execution and storage on the user's server while reducing central transfer costs and retention scope for work data. However, WebRTC does not automatically expose addresses for ordinary HTTP services, so a layer is needed to carry app requests and real-time events. Direct connection success rates must be verified on real networks.

The technical references are the [WebRTC connection explanation](https://webrtc.org/getting-started/peer-connections), [DataChannel RFC 8831](https://www.rfc-editor.org/rfc/rfc8831.html), [WebRTC security RFC 8827](https://www.rfc-editor.org/rfc/rfc8827.html), and [OAuth security RFC 9700](https://www.rfc-editor.org/rfc/rfc9700.html).

The canonical source for user flows, identity linking, transport, operational security, failure handling, and release validation is the [Account-based P2P remote access design](../../work/remote-access.md). Before implementation, existing project documents remain the canonical sources for current authentication, deployment, and remote desktop behavior.
