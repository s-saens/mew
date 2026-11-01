---
title: "Host-wide localhost browser port selection"
description: "Adds a hamburger entry and browser start page for host-wide TCP listeners, with authenticated read-only OS discovery, explicit disabled Mew ports, and a live shared self-port navigation boundary."
created: "2026-11-01"
updated: "2026-11-01"
---

## Status

Accepted. Extends the Browser entry and host-port contract from [0103](0103-localhost-dom-browser.md) and [0106](0106-dom-browser-external-sites.md). The existing DOM relay remains the page renderer.

## Context

Command port buttons show listeners owned by their own command processes. The user requested a hamburger entry listing all currently open localhost ports, including apps started elsewhere, and explicit identification and blocking of Mew's own port.

## Decision

Add **Menu → Localhost browser**, opening the existing Browser panel at a port-selection start page. Discover host-local TCP listeners from read-only OS tables and tools, independently of command descendants. Require the existing authenticated `portPreview` capability for a bounded, cancellable `GET /api/dom-browser/ports` request. Sort and deduplicate results and distinguish discovery errors from a successful empty list.

Maintain a live registry of the actual listening ports of HTTP servers attached to Mew's DOM browser. Label discovered registry matches **Mew** and disable them. Keep configured and reserved blocked port numbers disabled without falsely identifying their current service. Resolve the same blocked-port policy during host navigation, resource, and redirect checks, including listeners registered after a browser connection opens.

Start no browser context while displaying the list. Selecting an allowed port opens it through the existing DOM browser. Returning to **Open ports** disposes of that page context and reads a fresh list. Keep address entry, localhost links, command-port entry, docking, and mobile permission boundaries.

## Alternatives and rationale

- A list limited to command sessions omits apps launched outside those sessions.
- TCP connection sweeps or HTTP probes perform unnecessary network requests and can misclassify non-HTTP services. OS listening tables provide current ports without contacting them.
- Guessing that a familiar port number is Mew can mislabel unrelated services. The active server registry identifies actual listeners, while separate blocked labels retain the established port policy.
- A separate browser panel or rendering strategy would duplicate the existing feature and conflict with the user's request to keep the DOM browser.

## Consequences

The list can contain non-HTTP TCP services and cannot guarantee that every selectable port renders a webpage. Canonical loopback and wildcard listeners are included; LAN-only bindings, separate network namespaces, and OS visibility limits remain. Discovery runs on entry and manual refresh. Returning to the list closes temporary page login/storage. The [current contract](../development/port-preview.md#host-port-discovery) owns API, OS, lifecycle, and access details; [the work record](../work/localhost-browser-port-picker.md) separates local checks from user application.
