---
title: "Account-level theme storage and cross-device synchronization"
description: "Moves the selected theme and custom list to account storage with conditional migration, account change signals, return refetching, and late-response protection. ADR 0092 adds icon pack choice to the same contract while preserving per-device language and font settings."
created: 2026-10-20
updated: "2026-10-30"
status: accepted
---

[ADR 0092](0092-curated-icon-packs.md) adds optional icon pack selection to this account synchronization contract. Palette, custom-theme, migration, and account isolation behavior remain.

## Background

When a theme is changed on another device using the same account, the same selection must also appear on the device used earlier. Existing per-browser storage cannot share selections or custom lists, and uploading an outdated copy to the server can lose another device's latest selection.

## Decision

Store the selected palette and custom list together in the account UI ledger of the same Mew instance. Determine the owning account only from authenticated requests and normalize input using a shared model. Use browser-stored values as an initial-screen cache and the source for initial migration. Migrate conditionally only when the account has no theme; if another device has already saved one, return that value.

After saving, send a theme change signal with no content only to the same account over the existing presence socket, then refetch through REST. Also check when returning to the screen, restoring from bfcache, coming back online, or reconnecting the socket. Apply explicit user changes immediately and serialize saves within the device; applying a remote fetch alone does not trigger another write. Across devices, follow the last server save, and prevent late responses and responses after an account switch from changing a newer selection.

## Rationale and Impact

Reuse the existing account ledger and presence connection to provide the same theme on all devices without separate storage, sockets, or polling. Custom theme colors, gradients, and animations are shared as well. If a server save fails, retain the current selection, report the error, and retry on the next return, reconnection, or change.

Extend the browser storage scope of [0002 — Three-color themes](0002-theme-palettes.md) to account storage. Retain the palette, draft, and rendering contracts of [0010 — Theme gradients](0010-theme-gradients.md). Other device settings, such as language, fonts, and Dock, are not included in this synchronization. [Account themes](../development/browser-storage.md#account-themes) owns the current API, migration, cache, and verification contracts, and [display settings](../../../docs/configuration/appearance.md#appearance-settings) owns user operations.
