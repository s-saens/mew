---
title: "Mewlink initial and recovery offers in WebSocket Upgrade and startup rendering"
description: "Accepts admission-bound initial and one-use recovery offers in Upgrade, early RTC preparation, compatible resource-worker reuse, batched admission, independent explorer and editor engines, selected language and collaboration preparation, and deferred composer and terminal rendering. Preserves authentication and file-validation boundaries and separates isolated measurements from production rollout."
created: "2026-11-02"
updated: "2026-11-03"
---

## Status

Accepted and implemented. Local functional verification passed; strict cold editing remained above one second in the 180ms signaling model. This decision does not establish production deployment or subsecond access on external networks. See the [final measurements](../work/mewlink-subsecond-startup.md#final-installed-build-measurements).

## Context

The 2026-11-02 read-only check of the current registered host reached the anonymous login screen in 1.55–2.14 seconds. The initial HTML alone did not explain this delay. Connection setup still sent the offer after the browser received the WebSocket challenge, adding a central round trip before host preparation. The selected direct RTC path had 0–1ms RTT in that environment.

The full authenticated source fixture also exposed a separate roughly 300ms React retry before the file explorer appeared. A resource-worker script update check could delay a later visit even after RTC authentication completed. See the [implementation and measurement record](../work/mewlink-subsecond-startup.md).

## Decision

- Advertise support in admitted connection HTML and send a bounded, candidate-free, signed initial offer in the WebSocket Upgrade. Bind it to the exact single-use admission, instance, origin, browser key, SDP, and admission lifetime. The existing DO connection handler remains responsible for current authority, limits, host preparation, tickets, and final proofs. The [remote access contract](../development/remote-access.md#signed-offer-in-the-first-websocket-upgrade) defines the wire format and rejection behavior.
- Begin public RTC preparation in the existing hash-authorized inline primer and transfer the endpoint once to the matching controller. Keep keys, local sessions, and authentication in their existing owners; bound unused preparation to ten seconds. Preserve normal challenge negotiation for older HTML and unsupported preparation.
- Advertise a separate replacement RTC protocol using the existing instance browser key, a fresh ten-second proof, and durable one-use consumption. Apply normal bootstrap quotas and current authority checks before host preparation. Date the proof from a central clock hint without changing transmission-bound leases. An unsupported handshake permits one fresh ordinary negotiation; verified denial ends recovery. The [recovery contract](../development/remote-access.md#signed-replacement-rtc-offer) owns the wire format and compatibility rules.
- Batch the non-bootstrap instance lookup and its conditional signaling rate limit in D1. Preserve counters, missing-device behavior, role separation, and rejection order.
- Reuse a matching, activated resource worker after a bounded protocol probe. Perform its script update check in the background. Initial installation, unknown workers, and incompatible workers retain the awaited registration path. No host data becomes available without the tab's current authenticated transport.
- Keep two of the existing sixteen request slots available to ordinary API work by limiting GET/HEAD UI resource transfers to fourteen. Apply the same bounded scheduling to direct launcher requests and forwarded requests, preserve order within each class, and allow eligible ordinary work past blocked resource waiters. Access validation and file reads remain current host requests; increasing concurrency or bypassing validation is unnecessary. Reuse a short-lived, generation-bound observation of an empty cache only to skip redundant empty lookups before live downloads.
- Render explorer controls through regular Component state after their dynamic import completes. Retain the separate module boundary and normal lazy boundaries for other tools. Partition workspace chunks by their actual entry sets before merging small compatible groups. [Browser startup](../development/architecture.md#workspace-initialization) owns these rendering and bundle contracts.
- Prepare a visible pane's public code before dock registration, then start the background agent panel's regular-state import after the workspace root is known. Schedule closed background agent code after a bounded 250ms, immediately promote the same import for a visible panel, explicit request, or unknown UI state, and keep background session restoration independent of editor download completion. This gives foreground preparation a place in the bounded transport queue before background module fanout.
- Derive bounded local icon artwork groups from the existing complete pack JSON and lazily load only groups needed by current icons. Preserve synchronous generic artwork, filename and theme matching, original SVGs, source pins, and license notices. This extends artwork delivery in [ADR 0089](0089-file-type-icons.md) and [ADR 0092](0092-curated-icon-packs.md); the [file icon contract](../features/projects-files-search/file-folder-exploration-and-operations.md#file-type-icons) owns generation and rendering.
- Load Plain and Hotview engines independently, using dedicated package utility entries and deferred comment and database UI. Prepare only Plain's selected language family before mounting its real editor, and start an eligible file's existing collaboration connection alongside pane preparation. File validation and synchronized handoff remain mandatory. Defer the rich composer and terminal renderer until their surfaces render while preserving background agent metadata restoration. Retain current refs, file changes, overlays, and cancellation while downloads finish. Start ordinary authoritative file reads alongside disk-cache lookup; only previews arriving before validation may display read-only text. Existing memory-version conditional requests and bounded anchor-preview selection remain, as defined in the [file-loading contract](../development/file-loading.md).
- Include a bounded account UI snapshot in the first authenticated workspace GET when explicitly requested. Resolve account and logical UI root in the same request, cap the optional envelope at 64 KiB, preserve current device/local state, and fall back to the existing UI GET for absent or invalid snapshots. Use only accepted current metadata to prepare active engines before React applies the workspace and begins background module requests; do not read files or grant editing through this projection. The [startup contract](../development/architecture.md#workspace-initialization) owns the response and freshness rules.

This extends [ADR 0060](0060-mewlink-startup-handoffs.md). Ordinary clients retain the fresh socket nonce. On the new path, the client proves possession of its key over the signed HTML admission and offer before the Upgrade; the DO consumes that admission once and supplies its own fresh nonce to the unchanged internal connection handler. Local account authentication and final channel key proof remain mandatory.

Replacement RTC cannot reuse an initial admission. Its separate proof requires current browser-key possession, strict time checks, and a durable per-browser replay record before entering the same internal handler with a fresh nonce. The initial admission's D1 shortcut does not apply to this mode.

## Alternatives

Sending an offer from `onopen` while keeping the same Upgrade does not remove a network round trip: the original challenge arrives with the upgrade response. Waiting only for a different event would not address the observed latency.

Statically importing explorer controls removes a download boundary and can pull workspace dependencies into other entries. Rendering the dynamically loaded component through state removes the React retry while preserving the boundary.

The initial whole-pack icon import transfers every SVG when one associated file appears. Generated groups retain complete coverage with bounded downloads. Adding a small manual set of preferred file extensions would preserve the full download for other types and add a second association policy; splitting original artwork changes delivery without changing that policy. Increasing transport stream limits would raise concurrent resource use, while delaying background restoration until the editor is ready could suppress notifications behind a stalled editor. Ordering existing bounded work avoids those changes.

A separate request for the current workspace's UI cannot safely overlap the workspace read without reconciling root changes between the two requests. An opt-in snapshot binds both to one request context and avoids adding a large optional payload to every workspace response.

Changing an existing signaling object's name or adding a location hint does not safely move its authority. A relocation requires fencing and transferring revocations and single-use state; it is outside this change. Public CDN candidates, wider cache lifetimes, skipped host verification, and replayed writes are also excluded.

Retaining ordinary replacement RTC negotiation leaves a central round trip before host preparation on every replacement. Reusing the HTML proof would violate one-use admission. A separate short-lived key proof removes that round trip while keeping revocation, quotas, replay protection, and final host authentication in their existing owners.

## Consequences

The parent build supplies host UI changes and shared client/protocol sources; the private central build supplies the Worker and launcher. They require separate user-owned application. New entry-aware asset names contain `~`, which the shared static-code cache validator now accepts without changing path, extension, SHA, scope, or expiry checks. Applying that validator to the running host requires the user's server restart; the UI build alone does not reload server modules. No new D1 migration or device registration is required. The central HTML and hashed launcher assets must be applied together.

Tests must prove actual use of the new path, one-time admission under concurrency and hibernation, unchanged authority checks, cancellation, old-version behavior, and current-tab resource isolation. Timing records distinguish an empty browser, a saved login without asset caches, a warm page visit, and replacement RTC recovery. Local signaling-delay models do not establish production latency.
