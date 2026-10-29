---
title: "Command button port preview implementation and verification"
description: "Records implementation and verification of port buttons, public device URLs, direct preview modules, and remote initialization failure handling. Distinguishes confirmation of the DNS failure remaining after redeployment on 2026-10-28, improvements to read-only readiness checks and deployment completion criteria, and the scope still not restored in production. Also records the direct SPA initial route fix, isolated Along verification, and status of not applied to production."
created: "2026-10-27"
updated: "2026-10-28"
---

## Purpose and resulting behavior

Displayed ports opened by development server commands to the left of the stop and terminal buttons on each command row. Links actual processes to listening sockets and removes the button on the next list refresh when a port closes. The button opens a new tab with the port appended to the current Mew address without rerunning the command. A Mewlink example is `https://mew.run/saens/windows/5555`.

The current contracts are owned by [Command usage](../../../docs/guides/commands.md), [Shell terminal features](../features/terminals-agents-automation/tmux-shell-terminals.md), [Port detection and previews](../development/port-preview.md), and [Remote access](../development/remote-access.md). Public device base propagation and detection are recorded in [ADR 0076](../decisions/0076-command-port-previews.md).

## Verification

- `server/command-ports.test.ts`: checked HTTP/TCP, IPv4/IPv6, wildcard addresses, multiple ports, session isolation, port closure, parsers, and timeouts using actual Linux parent and child processes. For macOS and Windows, checked socket and process output parsers without executing actual commands.
- `server/cmd-button-ports.test.ts`: verified actual port associations in GET/PUT, nested projects, stopped sessions, exclusion of Mew listening ports, permission denial, lookup failure, and preservation of running status. Existing command configuration, subproject, agent terminal, and translation checks also passed.
- `packages/tmux-term/src/server/pane-pids.test.ts`: checked namespaces, lookup argv, pane PIDs, and Windows CRLF output using an isolated multiplexer test double. Confirmed a failure where PIDs were missing in the CRLF fixture, fixed it by normalizing line endings, and passed.
- `server/command-button-menu-ui.test.ts`: in isolated Chromium at 1100/390px in both themes, verified numbered button order, horizontal scrolling, keyboard access, local/public device new-tab URLs, errors from older central versions, removal after stopping, and prevention of reruns. Uses actual components and mock API responses; this test does not run an OS server. Captures were also reviewed.
- Existing shared-menu size, theme, focus, and arrow-key regression checks in `server/action-menu-ui.test.ts` and `src/utils/command-menu-keyboard.test.ts` also passed.
- `src/utils/port-preview-url.test.ts` and `src/utils/remote-reconnect.test.ts`: verified the public base, preservation of local domains and ports, rejection of invalid remote addresses, and base preservation during existing reconnection behavior.
- The 9 existing tests in `server/port-preview.test.ts` and `server/port-preview-browser.test.ts` passed for modules, POST, HMR, cookies, SSE, and permission boundaries over direct HTTPS tunnels and remote raw P2P.
- The central service's 16 tests in `mewlink/test/startup.browser.test.ts`, 2 tests in `mewlink/test/port-preview.test.ts`, and `npm --prefix mewlink run check` passed. Verified public device base propagation on first visits, reloads, and preview subpaths.
- `npx tsc -b` and oxlint targeting the changed TypeScript passed. Impeccable `detect` returned an empty array.
- `npm run check:docs` found no errors in 491 descriptions. The full link check failed due to 17 existing links pointing to feature MOC and task documents deleted outside this work. The 6 documents changed in this work have no link errors.

## Central changes and application limitations

`mewlink/src/launcher-types.ts`, `connection-parent.ts`, `app-launcher.ts`, and `mewlink/test/startup.browser.test.ts` are Git-ignored paths in this checkout. Saved a separate patch containing only those central changes at `/tmp/mew-command-port-preview-central.patch` and checked whether it could be reverse-applied to the current source. This file is a temporary local artifact, so the central maintainer must retain and apply it separately. Central source was not forcibly added to the public repository.

Actual pane/process lookups on macOS and Windows and actual access through public `mew.run`, user domains, Tailscale, and external networks were not verified. IPv6 fixtures also ran in isolated Linux checks. Reparented daemons, separate container processes, and non-HTTP services are outside the automatic association scope.

