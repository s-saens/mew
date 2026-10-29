---
title: "Role-specific HTML and code separation for the Mewlink launcher"
description: "Decision to separate HTML entry points and JS/CSS for the device connection parent, app bridge, and management screen, and avoid an additional router round trip through Vite static dependency preload. Records the scope of public settings metadata and isolated bundle and browser verification."
created: 2026-10-20
updated: 2026-10-20
---

## Status

Accepted. Code and isolated verification are complete. Production builds, deployment, and actual connection times are checked separately after the user applies the changes.

## Background

[ADR 0028](0028-mewlink-websocket-bootstrap.md) removes the separate HTTP launch and overlaps host RTC preparation with the ticket round trip. The launcher still downloaded the same JS for both the connection parent and app bridge. A single file contained the management screen, provider SVGs, WebRTC, and resource bridge, so each role also downloaded code it did not use.

Even if a single source is split by role, a small router that requests JS again before starting the connection adds a round trip to the initial connection. Apply code separation together with direct HTML entry.

## Decision

`shared/remote-launcher-role.ts` shares the roles and HTML names for device/port addresses, app frames, and management addresses. The central Worker selects connect HTML for device connections, app HTML for internal launch, and dashboard HTML for login, registration, and the dashboard. Read HTML through extensionless internal ASSETS paths without redirecting public device URLs to canonical HTML paths.

The three HTML inputs use one `public/index.html` template during Vite pre-transform. Statically insert one role-specific entry into each document, and let Vite's HTML processing handle CSS and recursive modulepreload. Remove the existing combined `launcher.js` and `launcher.css` tags from role-specific HTML. Retain the small `client.ts` router and resources with their existing names only as compatibility paths for older HTML. [Vite HTML transformation](https://vite.dev/guide/api-plugin#transformindexhtml) · [Multiple HTML inputs](https://vite.dev/guide/build#multi-page-app).

The connection parent handles device verification, browser keys, WebRTC, sessions, trust, and recovery; the app bridge handles the credential-stripped MessagePort, Service Worker, and installed app frame. The management screen handles login, registration, and account, device, and browser management. Keep shared UI, requests, and types in separate modules, but do not load the management screen or provider SVGs during normal connections. The parent dynamically loads the management login module only when explicit Mewlink login is required.

`launcher-ui.ts` owns common DOM operations, and `dashboard-ui.ts` owns brand and provider SVGs. Split base/connection CSS into `launcher.css` and management-only CSS into `dashboard.css`, preserving existing declarations and screen behavior. Both entries and the lazy login module load base CSS before management CSS to preserve the override order for shared buttons and headers. Fonts continue to load only on the management screen.

The Worker inserts only two public settings, the central and app origins, into role HTML as metadata. The app bridge validates them and skips the separate `/config` request. Only older HTML missing both metadata values uses the existing settings lookup; partially missing or invalid values are treated as errors. Do not put nonces, tickets, browser keys, or sessions in HTML. Retain exact parent, origin, token, instance, and MessagePort validation and central/app origin isolation.

## Rationale and Impact

In isolated JS measurements using the same minification conditions as before separation, the combined body size for the connection parent and app bridge documents decreased by 47.54%, from 194,482B to 102,017B. Static shared chunks for each role were counted for each document; CSS, Vite preload helper code, and HTTP compression were excluded. These are not measurements of production build size or time to complete login.

New JS/CSS permits only the designated file formats directly under `/launcher/`. It does not newly expose source maps, nested paths, arbitrary source code, or central APIs. Role-specific HTML, chunks, and the Worker must be included in the same central deployment. [Remote access](../development/remote-access.md) defines the owning contract, and [central deployment](../operations/remote-central.md) defines rollout conditions. Private central source remains excluded from public Git.

## Verification Boundaries

Role-specific static chunks and downloaded bodies were checked using the actual in-memory ESM graph and two Chromium documents with caching disabled. Normal connections excluded the management screen and provider SVGs, and the app bridge excluded JOSE and the browser key implementation; there were 0 `/config` HTTP requests. The 11 existing launcher regression checks and 1 new graph check passed.

The 83 Workers checks cover shared HTML transformation, actual ASSETS GET/HEAD 200 with no Location, role selection, public metadata, CSP, API isolation, and resource path restrictions. Tests use and clean up temporary resource directories and do not build or change production `dist/`. Results of actual native P2P and long-running connection verification and type, lint, and documentation checks are recorded in the owning document. External networks, phones, and the 0.5-second target are measured after production rollout.
