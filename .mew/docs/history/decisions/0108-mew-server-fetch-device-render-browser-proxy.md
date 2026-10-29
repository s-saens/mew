---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: The mew browser opens through a server-fetch, device-render proxy. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0108 — The mew browser opens through a server-fetch, device-render proxy"
created: 2026-09-03
updated: 2026-09-03
---

- Date: 2026-09-03
- Status: Superseded by: 0109
- Supersedes: [0107](0107-mew-server-chromium-browser-streaming.md) — removes server Chromium, CDP display relay, and browser installation
- Partially supersedes: [0057](0057-mew-localhost-browser-panel.md) — expands browser window targets from loopback to arbitrary HTTP(S). The `/<port>` compatibility route remains loopback-only
- Decision makers: Song Sanghun (request), Codex (design and implementation)

## Background

> **Supersession record dated 2026-09-03:** The general-purpose HTTP(S) proxy could not bypass providers' anti-bot and OAuth boundaries, including Google's,
> and was not the correct path for agent authentication either. Under [0109](0109-mew-agent-authentication-and-loopback-browser.md), the browser window
> opens only server loopback development addresses. This expansion to a general-purpose proxy will not be attempted again.

Relaying the server's Chromium screen as JPEGs makes the server the browser host and the source of the IP seen by the target, but the phone exchanges only pixels
and input, making scrolling, keyboard input, and selection slow like a remote desktop. The user's priority is for **the network source
seen by the target server to be the Mew server**, while the phone's browser directly handles layout and input. A VPN that changes traffic for the entire device, such
as a Tailscale exit node, has a broader installation and routing scope than required.

For OAuth, redirects from the provider back to `localhost:<port>/callback` and the state cookie must also follow the same server-side browsing context.
A proxy that serves only a single HTML page loses this context during cross-origin navigation.

## Options

1. Keep server Chromium display relay — web compatibility and the server fingerprint are the most accurate, but mobile interaction latency and display bandwidth are high.
2. VPN/exit node — retains the phone browser while obtaining the server IP, but requires managing device traffic outside Mew and a separate networking product.
3. Mew connects over HTTP(S) and WebSocket, and the phone browser renders rewritten documents—the display is native, but the web platform cannot be fully
   reproduced, and page URLs, cookies, storage, and dynamic requests must be translated into the proxy context.

## Decision

Adopt option 3.

- `GET /api/browser-url` creates an account-bound, 2-hour in-memory session and a signed URL. Each session has a separate server `CookieJar` and emulated local/session
  storage for each origin; these disappear when the server restarts or the session expires. Because the sandbox and browser
  third-party-cookie policies may leave subsequent requests without a Mew login cookie, the signed URL also acts as a request capability
  for its lifetime. However, requests presenting a cookie for a different Mew account are rejected.
- `server/browserProxy.ts` performs all target HTTP(S) requests and redirects on the server. It does not send Mew session cookies or visitor IP forwarding headers to the destination.
  The TCP source IP seen by the target is the Mew server's, while User-Agent and Client Hint values remain those of the connecting
  device.
- HTML processing uses a parse5 AST to handle URL attributes, inline styles, and CSP/SRI, and rewrites CSS and module import URLs into the
  proxy as well. A small runtime at the beginning of the document connects `fetch`, XHR, EventSource, WebSocket, dynamic DOM URLs,
  history, `window.open`, cookies, and Web Storage to the same session. The server relays WebSocket frames in both directions.
- Cross-origin document navigation and `Location` are wrapped again in a new page-origin signed URL while retaining
  the CookieJar. Thus, `로컬 앱 → OAuth 제공자 → localhost callback` also sends the final callback request to localhost in WSL.
- Target documents run in an iframe without `allow-same-origin` and under a response CSP sandbox. The Mew UI DOM and localStorage do not share a JS origin with
  target pages. Dynamic requests send the virtual page's `Origin`, and the target's CORS permissions are reapplied.
  Access is limited to manager and owner, as with the shell.
- The auxiliary window and standalone `/browser` popup use the same native iframe UI. Open iframes remain in the DOM when switching tabs, preserving
  page history and input state for as long as that window remains alive.
- Remove server Chromium, CDP WebSocket, profiles, the Chrome for Testing installation CLI, and the `MEW_BROWSER_EXECUTABLE` setting. `/<port>` retains its loopback-only
  entry format for compatibility with existing full-page access.

## Consequences and limitations

- Requests to sites that use IP as a criterion and localhost callbacks leave and arrive at the server. Meanwhile, **the browser fingerprint is the phone's**,
  including the screen size, touch capabilities, WebGL, and phone User-Agent read by JavaScript. This feature does not make it appear to be server Chromium.
- It broadly supports regular documents, SPAs, forms, cookies, WebSocket, and HTTP redirects, but is not complete general-purpose browser
  virtualization. Service Workers, IndexedDB, browser extension APIs, obfuscated direct assignments to `location`, and strict anti-proxy checks may break.
- Login may be denied if the OAuth provider prohibits iframes or embedded user agents themselves, or checks for an exact match between the redirect URI and the
  displayed URL. The proxy guarantees only that it routes the callback back to the server without changing the registered `localhost` callback value.
- This feature is an SSRF surface because target code can cause requests to public, private, and loopback addresses on the server's network. It is allowed
  only within the boundary where manager and owner already have shell access to the same scope, and access must not be lowered to member or guest.
- Without pixel streaming or a server browser process, display bandwidth, memory use, and input latency decrease, but text response rewriting and per-site
  compatibility maintenance introduce costs.
