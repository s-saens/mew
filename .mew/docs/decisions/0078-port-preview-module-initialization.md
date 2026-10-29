---
title: "Preview module specifier analysis and remote initialization completion checks"
description: "This decision fixes missing inline and multiline modules in direct previews using es-module-lexer instead of regular expressions, and adds remote launcher initialization completion and failure notifications and a 15-second readiness limit. Existing origin and capability boundaries and production readiness requirements remain; subsequent decision 0083 extends address reference rewriting for general SPAs."
created: "2026-10-27"
updated: "2026-10-28"
---

Status: Adopted. [Decision 0083](0083-direct-preview-spa-routing.md) extends the scope of address reference rewriting in direct previews.

## Background

While investigating port address access failures, reproduced requests for an actual Vite app's inline React Refresh modules and multiline imports being sent to the Mew root, causing CORS errors and a blank screen. The existing regular expressions did not handle inline scripts or multiline syntax and could also rewrite comments and strings. Mewlink's preview DNS was not ready, independently of the public device page, and failures left a blank screen because it did not wait for the launcher to become ready.

## Decision

Add `es-module-lexer` as a pinned server runtime dependency. In executable inline HTML scripts and external JavaScript, rewrite only the analyzed positions of actual import/re-export specifiers, working backward. Preserve ordinary strings, comments, JSON data, source maps, and import.meta, and pass through the original content if parsing fails.

After ready from the designated iframe and origin, remote previews wait for notification that the Service Worker is ready. Return a failure notification or the 15-second timeout as an error to the caller, and release sessions, requests, sockets, ports, and timers. Apply launcher and host changes together.

## Alternatives and Rationale

- Simply removing the line restriction from the regular expressions makes it difficult to distinguish strings, comments, escapes, and dynamic imports from actual syntax.
- A full general-purpose AST transformation has a larger scope and cost than rewriting only module specifiers. A [module-specific lexer](https://github.com/guybedford/es-module-lexer) provides the required positions and string specifiers.
- Treating iframe setup alone as success without a readiness message cannot detect DNS, TLS, or Service Worker failures. Require explicit initialization completion and a timeout.

## Impact

Preserve the direct opaque sandbox, separate remote origin, and port capability from [ADR 0023](0023-login-desktop-and-port-preview.md). Unmodified support is not guaranteed for arbitrary app routers, imports assembled at runtime, or browser policies. DNS, HTTPS, and Worker readiness and user builds and deployments are still required. The [port preview contract](../development/port-preview.md) owns the current contract, [central deployment](../operations/remote-central.md#localhost-app-preview-origin) owns production readiness, and the [work record](../work/command-port-previews.md) owns actual verification.
