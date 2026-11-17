---
title: "Responsive startup and host discovery"
description: "Keeps initial rendering small and host discovery off the HTTP event loop. Accepts single-use scoped workspace/editor-tab bootstrap metadata, canonical startup translations, build-time static compression, and selected-pack icon matching."
created: "2026-11-16"
updated: "2026-11-16"
---

## Context

The November 16 loading investigation found sequential workspace and editor-tab reads, complete translation catalogs on the first entry, uncompressed direct static responses, and synchronous discovery of projects and executables. Read-only requests to the running host stalled together; WSL Windows-filesystem waiting was observed. Isolated checks reproduce the blocking behavior, but do not attribute every live delay to these paths. The [work record](../work/startup-performance-2026-11.md) owns measurements and application status.

## Decision

1. Keep startup/recovery copy in a tiny canonical catalog shared with the complete UI catalog. Keep one synchronous locale/subscriber state. Download keyed application translations alongside authentication and render localized content only when its provider is ready.
2. Hand the accepted initial workspace response from the mode shell to the matching editor through an atomic, single-use callback. Match both physical and logical roots. Account remounts, permission changes, and subsequent navigation cannot reuse the old snapshot.
3. Let the existing `include=workspace-ui` request optionally return authoritative editor-tab state and revision for that account and logical project. Bound the combined optional payload to 64 KiB; retain the separate ledger read when absent, oversized, invalid, or unreadable. Preserve lazy legacy migration and existing tab synchronization. Consume accepted startup tabs once before root activation; recovery, invalidation, and returning to a project read fresh authority.
4. Use asynchronous filesystem probes for HTTP project/runtime discovery and WSL GPU executable discovery. Coalesce concurrent work without persistently caching stale runtime presence. Merge project discovery into the latest ledger so concurrent user mutations survive. Retain synchronous compatibility APIs for existing non-HTTP consumers. This prioritizes request responsiveness over minimum total scan time.
5. Prepare Brotli/gzip sidecars during builds and negotiate them for direct hashed static assets. Keep compression outside the API request path, preserve representation validators/HEAD and identity ranges, and support older artifacts without sidecars.
6. Download only the selected file-icon pack's matching metadata and required artwork groups. Keep generic icons synchronous with unchanged SVG identities and dimensions; ignore stale pack completions.

## Alternatives and limits

A persistent browser cache of authoritative account tabs would reduce requests but can restore obsolete cross-device state. A single-use response from the current authenticated request preserves freshness and has a normal fallback.

Increasing transport concurrency does not fix synchronous host stalls or sequential API dependencies. Delaying all background agent restoration until editor completion would weaken existing recovery behavior. Keep the bounded independent preparation contract.

Compressing each asset in an HTTP handler would add CPU work and repeated compression under load. Build sidecars trade artifact size for bounded serving work. Remote resource compression retains its separate transport ownership.

Replacing synchronous locale APIs with asynchronous per-language switching would affect shared UI and editor callers. The canonical startup subset removes unnecessary early data while retaining that contract.

## Verification and application

[Browser startup](../development/browser-startup.md), [account tabs](../development/account-tabs.md), [architecture](../development/architecture.md), and [file icons](../features/projects-files-search/file-folder-exploration-and-operations.md#file-type-icons) own current behavior. Verify scope/cancellation, explicit empty tab state, project returns, optional-envelope fallback, locale equivalence, actual static compression/validation, and held-import icon behavior. Compare existing installed artifacts under identical fixtures and report model assumptions.

Follow the [execution rules](../development/getting-started.md). A required build refreshes UI assets and creates sidecars; server middleware and discovery changes require a separately authorized restart. No server lifecycle authorization is implied by this decision.
