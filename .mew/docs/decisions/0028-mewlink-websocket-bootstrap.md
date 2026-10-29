---
title: "Mewlink WebSocket connection bootstrap and parallel host RTC preparation"
description: "Decision to bootstrap connections with a single-use WebSocket nonce instead of a separate HTTP launch, overlapping final ticket verification with RTC preparation. ADR 0060 extends this with single-use host proof, ICE pregathering, and HTML admission to reduce subsequent round trips."
created: 2026-10-20
updated: 2026-10-24
---

## Status

Accepted. This decision covers code and isolated verification; it does not mean production rollout or achievement of the 0.5-second initial connection target. The user performs local host updates and private Mewlink central redeployment.

The scope of full connection termination on signaling loss is superseded by negotiated reattachment in [ADR 0033](0033-mewlink-signaling-resume.md). This decision's contracts for initial connection, key proof, tickets, and backward compatibility remain in effect.

[Subsequent ADR 0060](0060-mewlink-startup-handoffs.md) reduces some sequential preparation and round trips through HTML admission, single-use host proof, and ICE pregathering while retaining final verification. Existing ready remains as a compatibility path for older versions and exhaustion.

## Background

In same-host Chromium measurements against the production address, the median time to the login screen was 2.70 seconds across 5 uncached first visits and 2.34 seconds across 5 refreshes. The sequential launch, WebSocket, ticket, and answer stages took approximately 1.6–1.7 seconds. These measurements exclude external mobile networks and the time to display the workspace after login.

[ADR 0025](0025-mewlink-signaling-authority.md) removed device/browser D1 queries repeated for every signaling message. The startup sequence still opened the WebSocket after the HTTP launch response and created RTC after the host received the ticket. Reduce this waiting sequence independently of caching.

## Decision

The new central launcher requests WebSocket bootstrap using a device path or instance ID. The Worker checks the origin, device existence, and existing IP/device request limits before forwarding to that device's DO. Device name lookup checks the account and device with a single JOIN. Do not create DO storage for unregistered IDs.

The DO stores the optional identity verified from the central cookie, session hash, random subject, and single-use nonce in the corresponding WebSocket attachment. The challenge delivers public connection context and the central public key over same-origin WSS. The browser submits the nonce, offer, and public key; the DO consumes the nonce only once, then runs the existing prepare, ready, and ticket path. The new path does not write to or consume D1 `launches`. Request limits and central identity verification remain in effect.

The browser connection controller starts WSS and ICE preparation immediately upon creation. After receiving the server-confirmed instance, it binds that device's browser key and resume session. If the path hint points to a different device, it closes the prepared connection and restarts in the actual device's identity mode. Only allowed public settings and a transport stripped of credentials are passed to the app frame.

Reconnection checks that the existing instance, central/app origins, and previewDomain are unchanged. If runtime settings change, clean up the newly prepared connection and existing iframe and stop automatic recovery. Even when settings match, replace the existing app transport only after verifying the local account and authentication method.

During prepare, the host generates a challenge and generation, sends ready first, and then starts the RTC helper. Overlap RTC preparation with the central ticket round trip, but do not allow session resumption, the dispatcher, or an authentication-complete response until the ticket, external identity, and proof of browser key ownership have all been verified. `remoteTicketInbox` retains the existing bounded inbox's size and count limits and processes early-arriving data after verification. Cancellation, expiration, and revocation release waits and clean up the helper and pending sends. Late tickets, signatures, and process callbacks cannot reopen a terminated connection.

The existing DO host-message FIFO forwards answer and candidate after completing ready processing and ticket delivery. Retain the browser's ticket → answer verification order, final signature and key proof, lease, and direct P2P data path.

Retain the existing HTTP launch and token consumption paths for older clients. New clients attempt the existing path only on transport failure before receiving bootstrap context. They do not fall back for errors after receiving context, invalid context, or explicit access denial or revocation. Existing host prepare, ready, and ticket messages remain supported.

## Rationale and Impact

Remove the browser round trip that first waits for HTTP launch and the launch INSERT/DELETE operations in the new path, and overlap RTC preparation with the ticket round trip. Earlier preparation is not authorization and does not change the conditions for allowing final operations. Restore nonce and identity from the attachment; do not use in-memory state as a basis for authorization. [Cloudflare WebSocket hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

Retain the device DO authorization state and revocation preservation from ADR 0025, while this decision supersedes the HTTP-launch-only startup path and the sequence that creates RTC after the ticket. Static resource caching and bundle composition are outside this decision's scope. [Remote access](../development/remote-access.md) owns the current connection and authorization contract, and [central deployment](../operations/remote-central.md) owns rollout and rollback.

## Verification Boundaries

The 79 Workers checks cover 0 launch SQL operations for the new bootstrap, nonce tampering, reuse, use on another socket, expiration, hibernation, existing request limits, logout and device/browser revocation races, and older-version connections. The 33 public browser connection checks and 14 host/ticket inbox checks verified connections without HTTP key lookup, context validation and cancellation, buffering data before the ticket, termination during preparation, expiration, invalid tickets, a maximum of 8 items, and late callbacks.

The 11 isolated Chromium launcher checks verified 0 launch HTTP requests for initial connection, refresh, and automatic recovery; fallback to the older version; incorrect device hints; parallel key and resource preparation; same-account recovery; and connection termination when runtime settings change. Results of type, lint, and documentation checks and actual Workers/native RTC/Chromium verification are recorded in the owning document. Initial connection, refresh, and external-network times after production redeployment must be measured separately.
