---
title: "Port Preview DNS and TLS Repair"
description: "Records the 2026-11-02 Cloudflare wildcard DNS and managed certificate repair for preview.mew.run, matching Wrangler configuration, regression checks, and the distinction between infrastructure readiness and actual P2P app verification."
updated: "2026-11-02"
---

# Port preview DNS and TLS repair

The user reported that Worker deployment succeeded but the deployment script failed its port-preview readiness check with `ENOTFOUND`. The existing `*.preview.mew.run/*` route pointed to `mewlink`, but no preview DNS record existed, and active zone certificates did not cover `*.preview.mew.run`. The [central service runbook](../operations/remote-central.md#localhost-app-preview-origin) owns the recurring procedure.

## Applied Cloudflare configuration

Using the connected Cloudflare MCP on 2026-11-02:

- Added a proxied CNAME `*.preview.mew.run` targeting `mew.run`, with automatic TTL.
- Attached the exact `preview.mew.run` Custom Domain to the existing `mewlink` Worker, with production enabled and Cloudflare Worker version previews disabled.
- Confirmed that Cloudflare issued an active managed certificate covering `mew.run`, `preview.mew.run`, and `*.preview.mew.run`. Its certificate pack progressed from pending validation to active, with expiry on 2027-01-31.

The wildcard Worker route was preserved. No Worker code deployment, paid certificate subscription, or Mew server lifecycle operation was performed.

## Local configuration and verification

Added the same Custom Domain to the independent `mewlink/wrangler.jsonc` so the next user deployment retains it. Updated its README and added a regression test requiring the wildcard route, the base Custom Domain, and disabled Worker version previews. The new regression failed against the previous configuration because the base Custom Domain was absent.

After adding DNS, the public readiness check advanced from `ENOTFOUND` to TLS handshake failure while certificate issuance was pending. Once the certificate became active, `npm run check:port-preview` passed against two fresh random hosts, verifying DNS, certificate validation, the Worker launcher, and public preview assets. A Cloudflare API readback confirmed the proxied wildcard CNAME, the unchanged wildcard Worker route, and the enabled production Custom Domain with Worker version previews disabled.

Local verification passed:

- `npm --prefix mewlink run test:deploy`: 9 tests, including the new configuration regression.
- `node --test tools/port-preview-readiness.test.mjs`: 37 tests, including subtests.
- `npm exec -- oxlint mewlink/test/wrangler.node.test.mjs`.
- Root `npm run build`: TypeScript and Vite succeeded; Vite retained its large-chunk warning.
- Changed-file whitespace checks, document descriptions, and local links.

The repository-wide `npm run check:docs` passed all 653 descriptions but failed on one unrelated absolute asset link in `.mew/tasks/Image preview and attachment editing.md`. That task file was left unchanged.

Infrastructure readiness does not establish an authenticated connection to a real device, P2P transport, or upstream app behavior. Those require the separate runtime checks in the runbook.
