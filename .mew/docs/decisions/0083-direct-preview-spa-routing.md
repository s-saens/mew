---
title: "SPA address reference transformation in direct previews"
description: "Decision to adopt syntax- and scope-based reference transformation so ordinary SPAs read app paths instead of internal prefixes in direct /port-number previews. Preserves native Document and Location and sandbox boundaries, and explains support limitations and the separate-origin alternative."
created: "2026-10-28"
updated: "2026-10-28"
---

Status: Adopted

## Background

Along worked at `localhost:5173` but displayed its own 404 screen at `/5173` on the direct Mew address. Modules were delivered, but the router read the iframe's `/__mew_port_preview/<origin>/<token>/` as the app path. Existing checks missed this failure because the app fixture used a Mew-specific basename. The 404 at the API root of `/3001` is preserved separately because upstream returns the same response.

## Decision

Add syntax and scope analysis of `acorn` and `eslint-scope` to the module specifier transformation in [Decision 0078](0078-port-preview-module-initialization.md). Only free global references in direct-preview scripts are connected to virtual Window and Location objects; local bindings, data, strings, and comments are preserved. The actual Document retains its DOM identity, with only the necessary address properties transformed.

The virtual address reconstructs the app path from the current native iframe URL. History and fragment navigation occur within the existing capability URL. Native Location is not overridden, and `allow-same-origin` is not added. The existing delivery method is retained for analysis failures, unsupported executable code, and Next static chunks.

## Alternatives and Rationale

- Requiring basename changes for each app would not meet the goal of opening working localhost apps as they are.
- Regular expressions cannot distinguish local variables, properties, and strings from executable references. Scope analysis preserves local bindings with the same name.
- Native Location cannot be overridden. Replacing the entire Document with a Proxy breaks Node checks and identity in DOM functions, so only address access is handled.
- A separate origin provides broader compatibility but requires additional DNS and HTTPS setup for direct IP addresses and user domains. Mewlink's existing separate origin remains an alternative for apps that require those conditions.

## Impact

Ordinary SPAs do not need a Mew-specific basename setting for initial paths, history, or hashes. This increases server-side JavaScript analysis costs and runtime dependencies and does not transparently reproduce all dynamic code or browser identity behavior. Login, port capability, opaque sandbox, and remote transport boundaries are preserved.

The [Preview contract](../development/port-preview.md) owns the current support scope, [Opening localhost apps](../../../docs/guides/browser.md#open-host-localhost-apps) owns usage instructions, and the [Work record](../work/command-port-previews.md#2026-10-28--fix-spa-initial-paths-in-direct-previews) owns validation and the status of not applied to production.
