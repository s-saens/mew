---
title: "Separate the Mew homepage and Mewlink entry"
description: "Decision to serve the one-page Mew homepage at mew.run and move canonical Mewlink entry to link.mew.run, preserving the app origin, legacy host protocols, identity namespaces, and request-authorized rollout, with execution priority updated by ADR 0168."
created: "2026-11-11"
updated: "2026-11-11"
---

# Separate the Mew homepage and Mewlink entry

Status: Accepted for implementation; production rollout pending.

## Context

The user requested a public one-page homepage at `mew.run`, with polished translucent and blurred surfaces, and a separate Mewlink login entry at `link.mew.run`. The previous [domain decision](0005-mewlink-domain-and-private-dashboard.md) assigned the apex to Mewlink. Saved host registrations bind proofs, tickets, and approved identities to their original central origin. The existing native iOS client also restricts navigation to known origins.

Read-only Cloudflare inspection on 2026-11-11 found the apex and `app.mew.run` attached to the existing `mewlink` Worker. `link.mew.run` has neither a DNS record nor a Custom Domain binding. Attaching it before compatible code is applied would return 404.

## Decision

| Origin or path | Responsibility |
| --- | --- |
| `https://mew.run/` | Public homepage regardless of account state |
| `https://link.mew.run/` | Sign in; signed-in users enter their own `/{username}` dashboard; unnamed accounts choose a username |
| `https://link.mew.run/{username}` | Private owner dashboard |
| `https://link.mew.run/{username}/{device}` | Public P2P connection entry, followed by local authorization |
| `https://app.mew.run` | Existing isolated app execution origin |
| Old apex and `mew.saens.kr` ordinary pages | Redirect to canonical Mewlink, preserving path and query, except the apex homepage and its assets |
| Configured legacy `/central/*` and `/auth/*` | Preserve exact host protocol and callback behavior |

Keep one Worker deployment with separate static entries. Declare a dedicated homepage origin, move `CENTRAL_ORIGIN` to `https://link.mew.run`, and retain both `https://mew.run` and `https://mew.saens.kr` as legacy central origins. Keep all existing domain bindings. `mew.run/demo` redirects to `link.mew.run/demo`; the demo retains its existing central/app boundary.

Keep `APP_ORIGIN`, `OAUTH_ORIGIN=https://mew.saens.kr`, and `EMAIL_IDENTITY_ISSUER=https://mew.saens.kr`. Preserve D1, Durable Objects, signing keys, registration origins, provider callback configuration, and immutable identity subjects. New host registrations use `link.mew.run`; displayed addresses for old registrations resolve directly against it without rewriting stored proofs.

Keep host-only secure management cookies and existing browser-key isolation. A new central origin can require fresh central and local sign-in. Do not transfer raw credentials through URLs or broaden cookie scope to `.mew.run`. Update native iOS allowlists and saved-link normalization; shipping those changes and real-device acceptance remain release requirements.

Use Cloudflare Worker Custom Domains to establish the new hostname, DNS, and certificate. Do not hand-edit Worker-managed DNS. Apply compatible code and domain configuration together. [ADR 0168](0168-request-build-deploy-authorization.md) supersedes the original agent deployment ban: Deploy on or an explicit request authorizes this documented rollout, including necessary domain operations. Separate launcher/server lifecycle operations remain outside that selection.

## Alternatives

- Keep management at the apex and place marketing elsewhere: conflicts with the requested public address.
- Create a second Pages/Worker project for the homepage: adds hosting and cross-project routing work without benefiting this static page; makes legacy apex protocols harder to preserve.
- Move the app runtime to another subdomain too: changes browser storage and trust without helping the requested entry split.
- Rewrite saved registration origins or share cookies across subdomains: risks broken signatures or authentication exposure.

## Consequences

The homepage and account entry have independent audiences and frontend assets. Existing hosts remain registered, and old links remain usable. New browser-origin storage does not inherit existing trusted-device keys, so renewed authentication is expected. Rollout must coordinate central source, host address presentation, and native iOS compatibility; source verification alone does not prove production login, certificates, or P2P connectivity.

This decision supersedes only the canonical public origin and apex entry in [ADR 0005](0005-mewlink-domain-and-private-dashboard.md). Its private-dashboard, origin-isolation, key-preservation, and networking decisions remain in force. The [homepage specification](../features/mew-run-homepage.md), [remote access contract](../development/remote-access.md), and [central runbook](../operations/remote-central.md) own the resulting behavior and operations.
