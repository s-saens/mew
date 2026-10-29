---
title: "Per-Device Durable Object Ownership of Mewlink Signaling Authorization State"
description: "Decision to replace repeated D1 queries for SDP answers, ICE candidates, and ready with persistent SQLite authorization state in per-device Durable Objects. Defines monotonic merging of revocations, DO-first revocation, D1 copies, restoration, and rollback; HTTP launch and RTC waiting at connection startup follow subsequent ADR 0028."
created: 2026-10-20
updated: 2026-10-20
---

## Status

Adopted. This decision covers code and isolated verification; it does not confirm production rollout or achievement of an initial connection time of 0.5 seconds. It takes effect only after the user redeploys Mewlink central.

Subsequent [ADR 0028](0028-mewlink-websocket-bootstrap.md) supersedes the HTTP-launch-only startup path and the sequence of creating RTC after the ticket. This decision's device DO authorization state and revocation preservation remain unchanged.

## Background

Mewlink prepares a direct WebRTC connection through central on every initial connection and refresh. Existing signaling repeatedly queried D1 for device and browser revocation state when processing SDP answers, ICE candidates, and ready. Because messages are processed sequentially per connection, database round trips also delay forwarding subsequent candidates.

[ADR 0018](0018-mewlink-startup-revalidation.md) reduced duplicate round trips for startup requests and static resource transfers but left repeated central database queries as a separate improvement candidate. This change reduces repeated queries in the connection preparation path independently of app resource caching.

## Decision

The per-device `Signaling` Durable Object owns signaling authorization state for that device. The public shared module `shared/remote-signaling-state.ts` stores device metadata and the browser registry in two DO SQLite tables. Initialize an existing DO from D1 device and browser state only when it first requires this state; do not repeat completed initialization on every hibernation or reconnection. Handle initialization and revocation merging in synchronous transactions.

SDP answers, ICE candidates, and ready check the DO's persistent device and browser state and the current connection, expiration, and proof in the WebSocket attachment. After initialization, processing these messages for local and anonymous connections without a central identity performs no D1 queries. Retain `authenticateHash` central session validation for connections containing an external Mewlink identity. Retain the Worker's device lookup before handing the WebSocket to the DO to avoid creating DO storage for nonexistent IDs.

Keep revocation records as markers that are never cleared. Monotonically merge revocations received before initialization, read from D1, and processed directly in the DO; do not reactivate devices or browsers through later active states or trust registrations. Do not store authorization state only in memory or replace it with a cache that permits stale permissions during its validity period.

The browser management list queries the DO registry. Revoking browser access and deleting devices first persist revocation state in the DO and close connections, then update the copy in D1. Preserve completed DO revocations even if the request ends in an error because the D1 update fails. Trusted browser registration must not overwrite revocation records either.

Lease renewals and alarms reread device and browser revocations from D1 and monotonically merge them into the DO. Retain existing central session checks for external identities and logout propagation. After hibernation, use SQLite authorization state together with WebSocket attachments, and do not continue permitting revoked or expired connections.

This decision replaces repeated per-message D1 queries for device and browser state. Retain HTTP launch and single-use consumption, the prepare/ready protocol, signatures, proof of key ownership, leases, and direct P2P data transfer. RTC process pools and resource caches are outside this change. The [Remote Access Contract](../development/remote-access.md#connection-authentication-and-revocation) owns the current authentication, lifetime, and transport contracts.

## Rationale and Impact

Keeping authorization state in the per-device DO that already relays messages eliminates the need to wait for central D1 for each candidate. DO SQLite is persistent storage per object, allowing state checks in the same object that processes messages and restoration after restarts. [Cloudflare SQLite Storage API](https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/), [WebSocket Hibernation](https://developers.cloudflare.com/durable-objects/best-practices/websockets/).

Replacing the existing native WebRTC library with a wrapper does not eliminate central database round trips. A persistent reverse tunnel can reduce per-browser negotiation, but work data passes through a proxy, which differs from the current direct transport contract. This change retains the data path and removes the identified repeated queries.

D1 retains accounts, registrations, management sessions, launch, and management copies, while signaling authorization state is added to the DO. No production D1 schema migration is required. The DO's two tables are prepared at creation, and existing device registrations and keys remain unchanged. Central source code remains excluded from public Git; only the shared state model, verification, and documentation are recorded in the public repository.

### Backups and Recovery to Previous Code

During recovery, preserve both D1 and each DO's SQLite state. If an update to D1 failed, verify that revocations recorded only in the DO have also been applied to D1. Restoring only D1 or reverting to older code that checks only D1 without the revocation copy can allow access that has already been revoked. Before resetting DO state or reverting to older code, reconcile revocations between the two stores, and do not overwrite revocation records with older active state.

## Verification Boundaries

The 6 isolation checks for the shared SQL model verified restoration in the same SQLite database after 1 initializations, preservation of revocations before initialization, isolation by device and browser, prevention of revoked access being revived by trust registration, monotonic merging of D1 revocations, and transaction rollback on initialization failure. The 66 central Workers checks also passed. The new performance checks verify 0 device/browser D1 queries for ready, 40 bidirectional ICE candidates, and answer delivery; continued external identity session checks; hibernation restoration; and preservation of revocations after D1 update failures in the management API. Root and central type checks, root lint, and documentation checks also passed; existing lint warnings remain.

The 2 P2P browser checks using actual Workers, native RTC, and Chromium also passed. They verified login, app resources, refresh, 1000 normal WS messages, mixed HTTP transfers, lease retention for at least 65 seconds while the browser renewal timer was stopped, and removal of the app frame after local password revocation and device disposal. These are isolated checks on the same host, not production measurements over external networks.

Workers/D1/DO integration verification and production rollout are distinct. An initial connection time of 0.5 seconds is a target and is not recorded as an achievement of this change. After the user redeploys, first visits and refreshes without cached resources must each be measured, with central round trips, ICE, DTLS, DataChannel authentication, and app display times examined separately. Connection success rates and latency over actual external networks, phones, and different NATs require separate verification. Agents do not run app builds, server restarts, or central deployments.
