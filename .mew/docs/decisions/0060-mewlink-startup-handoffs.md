---
title: "Mewlink one-time preparation and fewer connection startup round trips"
description: "Decision to reduce round trips through HTML admission, one-time host proofs, and ICE preparation while retaining Mewlink security checks, and to adopt code and font verification, shared authentication, fast reconnection, state-based rendering for Workspace and the editor, and workspace screen chunk grouping. Distinguishes production application from actual 500ms measurements; ADR 0081 replaces the RTC interruption recovery wait, and ADR 0086 supplements cause-specific retries and offline waiting."
created: 2026-10-24
updated: 2026-10-29
---

## Status

Accepted. Implementation and isolated regression checks passed. Repeated measurements of 500ms on first visits are underway; not applied to production.

[ADR 0081](0081-mewlink-transient-recovery.md) replaces waiting for natural recovery from RTC disconnections. [ADR 0086](0086-mewlink-recovery-efficiency.md) supplements cause-specific backoff for repeated failures, offline waiting, and body timeouts. Initial connection parallelization, existing authentication boundaries, and the other scopes of this decision remain in place.

## Background

Before application, the anonymous login screen appeared in production after 3.44 seconds on first visits and 1.80–1.87 seconds on subsequent visits. Even after existing request-limit batching and parallel bridge preparation, central-to-host round trips, native initialization and ICE gathering on every attempt, and individual revalidation of static resources remained. The [staged investigation](../research/mewlink-startup-latency.md) distinguishes production observations from isolated measurements.

## Decision

- Consume the connection-start allowance in advance on public HTML requests and issue a short signed admission to reduce duplicate D1 round trips for the subsequent WSS connection. The admission is proof of one-time allowance consumption bound to the device, path, origin, and IP; it is not authentication authority. Retain current DO authorization, a fresh WSS nonce, browser key proof, and the final ticket.
- Authenticated hosts supply one-time challenges and generations in advance, which the central service and host each consume to reduce the prepare→ready round trip. Persist consumption records and respect host authentication generation, expiration, replacement, revocation, and hibernation boundaries. Use the existing ready flow for unsupported peers and when the supply is exhausted.
- Retain per-connection processes while preparing native initialization, certificates, and ICE in one standby helper. Do not expose the prepared SDP or candidates; convert them into a normal answer upon an actual offer. Rotate unused sockets and attempt router mapping only after preparing an actual connection.
- Bundle SHA-256 revalidation of static resources into the current index response. Rehash stored bodies and limit reuse to the same connection generation, a short startup window, and one use. Apply the same checks to installed font CSS and font files; do not cache documents, accounts, or sessions.
- Allow only the exact SHA-256 hash of trusted static bootstrap code in CSP to begin preparing WSS and a non-extractable browser key from HTML. Do not insert dynamic metadata into code or allow `unsafe-inline`. Preparation overlaps downloads of the connection controller, JOSE verification code, and app code; hand the prepared socket to a controller with the same configuration only once, and limit received data and elapsed time. Do not authorize before signature verification. Share authentication lookups for the same connection, start the first reconnection immediately, and apply bounded delays only after repeated failures. Do not automatically resend writes.
- Dynamically import the workspace screen after configuring authentication, the account store, content identity, and permission version, and render it using ordinary Component state. Render the editor immediately upon completion in the same way, binding the result to the account, role, root, and permission version. Avoid unnecessary waits from React lazy retries while retaining preparation screens, cancellation, failure handling, and identity switching. Retain lazy loading for other subtools and port previews. The [app startup contract](../development/architecture.md#initial-browser-startup) owns the implementation and verification scope.
- Bundle the workspace screen's static dependencies after the initial and authentication chunks into a separate group to reduce individual requests. Preserve existing dynamic boundaries, and allow new tool dependencies only when all callers have already prepared them. Exclude recursively bundling editor dependencies because it caused a regression in which the settings window waited for the editor download.

Within the applicable scopes, this decision extends per-resource revalidation from [ADR 0018](0018-mewlink-startup-revalidation.md), host ready from [ADR 0028](0028-mewlink-websocket-bootstrap.md), and recovery waiting from [ADR 0033](0033-mewlink-signaling-resume.md). Retain existing authentication, revocation, leases, transport limits, and the origin separation and public code cache from [ADR 0050](0050-mewlink-startup-preparation.md).

## Rationale and Impact

The key is to briefly bind verified preparation results and overlap serial work while retaining checks. Verify [libdatachannel remote offer rollback](https://github.com/paullouisageneau/libdatachannel/blob/v0.24.5/src/peerconnection.cpp#L194) through actual browser and NAT regression checks. Do not forcibly relocate an existing DO or switch to a new object without revocation state.

The central Worker, launcher, and D1 have different application locations from the local host and app. The [remote access contract](../development/remote-access.md) owns old-version, expiration, limit, and fallback behavior; the [central deployment procedure](../operations/remote-central.md) owns the application order and final verification. Results below 500ms in a synthetic environment do not guarantee actual external-network performance or completed production application.
