---
title: "Mewlink signaling reattachment within the authentication validity period"
description: "A decision to preserve negotiated RTC within the existing lease during a brief central WebSocket interruption and reattach using proof of key possession for a new nonce. Defines revocation, expiration, replacement, and hibernation boundaries; subsequent 0060 extends immediate retries and the recovery wait for actual RTC failures."
created: 2026-10-20
updated: 2026-10-24
---

## Status

Accepted. Applies to connections where the central service, browser, and host have all negotiated support. Central deployment and application to the local runtime are separate.

The [subsequent ADR 0060](0060-mewlink-startup-handoffs.md) starts the first retry immediately and shortens the wait for natural recovery from an actual RTC disconnection while retaining the existing lease and reattachment validation.

## Background

Previously, the browser immediately terminated even healthy RTC when the central signaling WebSocket closed. The host also cleaned up all RTC helpers when its central connection closed. Brief signaling interruptions escalated into reconnections of all app requests and sockets.

The existing lease is the boundary for periodically checking the central service's authorization of the device, browser, and optional external identity. Its validity period must not be extended because of a central disconnection, and an existing connection must not be attached to a new socket without proof of key possession.

## Decision

Negotiate reattachment support through the central challenge, the host's nonce signature, the browser request, and the signed ticket. As before, terminate unsupported peers, connections whose authentication is incomplete, and explicit normal closures, authorization denials, and revocations.

Negotiated connections retain RTC and the app's existing requests and sockets during temporary signaling interruptions. Retries proceed only within the currently approved lease, and a new attempt does not itself extend validity. The browser ties the renewal request's monotonic timestamp to the remaining time from the central service so that network delays and clock differences do not extend the allowed time.

The browser signs the new signaling socket's single-use nonce with its existing browser key. The central service validates instance, origin, connection, generation, SDP fingerprint, browser key and subject, the same session and valid status of the optional external identity, device and browser revocation, and the remaining lease. Even on success, it restores only the existing lease and grants a new validity period only through a subsequent normal renewal.

The DO stores disconnected browsers' connection state in SQLite. It retains at most 8 entries and their existing expiration times, cleaning them up on alarms, new connections, and revocations. It uses both open WebSocket attachments and detached SQLite state to recover after hibernation. It does not restore authorization from in-memory state alone.

The host uses the same registration key to sign a new nonce and a list of authenticated connections it actually holds. The central service cross-checks this against current connections and retained records and resends only those connections' existing expiration times. If the host cannot prove the list, as with a new host process or an older version, it cleans up the remaining browser connections. After asynchronous identity verification, it queries the host, browser, and stored state again to avoid applying late results during replacement, revocation, or reattachment races.

Lease expiration or actual RTC failure is handed off to the app's existing automatic recovery. Writes and commands are not retransmitted. Retain the revocation boundaries of [Browser trust](0015-trusted-browser-access.md) and [Signaling authorization preservation](0025-mewlink-signaling-authority.md), and supersede only the scope of [WebSocket bootstrap](0028-mewlink-websocket-bootstrap.md) that terminates all connections on signaling disconnection.

## Validation and impact

Run isolated checks for key, nonce, generation, and device mismatches and reuse; session logout, revocation, and expiration; older versions; DO hibernation; and host replacement races. In checks using actual Workers, native RTC, and Chromium, verify that the same iframe and RTC are retained and ordinary requests succeed after brief interruptions to signaling on both sides. This does not represent an overall success rate for interruptions over external networks.

[Remote access](../development/remote-access.md) and [Central deployment](../operations/remote-central.md) own the current contract and specific rollout and rollback procedures.
