---
title: "Mewlink Migration to mew.run and a Private Dashboard"
description: "The decision to move public device addresses to mew.run and choose a private dashboard under a user path, preservation of existing registrations, identities, and OAuth, an internal app origin within the same site, and a restricted UDP inbound range."
created: 2026-10-15
updated: 2026-10-16
---

# Mewlink Domain and Dashboard

Status: Approved.

## Background

The user requested migration of existing device addresses to the purchased `mew.run` and a list of their own devices when logged in at `/{username}`. They also reported failed unauthenticated access from a separate phone. Existing registrations and locally approved identities validate the previous central origin, so changing only the address strings could break connections and approvals.

## Decision

- The public device address is `mew.run/{username}/{device}`, and connection setup begins without central login. Workspace access follows local mew authentication.
- `mew.run/{username}` is the device dashboard for the user logged in centrally. Do not expose other accounts' lists. The previous `/dashboard` provides only a compatibility redirect.
- Run the internal app at `app.mew.run`, a separate origin within the same site. Maintain isolation of central authentication cookies and APIs.
- Support registration and persistent connections from the specified previous central origins. Preserve device IDs, keys, the DB, and approved identities, and validate tickets against the actual host's origin. Also preserve the issuer namespace for direct email accounts.
- While retaining the existing callbacks in the provider console, exchange browser-cookie-bound, single-use login proofs valid for 60 seconds between the fixed OAuth origin and the new management origin. Do not allow the app origin or arbitrary redirect addresses.
- Restrict native Mewlink UDP ports to `55000–55031` so that only the required inbound range can be allowed in WSL.

## Rationale and Impact

An app origin within the same site reduces mobile browsers' cross-site storage restrictions. Preserving both existing registration keys and exact origin validation enables migration without re-registration. Dashboard authentication and connection initiation for public devices are separate permission boundaries.

On 2026-10-15, STUN candidate generation and an anonymous mobile Chromium connection on the same PC were confirmed in the production WSL mirrored mode, but Hyper-V blocked inbound traffic by default and there was no Mewlink-specific UDP allow rule. Adding a scoped rule was denied due to insufficient administrator privileges. This observation does not establish a single cause for the external phone failure or mean that external-network validation is complete.

[Remote Access Contract](../development/remote-access.md) and [Central Deployment](../operations/remote-central.md) own the current implementation and operational procedures. This decision changes the domain and separate dashboard address from the previous [Workers/P2P UI Decision](../history/decisions/0203-mewlink-workers-p2p-ui.md) while preserving the local authentication boundary.

Automatic preparation of the restricted UDP range and temporary router mappings are defined in the subsequent [0006](0006-mewlink-direct-network-preparation.md).
