---
title: "iOS hybrid client and native UI storage"
description: "Accepts a separate SwiftUI/WKWebView client with saved direct and Mewlink connections and native static-code storage. Defines local direct transport, existing Mewlink trust, browser compatibility, and device verification gates."
created: "2026-11-10"
updated: "2026-11-10"
---

## Status

Accepted for source implementation. Xcode compilation, signed installation, physical-device behavior, and App Store acceptance remain separate verification gates. No release or deployment is authorized by this decision.

## Context

The requested iPhone client must remember direct tunnel/Tailscale addresses or Mewlink devices and retain Mew UI code outside browser cache quotas. The existing React UI, editors, server APIs, and Mewlink authentication should remain shared. A URL-only WebView would retain WebKit cache policy and would not meet the storage requirement.

Mewlink already loads host UI through an authenticated transport and checks cached code against live host SHA-256 ETags. Its launcher imports host-owned resource code from this repository. Browser behavior must remain intact when a native bridge is absent.

WebKit App-Bound Domains enable the existing service-worker-based Mewlink loader on a fixed domain set. They cannot represent arbitrary user-entered direct hosts. WebKit also prevents a WKURLSchemeHandler from claiming ordinary HTTP(S). These constraints rule out using one service-worker-based cache for every connection.

## Decision

Create a dependency-free SwiftUI iOS app under `apps/ios`, using WKWebView for the existing React interface. Keep native code outside the application server and browser UI. Introduce explicit native capabilities at the existing runtime, static-resource cache, and notification boundaries.

Use two loading paths:

1. **Mewlink:** retain the original `mew.run` / `app.mew.run` origins, frame chain, service worker, authentication proofs, connection leases, and resource transport. Replace eligible static-code storage with a native Application Support file store when the frame-bound native capability is present. Cached bytes require a fresh authenticated host confirmation before execution.
2. **Direct:** fetch fresh host entry HTML natively and load it as local HTML with a stable `mew-app://workspace/` base. A custom scheme handler serves relative UI files through the selected host and a native file cache. A native AppTransport maps application API requests, resource URLs, and WebSocket traffic to that same configured host. Native networking owns upstream cookies and supplies the selected host Origin where required. It never proxies an arbitrary destination supplied by page code.

App-Bound Domains remain fixed for Mewlink. Direct local HTML uses the public local-content exception. Do not use private WebKit APIs, disable TLS validation, replace global fetch/WebSocket, or start an embedded HTTP server.

Store only connection metadata in ordinary preferences. Keep authentication in the connection's web/native session stores. Namespace native UI files by selected endpoint and verified instance, validate hashes, apply size bounds and LRU eviction, and expose explicit cache removal. Store no account API responses, documents, HTML, credentials, or transcripts in the static-code cache.

Existing in-session notifications may use native permission and local-notification delivery. Notifications after the application stops require an independent server-event/APNs design and are not implied by the local bridge.

## Alternatives

| Alternative | Reason not selected |
| --- | --- |
| Rewrite the UI in React Native | Reimplements DOM-based TipTap, CodeMirror, terminal, and many shared controls without addressing the primary storage requirement |
| URL-only WKWebView | Does not move retained code into native-managed storage |
| Increase browser cache budgets | Useful independently, but retains browser eviction and cannot provide native connection management |
| Service worker on every direct host | App-bound host declarations are build-time configuration and cannot cover arbitrary user addresses |
| Move both modes to local content | Requires replacing Mewlink's established trust and loading paths, increasing cross-repository risk |
| Intercept HTTP(S) using a custom scheme handler | Not supported through the public WKURLSchemeHandler API |

## Consequences

The React feature implementation remains shared. Native-only runtime selection is opt-in; ordinary browser entrypoints retain their existing behavior. Direct transport introduces bounded bridge serialization and native WebSocket lifecycle code, and must be tested for large responses, uploads, cookies, cancellation, raw resources, and editor workers. Stored code still needs a live server validation; this is not offline workspace editing.

Changing root shared Mewlink resources requires a separate user-managed central build/application. A host build alone cannot update the excluded central repository's deployed launcher. No existing central dirty files are part of this task.

Native and web code must be reviewed as one protocol. Document capability names, byte formats, limits, identity isolation, failure behavior, and remaining verification in the [implementation contract](../development/ios-client.md), [operating guide](../operations/ios-client.md), and [work record](../work/ios-client.md).

## References

- [WebKit App-Bound Domains](https://webkit.org/blog/10882/app-bound-domains/)
- [WKURLSchemeHandler](https://developer.apple.com/documentation/webkit/wkurlschemehandler)
- [Apple file storage](https://developer.apple.com/documentation/foundation/using-the-file-system-effectively)
- [Mewlink trust and resource contract](../development/remote-access.md)
