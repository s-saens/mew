---
title: "Mewlink public code caching, bridge preparation, and startup chunks"
description: "The decision selects limited HTTP caching for the public hashed launcher, overlapping bootstrap with app bridge preparation, and bundling static chunks used before authentication to reduce the cost from the waiting screen to Mew appearing. Records the preservation of authentication and host code revalidation, along with the verification boundary before production rollout."
created: 2026-10-23
updated: 2026-10-23
---

## Status

Accepted. Locally implemented and verified in isolation; production builds, deployment, and improvements in time to first display are verified separately.

## Background

Even after startup parallelization and rate-limit batching, `no-store` for the central public launcher code, app bridge downloads that start only after bootstrap, and requests for multiple initial static chunks remain. The interval reported by the user runs from the waiting screen until Mew appears and is distinct from data fetching after login.

## Decision

Allow limited browser HTTP caching only for central public JS/CSS with hashes. Do not store the current device's HTML, authentication, keys, or work responses. Preserve the per-device SHA-256 of installed host code and current P2P revalidation. This exception applies only to public central code and does not replace the host code verification in [ADR 0018](0018-mewlink-startup-revalidation.md).

Prepare a hidden app bridge alongside bootstrap using the public origin from trusted central HTML. Accept it only if it matches the origin confirmed by bootstrap, and pass the device context and transport port after the existing steps. Preserve the original device, browser key, ticket, permission revocation, and recovery identity checks, and clean up preparation resources on failure or cancellation. Preserve the role-specific entry points and parent/app origin isolation in [ADR 0029](0029-mewlink-launcher-entries.md).

Bundle the static dependencies of the installed Mew main entry and authentication entry separately, while preserving dynamic imports for Workspace and tools. Exclude main itself, which waits for the authentication entry download with top-level await, from shared dependency chunks to prevent circular waits.

## Rationale and Impact

Combining hashed URLs for public files with HTML fetched on every visit reduces repeat downloads of the same launcher on subsequent visits while allowing new deployments to be selected through new URLs. [HTTP caching](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Caching). Overlapping bridge preparation and reducing initial request counts reduce waiting and transfer costs without skipping authentication checks. Because the [Rolldown chunk policy](https://rolldown.rs/reference/OutputOptions.codeSplitting) can affect execution order, run regression checks on Workspace downloads before login, initial execution, and storage scope.

The central Worker and launcher and the local Mew UI have different rollout locations. The [remote access contract](../development/remote-access.md), [app startup contract](../development/architecture.md), and [central rollout record](../work/mewlink-deployment-history.md#2026-10-23-public-launcher-cache-bridge-preparation-and-initial-chunks) own the exact response conditions and lifetimes that permit caching, preparation ownership, and verification results. Isolated request count and transfer volume checks do not guarantee actual improvements measured in seconds over external networks or immediate connections.
