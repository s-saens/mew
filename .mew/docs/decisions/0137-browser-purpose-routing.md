---
title: "0137 — Choose Chrome or Chromium by browser purpose"
description: "Selects ordinary installed Google Chrome for login and external DOM pages, with Playwright Chromium for loopback apps and UI automation. Extends ADR 0136 with independent overrides, URL-based switching, per-role session state, and cross-runtime history; ADR 0139 adds managed runtime dependency preparation; ADR 0146 supersedes the default UI routing while retaining the automation and installation roles."
created: "2026-11-05"
updated: "2026-11-05"
status: "accepted"
---

## Context

[ADR 0136](0136-chromium-browser-restoration.md) restored Chrome/Chromium after the Obscura experiment. The internal Browser and UI tests preferred the same Playwright executable for all target URLs; the login screen could fall back to that testing executable when ordinary Chrome was absent.

The user requests ordinary Google Chrome inside WSL for login and external websites, while retaining the Playwright-installed browser for localhost development and UI automation. Installing Chrome alone would not change the internal Browser's Playwright-first selection.

## Decision

Use two explicit purposes without adding a browser-choice control to the UI:

| Purpose | Default executable |
| --- | --- |
| Native login video screen | Ordinary installed Google Chrome |
| Internal Browser: external or LAN URL | Ordinary installed Google Chrome |
| Internal Browser: structural loopback URL | Playwright Chromium, then installed Chromium |
| UI test and automation helper | Playwright Chromium, then installed Chromium |

`MEW_CHROME_EXECUTABLE` and `MEW_CHROMIUM_EXECUTABLE` independently override these roles. Preserve `MEW_BROWSER_EXECUTABLE` below the dedicated settings for compatibility. Do not automatically substitute one role's binary for the other when a prerequisite is missing. A Playwright distribution may identify its Chromium executable as Chrome for Testing; it remains the automation role.

Classify top-level HTTP(S) URLs structurally, without DNS lookup: `localhost`, subdomains ending in `.localhost`, `127.0.0.0/8`, `::1`, and IPv4-mapped loopback choose Chromium. Other hosts, including private LAN addresses and DNS names resolving to loopback, choose ordinary Chrome. Subresources stay with the selected page's browser.

Switch browser processes on explicit navigation, links, and redirects that cross roles. Keep the viewer connection, viewport, theme, bounded asset handling, permission checks, and port guards. Retain per-role cookies and local storage in session memory and clear them when the panel closes. Keep toolbar history across runtimes; visits that no longer belong to the current native runtime reload their URL. Bound automatic role-changing redirects and preserve ordinary request methods/bodies when available.

External DOM browsing still uses Playwright/CDP and rrweb. Selecting an ordinary Chrome executable does not change it into the native login video screen or remove automation control. Login retains its separate OS-input/video mechanism and account profile.

## Alternatives and rationale

One common executable override cannot keep ordinary Chrome installation from affecting tests or keep the testing build out of login. Using ordinary Chrome everywhere would weaken the requested stable testing-binary boundary. Choosing a browser only on the first URL would violate the requested split when a page links or redirects across localhost and external sites.

## Consequences

Both browser installations are required for the complete feature set. Role changes create a fresh native runtime and can add startup cost; saved storage preserves cookies/local storage, but cross-runtime traversal reloads page state. File uploads, unavailable POST bodies, canvas, media, nested frames, and DOM replay retain their documented limits. This decision does not establish successful authentication with any external provider.

Current contracts: [DOM browser](../development/port-preview.md#internal-dom-browser), [login desktop](../development/login-desktop.md), and [UI tests](../development/browser-testing.md). Installation and checks are recorded in the [work record](../work/browser-purpose-routing.md).

[ADR 0139](0139-browser-runtime-dependencies.md) extends dependency ownership with source and prebuilt preparation. It preserves this purpose split while requiring the Playwright-pinned Chromium for default readiness.

[ADR 0146](0146-native-browser-video-and-local-app-tabs.md) supersedes this decision's default DOM-browser UI and loopback runtime switching. Localhost apps now open proxy tabs and the Browser panel uses native headed Chrome video. The original rationale and compatibility implementation remain historical evidence; UI automation retains Playwright Chromium.
