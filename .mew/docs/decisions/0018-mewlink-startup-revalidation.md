---
title: "ADR 0018: Mewlink Startup Parallelization and Static Code Revalidation"
description: "Decision to reduce duplicate Mewlink startup, authentication, and metadata round trips and reuse static code after verifying SHA-256 over the current P2P connection. Subsequent decision 0025 extends D1 query improvements, and 0060 extends code and font bundle verification and waiting for authentication results."
created: 2026-10-19
updated: 2026-10-24
---

# ADR 0018: Mewlink Startup Parallelization and Static Code Revalidation

## Status

Accepted. Implementation and isolated verification of the local code and private central launcher are complete; user builds, server application, and central deployment are performed separately.

[Subsequent ADR 0060](0060-mewlink-startup-handoffs.md) retains SHA-256 verification of the current host and extends bundled startup checks for static code and fonts and sharing of late-arriving authentication results.

## Background

Mewlink connections require launch, ICE negotiation, local authentication status, and static resource preparation in addition to cryptographic verification. The previous startup path waited sequentially for authentication status, app metadata, and HTML after the DataChannel was ready, and downloaded app code again because URLs changed with each connection and storage of all resources was prohibited. These costs remained even with browser trusted sessions.

In local synthetic measurements, Ed25519 signing and verification averaged about 0.55 ms and 0.39 ms respectively, and 6 password scrypt runs took about 52–66 ms. Reconnection with a stored session does not compute a password hash. These measurements do not establish the cause of production latency, but support reducing duplicate round trips and repeated transfers before reducing authentication checks.

## Decision

Overlap authentication status checks and resource preparation on the initial connection, and avoid duplicate requests for the same metadata checks as index. The launcher passes authentication status verified on the current connection to the new app frame once to reduce duplicate queries. If no status is passed, perform the existing query. Resume recovery connections after confirming the same account and authentication method, preserving existing authentication, trust consent, revocation, and leases.

Allow explicit CacheStorage only for per-device static code. Verify the stored content's SHA-256 and reuse it only after receiving 304 with the same ETag from an authenticated P2P request to the current device. Distinguish ETags for gzip and raw representations, and consistently store decompressed content. Reapply the response CSP from the current connection. Even if other code on the same app origin changes only the content while retaining the stored ETag, the hash comparison prevents reuse.

This decision supersedes the prohibition on static code storage in the [Remote Access Contract](../development/remote-access.md#static-asset-compression-and-revalidation-caching) within this scope. Preserve the prohibitions on storing HTML, work APIs, documents, and authentication information, as well as connection verification for the exact tab and direct transmission. The Remote Access Contract owns current cache limits, allowed resources, and error handling.

## Rationale and Impact

Eliminate app code transfers on return visits without skipping verification of the current host. Stream the first response and handle cache writes later. If caching is unavailable, fall back to the existing download path; do not substitute stored code for disconnection or permission errors. The Cache API is independent of HTTP cache directives, so explicitly manage lifetime, size, and deletion. [Cache API](https://developer.mozilla.org/en-US/docs/Web/API/Cache) · [ETag](https://developer.mozilla.org/en-US/docs/Web/HTTP/Reference/Headers/ETag).

Initial visits and code changes require downloads, and return visits still incur ICE, authentication, and per-resource verification round trips. Latency on paths requiring router mapping remains a separate candidate for improvement. Subsequent [ADR 0025](0025-mewlink-signaling-authority.md) reduces repeated D1 queries for signaling messages through persistent authorization state in per-device Durable Objects. This document's startup parallelization and static code revalidation decisions remain in effect and do not guarantee instant connections on arbitrary networks.

## Verification Boundaries

Using isolated Chromium and the actual in-memory HTTP dispatcher, verified 304 and 0 bytes of content transfer for a new launch, host isolation, redownloads for content tampering, updates, expiration, and invalid 304, storage failures, older servers, lack of gzip support, and offline rejection. App startup checks verified reuse of the current launcher status and the existing query when no status is passed. Passed 65 local checks, 6 central browser checks, 1 check with actual Workers/DO and native RTC P2P, type checks on both sides, root lint, and documentation checks. Existing lint warnings remain. Production server and central deployment and phone connection times over external networks will be measured separately after user application. Private central source remains excluded from public Git.