App and central builds and deployments and starts, stops, and restarts of running servers were not performed. The user must apply the host app and central changes separately, and existing `PREVIEW_DOMAIN`, wildcard DNS, HTTPS, and Worker prerequisites remain.

## 2026-10-27 — Improved command name visibility

In response to a report that port buttons obscured most of the names, widened the command menu by 40%, from 220px to 308px, with a maximum of 90% of screen width. Slightly reduced font size, line spacing, outer/item padding, and run and terminal button widths. Added themed backgrounds, borders, and small corner radii to ports and limited the group's width to leave room for names. Current values are owned by the [Shared UI contract](../development/ui-contracts.md#dropdowns-and-selection-components).

- 4 tests in `server/command-button-menu-ui.test.ts`, `server/action-menu-ui.test.ts`, and `src/utils/command-menu-keyboard.test.ts` passed. Using actual components and a mock API, verified menu width, smaller text and padding, port backgrounds/borders, name area, and existing keyboard, execution, and new-tab behavior at 1100/390/320px in both themes and after resizing to 240px. Also checked regressions in hamburger and project menus and shared surfaces.
- `npx tsc -b` and oxlint targeting the changed TypeScript passed. Impeccable `detect` was an empty array. Reviewed isolated captures at 390px in the dark theme and 320px in the light theme.
- 491 descriptions in `npm run check:docs` passed without errors. The full link check failed due to the same 17 existing missing links as in the previous work; the 3 documents changed in this work have no link errors.

App builds, deployment, server restarts, and application on actual phones were not performed.

## 2026-10-27 — Port connection failure reproduction and fix

Observing the currently running Vite app in direct preview through an isolated proxy and browser showed that inline React Refresh and some multiline imports were requested from the Mew root, causing CORS errors and a blank screen. The existing fixture, which used only simple modules, did not cover this case. Changed inline and external script processing to use a lexer that parses actual specifiers, protecting strings, comments, JSON, and source maps. Follows [ADR 0078](../decisions/0078-port-preview-module-initialization.md).

The Mewlink public device address returned HTTP 200, but DNS for the preview domain and two distinct random hosts returned `ENOTFOUND`. Existing remote browser checks replaced host resolution and certificates with fixtures, so they did not establish actual DNS readiness. Added initialization completion/failure notifications and a 15-second limit to remote mounts to report readiness failures on screen and clean up sessions, requests, sockets, and ports. Shared launcher assets are also included in the central build.

- The direct HTTPS tunnel browser test with added inline React Refresh, multiline imports, and fixed-template dynamic imports failed before the fix by timing out while waiting for the expected screen, then passed after the fix.
- 13 tests in `server/port-preview.test.ts`, `server/port-preview-browser.test.ts`, and `server/port-preview-launch.test.ts` passed. Verified preservation of comments, strings, JSON, and source maps; modules, POST, HMR, permissions, origin, and SSE; and remote timeouts, Service Worker failures, forged messages, and resource cleanup.
- Isolated diagnostics of the currently running Vite app also showed that the existing module CORS errors disappeared and the app body rendered after the fix. The app displayed its own route guidance screen because of the proxy pathname, so this is not recorded as successful app router operation. Also confirmed that the separate API service's `/` 404 was the upstream's own response.
- Oxlint targeting the changed TypeScript and JavaScript and `npx tsc -b` passed. Temporary diagnostic browsers and HTTP servers were shut down.
- `npm run check:docs` found no errors in 494 descriptions. The full link check failed due to 17 existing missing targets; the documents changed in this work have no link errors.

