---
title: "Installable web app and installation-first startup guidance"
description: "Decision to provide an installation manifest and icons for direct access and Mewlink public device pages, recommend installation before fullscreen without adding offline caching, and separately store permanent dismissal of the two prompts. Defines boundaries for host updates, central deployment, and actual mobile verification."
created: "2026-10-26"
updated: "2026-10-26"
status: "accepted"
---

## Background

In ordinary web fullscreen mode, the browser handles Esc and mobile Back first, potentially exiting fullscreen before closing a popup. Mew previously recommended only fullscreen first and did not allow permanent dismissal of the prompt. In addition to installation through desktop browser menus, mobile installation also required a manifest, icons, and guidance.

## Decision

Add an installation manifest and PNG icons in multiple sizes to the existing web app. Request `fullscreen` as the installed launch mode and fall back to a supported mode in unsupported browsers. Launching from the installed app does not require entering the existing Fullscreen API mode. In Mewlink, the top-level public device page provides installation information and connects installation status and actions to the internal app through the existing connection channel.

The startup guidance displays installation before fullscreen. Use the install button when the browser provides an installation prompt. On mobile and desktop browsers that support installation, provide manual installation instructions even without an event; in other environments, provide guidance when an installation event is available. Hide both prompts once installation completion or an installed app launch is confirmed. Each prompt has its own **Don't show again** option, and the choice is immediately saved as an independent browser setting.

Do not introduce a separate offline cache or service worker for installation. Retain the existing Mewlink static asset relay; the host, network, and existing authentication remain required. The [Shared UI Contract](../development/ui-contracts.md#installable-web-app-and-startup-guidance) owns the detailed display and connection contracts, [Browser Storage](../development/browser-storage.md#dont-show-again-for-startup-guidance) owns storage, and [Mobile Guide](../../../docs/guides/editor.md#mobile-and-fullscreen) owns user actions.

## Rationale and Impact

Include installation information in the existing web deployment without a separate app package or store listing. HTTPS or localhost is required, and installation menus and display modes may vary by browser. Do not promise that app code can bypass input interception in ordinary web fullscreen, and installation alone does not grant Keyboard Lock permission.

Direct access receives the change through a host Mew update. Mewlink access also requires a separate deployment of the central source excluded from Git. Agents do not build the app, run the server, or deploy the central source. Actual Android and iOS installation and back navigation and fullscreen behavior in installed mode are not guaranteed until verified on physical devices.
