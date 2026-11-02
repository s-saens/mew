---
title: "Page titles in the localhost port list"
description: "Adds bounded HTTP title lookup for discovered app ports, partially superseding decision 0108's no-probe policy while preserving OS discovery, port guards, and the existing DOM browser."
created: "2026-11-03"
updated: "2026-11-03"
---

## Status

Accepted. Partially supersedes [0108](0108-localhost-browser-port-picker.md) only for optional page-title lookup after OS discovery.

## Context

Port numbers alone do not identify the apps running on the host. The user requested each app's page title beside its port. The existing list deliberately discovers listeners without HTTP requests or browser contexts.

## Decision

Keep OS-based port discovery and enrich eligible app rows with an optional HTML page title. Make short, bounded HTTP requests to discovered loopback ports; do not probe Mew or reserved ports. Follow redirects only within the same port and loopback HTTP boundary. Send no Mew credentials or app cookies, and execute no JavaScript. Require current preview access before lookup and before returning the result.

Treat titles as optional, untrusted text. Preserve port numbers, sorting, selection, and disabled states. Missing titles, non-HTTP services, slow responses, and lookup failures leave the row usable without a title. Bound request duration, response size, concurrency, and the total batch. Entry and manual refresh perform lookup; no background polling or persistent title store is added.

## Alternatives and rationale

- A headless browser per port could read JavaScript-generated titles but would launch apps and consume substantially more resources while displaying the list.
- Process names do not reliably identify the app and do not supply the requested page title.
- Port-range sweeps are unnecessary because OS discovery already supplies the candidate listeners.
- Arbitrary redirects could contact external services or protected Mew ports. A same-port loopback boundary keeps title lookup within the selected service.

## Consequences

Opening or refreshing the list now sends bounded root-page GET requests to eligible apps. Static HTML titles are supported; titles set only by JavaScript, pages requiring app login, and HTTPS-only services may have no label. The [current port-discovery contract](../development/port-preview.md#host-port-discovery) owns limits and response fields; the [work record](../work/localhost-port-page-titles.md) records local checks and application limits.