DNS, certificates, Worker settings, and production servers were not changed. The user must build the host, apply the central shared assets, and prepare wildcard DNS and HTTPS. Existing [router compatibility limitations](../development/port-preview.md#compatibility-and-validation), such as basename configuration for path-based apps, also remain.

## 2026-10-28 — DNS failure after redeployment and readiness checks

The user reported that the preview random host's IP address still could not be found after redeploying the central service. Confirmed that the host returned `ENOTFOUND` through the system resolver, Cloudflare `1.1.1.1`, and Google `8.8.8.8`. A read-only Cloudflare API query showed that the `*.preview.mew.run/*` route was connected to the `mewlink` Worker. DNS and certificate API queries using the current CLI authentication were denied with 403. Worker route deployment and DNS readiness are separate; in this case, redeployment alone did not create the missing DNS records.

Added `tools/port-preview-readiness.mjs` and `npm run check:port-preview`. They check DNS, verified HTTPS, launcher HTML, parent origin and shared JavaScript, Service Worker scope, and initialization completion notifications for two distinct random hosts. DNS failures display the required records, while HTTPS, Worker route, and asset errors are distinguished by stage. Current readiness requirements and usage are owned by the [Deployment procedure](../operations/remote-central.md#localhost-app-preview-origin) and [Preview contract](../development/port-preview.md).

Also connected the same check after Worker deployment in the private `mewlink/scripts/deploy.mjs`. If previews are not ready, it does not print the overall deployment completion message and does not automatically roll back the already applied Worker. This file is Git-ignored, so it was not forcibly added to the public commit; a patch containing only this central change was saved at `/tmp/mewlink-preview-readiness.patch`. The central source and patch must be retained and applied separately.

- `node --test tools/port-preview-readiness.test.mjs server/port-preview-launch.test.ts`: 42 checks passed. Verified missing DNS, registration of only some hosts, TLS certificates, incorrect Worker responses, outdated assets, time limits, CLI exit status, and existing initialization cleanup. External connections were mocked.
- Oxlint targeting the changed JavaScript, `node --check` for the central deployment script, and `git diff --check` passed.
- The actual `npm run check:port-preview` displayed `ENOTFOUND` for two new random hosts and returned exit code 1. This detected that production previews were not ready; it was not a successful recovery.
- Document checks found no errors in 505 descriptions, but the full link check failed because of 18 existing links to feature MOCs and tasks deleted outside this change. The documents changed here have no link errors.

DNS, certificates, the production Worker, servers, and `dist/` were not changed. Restoring actual preview access still requires DNS and HTTPS readiness and follow-up access checks on devices.

## 2026-10-28 — Fix SPA initial paths in direct previews

Along opened through `/5173` read the internal proxy path as the app path even after modules loaded and displayed its own 404. The existing fixture used a Mew-specific basename and could not verify how a general SPA recognized its initial path. The JSON 404 from `/3001` was confirmed to be the same API root response on localhost.

Global address references in executed scripts were connected to virtual Window and Location objects through syntax and scope analysis. The actual Document, native iframe URL, and opaque sandbox are retained. App paths are restored across history, fragments, and reloads, and the entry URL's fragment is also passed to the iframe. [Port Preview](../development/port-preview.md) owns the detailed contract, and [ADR 0083](../decisions/0083-direct-preview-spa-routing.md) owns the decision rationale.

- The regression check for an SPA without a basename failed on the initial `/` expectation before the fix and passed afterward. Checks covered root and deep paths, query and fragment, push/replace/back/forward, hash, iframe reloads, link navigation, and preservation of the API root 404.
- Checks covered local bindings, strings, comments, shorthand properties, automatic semicolon insertion, constructor precedence, and worker fallback in global reference transformations. Event receiver caching, nonconfigurable property definitions, and Document DOM identity issues found in a separate review were also fixed, with regression checks added.
- 21 related checks passed with `node --test server/port-preview-location.test.ts server/port-preview-routing.test.ts server/port-preview.test.ts server/port-preview-browser.test.ts server/port-preview-launch.test.ts`. These include existing checks for HTTPS tunnels, P2P, POST, HMR, cookies, permission revocation, and SSE.
- The currently running Along was opened through an isolated proxy in a new browser context to verify the login screen and navigation to the sign-up link. There were no JavaScript errors, and neither login nor account creation was submitted. The temporary browser and proxy were cleaned up.
- `npx tsc -b` and oxlint for the changed TypeScript files passed.
- `npm run check:docs` found no errors in 519 descriptions but failed because of 18 existing missing links outside this change. Links in the 6 changed documents have no errors.

No app build, deployment, or start, stop, or restart of the running server was performed. The user must apply the changes to production for the actual user domain. Compatibility limits for dynamically executed code, Next static chunks, and original browser identity follow the current contract.
