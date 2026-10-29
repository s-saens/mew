---
title: "Tailscale proxy target repair"
description: "Records the 2026-10-30 host-side repair of a stale Tailscale Serve target, additional private TCP access, successful host-side HTTP checks, and remaining verification from another device."
created: "2026-10-30"
updated: "2026-10-30"
---

Mew was unreachable through Tailscale because its HTTPS Serve listener forwarded to port 3000 while Mew listened on loopback port 5000. Local Mew HTML and authentication JSON returned HTTP 200; requests to port 3000 and the Tailscale HTTPS address timed out before the repair.

The host's persistent Serve configuration now forwards HTTPS port 443 to `http://127.0.0.1:5000` and TCP port 5000 to `127.0.0.1:5000`. The existing code-server TCP forwarder on port 8282 remains configured. Mew's process, loopback binding, and application files were unchanged. No build, deployment, or Mew restart ran. The recurring procedure belongs in the [deployment runbook](../../../docs/operations/deployment.md#diagnosing-tailscale-access-failures).

Automated assertions checked the Serve configuration and verified HTTP 200 for Mew HTML and unauthenticated `/api/auth/me` JSON through loopback, the host's Tailscale IP on port 5000, and its Tailscale HTTPS hostname. The existing code-server health endpoint also returned HTTP 200 through the Tailscale IP on port 8282.

`npm run check:docs` passed with 551 descriptions, zero metadata errors, and zero document link errors.

These checks ran from the host after applying the proxy changes. Browser login, WebSockets, and access from another tailnet device remain unverified.
