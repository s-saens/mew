---
title: "Batch Rate-Limit Checks at Mewlink Connection Startup"
description: "Records the decision to combine the three WebSocket bootstrap rate-limit checks into one D1 batch while preserving their order, counter behavior after rejection, and expiration, along with the verification boundary before production rollout."
created: 2026-10-22
updated: 2026-10-22
---

## Status

Accepted. Implemented locally in the private central source; production deployment and connection time improvements are verified separately.

## Background

Even after the earlier startup parallelization, cases where the anonymous login screen took several seconds to appear were observed at the production URL. After looking up the device during bootstrap, the central Worker checked the IP launch, device launch, and IP browser signal limits in order, making three D1 calls. The conditions and limitations of the total time measurements are recorded in the [deployment record](../work/mewlink-deployment-history.md#2026-10-22-connection-latency-remeasurement-and-request-limit-batching).

## Decision

Process the three rate-limit checks in one D1 `batch()`. Subsequent UPSERTs check in SQL whether an earlier limit was exceeded. Preserve the limits, keys, 60-second windows, and behavior of not incrementing subsequent counters after rejection from the sequential checks. Do not allow connections on batch errors; regular signal requests and legacy HTTP launch requests use the existing paths.

## Rationale and Impact

[D1 batch](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch) executes multiple statements in order in one database call and rolls back the entire batch on failure. It removes two database round trips during normal bootstrap while preserving existing rate limits and authentication boundaries. No schema changes are required; only the central Worker needs deployment. The nonce, ticket, key proof, and RTC preparation contracts in [ADR 0028](0028-mewlink-websocket-bootstrap.md) remain unchanged.

Other waits caused by the local launcher, network, and device state remain. Isolated checks verify limit boundaries, rejection order, expiration, counter sharing with existing checks, concurrent requests, and rollback; they do not replace verification of actual time savings after production deployment. The [connection contract](../development/remote-access.md#connection-authentication-and-revocation) and deployment record own the current values and rollout procedure.
