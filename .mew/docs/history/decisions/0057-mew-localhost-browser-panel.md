---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: the mew browser window opens through a loopback proxy restricted to managers and owners. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0057 — The mew browser window opens through a loopback proxy restricted to managers and owners"
created: 2026-08-19
updated: 2026-09-11
---

- Date: 2026-08-19
- Status: Adopted
- Subsequent decision: [0127](0127-mew-browser-server-dom-runtime.md) — loopback iframe in the general Browser panel; /<port> and Android proxies remain
- Decision maker: Codex + user request

## Background

When opening mew remotely, users want to view development servers running inside WSL, such as `localhost:3100`, on the same screen. Entering `localhost:3100`
in the browser address bar accesses localhost on the visitor's device, which serves a different purpose. Having to connect using the Tailscale
hostname every time is also cumbersome.

However, having the mew server open URLs on the user's behalf creates an SSRF surface. This could enable internal network probing, forwarding of mew session
cookies, or calls to the mew API by a proxied app with same-origin privileges.

## Options

1. Open the iframe directly at `http://<mew-host>:3100` — the implementation is small, but it cannot guarantee access to WSL localhost, and the target port must
   be exposed separately to the tailnet.
2. Build an arbitrary-URL proxy — convenient, but dangerous because it can open internal network addresses, metadata addresses, and public URLs on the user's behalf.
3. Restrict a loopback-only proxy to managers and owners, and isolate the iframe with a sandbox.

## Decision

Option 3. Add an `Alt+B` browser window, but allow only `localhost`, `127.0.0.0/8`, and `::1` through the server proxy. Access is restricted
to manager and owner, as with the terminal. Do not grant `allow-same-origin` to the iframe, and do not forward mew cookies or Authorization to the target
server through the proxy.

If a full page is needed, open `/<port>` through the same proxy. For example, `/3100` maps to `http://localhost:3100/`. After checking the manager
or owner session on the initial request, redirect to an internal path containing a short signed
token, and apply `Content-Security-Policy: sandbox` to the response so it does not receive same-origin privileges even without an iframe.

## Rationale

- Local development servers often lack authentication or assume administrator privileges. Members can read and write workspace files but cannot
  access the shell or internal services. For the same reason, the browser window follows the terminal access gate.
- Allowing only loopback provides access to WSL local servers such as `med-app` that users want to view, while closing off the route for using mew as an internal
  network scanner.
- Because the proxy path shares mew's origin, the target app's JavaScript could call the mew API without a sandbox. Omitting
  `allow-same-origin` reduces some development conveniences (localStorage and HMR WebSocket), but the session boundary is more important.
