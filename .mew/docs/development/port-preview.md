---
title: "Localhost app tabs and port previews"
description: "Defines new-tab localhost app routing through the existing authenticated direct/Mewlink port proxy, host port discovery, command detection, URL rewriting, sandbox boundaries, and compatibility limits. Links the default native Chrome video browser and retained DOM implementation history."
created: "2026-10-20"
updated: "2026-11-05"
---

<a id="internal-dom-browser"></a>

## Internal Chrome video and localhost apps

The Browser dock starts ordinary headed Chrome at `about:blank` inside its own virtual X11 display. It sends low-delay H.264 over the existing native desktop WebRTC transport; native pointer, key, paste, and wheel input return through WebRTC data channels. Chrome's own address bar, tabs, menus, and page rendering remain visible. The [browser desktop contract](browser-desktop.md) owns capture, profiles, permissions, lifetimes, and verification. UI tests retain Playwright Chromium.

Localhost HTTP(S) links in Mew, including terminal URLs and command-menu port numbers, open a new viewing-device tab at the existing `{mewAddress}/{port}` preview entry. Paths, queries, and fragments are preserved. `Menu → Localhost browser` opens the port picker; selecting a port opens the proxy tab without starting/stopping the app or creating a host browser context. The [local app proxy](#legacy-proxy-entry-and-execution) executes the app on the viewing device under its existing authenticated sandbox. Existing HTTP loopback proxy semantics and compatibility limits still apply to HTTPS-only local services.

The default panel no longer uses DOM replay, screenshot polling, Playwright, or CDP. The retained `/api/dom-browser/ws` implementation is a compatibility endpoint, with its former contract preserved in [history](../history/dom-browser-purpose-routing.md). The native browser's WebSocket signaling endpoint is `/api/browser-desktop/ws`; direct H.264 media and input do not pass through the Mew application WebSocket. Mewlink's shared socket allowlist includes the new signaling route and requires the corresponding central update.

This routing follows [ADR 0146](../decisions/0146-native-browser-video-and-local-app-tabs.md), which supersedes ADR 0137's default UI split while retaining its automation and ordinary-Chrome installation roles.

### Host port discovery

The Browser start page lists host localhost TCP listeners independently of command sessions/projects. `GET /api/dom-browser/ports` returns sorted, deduplicated `{ ports: [{ port, kind, title?, processName? }] }`. `kind` is `app`, `mew`, or `blocked`; only `app` opens `http://localhost:<port>/` in the existing DOM browser. Explicit paths and external HTTP(S) addresses remain available.

Discovery reads Linux `/proc/net/tcp` and `tcp6`, macOS `lsof`, or Windows `Get-NetTCPConnection`. It includes canonical IPv4/IPv6 loopback and wildcard TCP listeners without scanning ranges, probing HTTP, or starting apps. A listener may be non-HTTP; discovery does not prove it serves a website. LAN-only bindings and other network namespaces are excluded. macOS/Windows visibility depends on OS permissions.

The live Mew registry records each registered HTTP server's actual listening port. Matching discovered ports receive a disabled **Mew** control. Configured Mew/reserved development ports without known Mew listeners appear unavailable, without attributing another service to Mew. Navigation, asset, and redirect guards share this policy, including listeners started after a browser connection opens. Manual address entry cannot bypass a disabled port.

Discovery requires current login and `portPreview`, rechecks access after scanning and title lookup, and responds no-store. Reads have a five-second deadline and four-MiB output limit. Missing tools, unreadable data, or timeouts return recoverable 503, not a successful empty list. Entry/refresh scans cancel obsolete reads and disable stale rows during refresh/failure. A 404 or successful HTML response from this JSON endpoint specifically instructs the user to restart Mew with current server code: rebuilding `dist/` can leave new UI against old in-memory routes. After applying server code, retry reads normally. There is no background polling or new central socket path; Mewlink uses existing authenticated requests.

After OS discovery, `server/dom-browser-port-titles.ts` makes best-effort HTTP root-page requests for eligible app ports and returns an optional `title`. It never probes Mew or blocked ports, forwards no credentials/cookies, and executes no scripts. Redirects are limited to three within the same port and canonical loopback HTTP hosts; external, credential-bearing, cross-port, and HTTPS redirects are ignored. IPv4 loopback is tried first, with IPv6 fallback on connection failure. Current access and port policy are checked before requests; the response reclassifies listeners that become Mew/blocked during lookup.

Title lookup processes at most 32 eligible ports, with four concurrent workers, 600 ms per port, a 1200 ms total batch budget, and a 128 KiB response limit. Titles are parsed from HTML, decoded as text, whitespace-normalized, and capped at 200 characters. Slow, missing, non-HTML, failed, or JavaScript-only titles leave the original row without a title; partial successes survive the deadline. Closing or refreshing the list cancels outstanding work. No background polling or persistent title cache is added. The UI shows the name first, followed immediately by the numeric port in a compact tag. An HTML page title takes priority over the owning process name; Mew retains its fixed name, and a row with neither name uses the localized `(Unnamed)` label. Names truncate before the port tag and use the shared tooltip. See [ADR 0123](../decisions/0123-localhost-port-page-titles.md) and the [title lookup work record](../work/localhost-port-page-titles.md).

`server/dom-browser-port-processes.ts` resolves optional process names in parallel with title lookup. Linux joins the shared TCP inode parser to numeric `/proc/<pid>/fd` socket links and reads only `comm`; macOS joins command fields from `lsof -Fpcn` to the shared listener parser; Windows joins `Get-NetTCPConnection` owners to `Get-Process` names. No process arguments, environment variables, PID, or paths are returned, and port numbers never imply a service identity. Multiple owners produce sorted, deduplicated names capped at 80 Unicode characters. Blocked ports may show a process name while staying disabled; Mew rows retain only their known identity.

Process lookup is best effort, with a 1000 ms batch deadline, partial results, at most 256 requested ports, eight Linux filesystem workers, 4096 PIDs, 512 descriptors per PID, 32768 total readlinks, and 2 MiB per table/tool output. Permission errors, missing tools, races, and metadata deadlines do not fail the port list. Cancellation prevents late metadata from entering the response; native readlink calls can finish after the batch returns. Current access is checked after both metadata lookups. See [ADR 0124](../decisions/0124-localhost-port-service-labels.md) and the [follow-up work record](../work/localhost-port-page-titles.md#follow-up-name-first-port-tags-and-process-fallbacks).

Opening the list starts neither a browser socket nor Chromium. Selecting an allowed port opens its proxy in a new tab. The native Chrome toolbar's **Open ports** control returns to this list; native-browser closure follows its separate persistent-profile lifecycle. See [ADR 0108](../decisions/0108-localhost-browser-port-picker.md) and its [verification record](../work/localhost-browser-port-picker.md).

## Legacy proxy entry and execution

`https://mew.example/3333`, `http://<tailscale-IP>:5000/3333`, and `https://mew.run/<user>/<device>/3333` open the host's running `localhost:3333` app. Include the Mew port when required. Mew neither builds the app nor starts its development server.

Direct access uses `server/port-preview.ts` HTTP/WS proxies. Logged-out users visit `/?preview=3333&previewPath=...` and return after login. Owners/managers have `portPreview` by default; owners grant it to others. Legacy `browser` overrides are read as `portPreview` for migration. Guests and temporary-password accounts are rejected.

App HTML, JavaScript, styles, and API responses execute on the viewing device. The direct proxy rewrites URLs/scripts, CookieJar, and storage inside a sandbox without `allow-same-origin`; it uses neither host Chrome nor DOM replay. The Android gateway shares this loopback boundary through `GET /api/android-url`.

## Command button port detection

Each command button's `ports: number[]` in `GET/PUT /api/cmd-buttons` comes from TCP LISTEN sockets owned by its session pane PID and descendants, never command text, terminal URLs, or guessed defaults. Multiple panes are combined, deduplicated, and sorted. No session or `portPreview` means an empty array; querying still requires `terminal`. Execution state and ports are not persisted in configuration.

Linux uses `/proc` process/TCP tables and target FDs; macOS uses `ps`/`lsof`; Windows uses PowerShell process/TCP tables. One request batches table queries. Port checks have a 5-second deadline and return an empty array on failure/timeout; pane PID lookup has a separate 5-second limit. Missing tools or denied queries do not block commands or terminal viewing.

Targets are `127.0.0.1`, `::1`, and wildcard listeners. LAN-only bindings and daemon/container processes outside pane descendants are not auto-connected. Detection does not establish HTTP support, and non-HTTP services cannot open in preview. Mew's listening port remains blocked.

Port numbers in the command menu now use `@mew/ui/local-browser` to request the internal DOM browser. `src/utils/port-preview-url.ts` remains available for legacy proxy URLs; it uses `/<port>` on the direct origin or appends it to the Mewlink device base. The [shell terminal feature contract](../features/terminals-agents-automation/tmux-shell-terminals.md) owns button placement, updates, and interactions; the [command button guide](../../../docs/guides/commands.md) owns the usage sequence.

## Permission and port boundaries

`POST /api/port-preview/session` accepts `{port, path?}` and returns a port-limited signed token/URL bound to the account and original Mew auth session. Every request/open socket checks login, current permissions, and expiry; logout/revocation stops forwarding. Tokens expire after 30 minutes without renewal: reopen the entry to continue. Tokens cannot access other ports or Mew APIs, and Mew's listening port stays blocked.

Targets are HTTP(S) loopback services. Mew cookies, auth headers, and visitor IPs never go upstream; each proxy isolates app cookies in its CookieJar. Redirects to external addresses/other ports also require session-boundary checks. Preview permission grants the service's functionality; it is not a file ACL sandbox.

## Mewlink

After device connection and Mew login, Mewlink creates a port-limited HTTP/WS bridge. `capability: 'port-preview'` in `shared/remote-access.ts` permits only preview raw/cookie/WS paths. Apps receive neither full Mew API transport nor auth tokens. Bodies/resources transfer directly; central supplies only the launcher and Service Worker.

The public device parent builds `previewBaseUrl` from central origin, username, and device name. The launcher verifies the origin and passes `https://mew.run/<user>/<device>` through `mew-app-context` on the existing MessagePort, without tokens, queries, or app-frame paths. Port-subpath entry and reconnect retain the same base. Older central versions omitting this field cause a visible error, rather than navigation to the app origin. See [ADR 0076](../decisions/0076-command-port-previews.md).

Raw HTML and the app cookie API require the verified P2P dispatcher to grant the request's `port-preview` capability. Direct HTTP returns 403 even with valid local login/token; ordinary remote requests are also rejected. HTTP headers cannot grant capabilities. Direct URLs retain the opaque sandbox proxy; remote raw HTML uses a separate preview origin.

`PREVIEW_DOMAIN=preview.mew.run`, Worker routes, DNS, and HTTPS for `*.preview.mew.run` are required. Random preview subhosts isolate origin, storage, and Service Workers from Mew/other apps while `/user/device/3333` stays in the address bar. Missing configuration displays a readiness error instead of running on Mew's origin.

Preview readiness requires random-subdomain DNS, TLS, and Worker responses; configuration and a public-device HTTP 200 are insufficient. After `mew-preview-ready` from the same iframe/origin, await `mew-preview-initialized` confirming Service Worker readiness. Failure or the 15-second limit displays a diagnostic error and cleans sessions, sockets, pending requests, ports, and listeners. Apply host code and central's shared `port-preview-launch.js`; see [Readiness checks](../operations/remote-central.md#localhost-app-preview-origin) and [ADR 0078](../decisions/0078-port-preview-module-initialization.md).

`tools/port-preview-readiness.mjs` reads `PREVIEW_DOMAIN`/`APP_ORIGIN` from central config and checks DNS, verified HTTPS, and launcher responses on two different random hosts. It also checks the shared launcher, Service Worker, runtime, and initialization-complete notification without changing DNS, certificates, or Workers. Unready active previews fail `npm run check:port-preview` and post-deployment checks. The [deployment procedure](../operations/remote-central.md#localhost-app-preview-origin) owns DNS/execution details. Device auth, P2P forwarding, and actual app rendering require separate validation.

A preview-specific bridge connects before app execution because Service Workers cannot intercept native WebSocket. The viewer receives the upstream-selected subprotocol; requests/sockets retain only that preview port's permission. Close cleans MessagePorts, sockets, and sessions. Root `public/port-preview-*.js` is canonical for shared launcher/worker/runtime assets included in central. The user applies central changes and wildcard HTTPS.

## Compatibility and validation

Root assets, APIs, POST, and WebSocket/HMR are forwarded. POST bytes, including JSON, are unchanged. Only HTML/CSS/JS/XML are rewritten, up to 8 MiB; SSE/binary data retain backpressure. Client disconnect cancels upstream requests.

`es-module-lexer` rewrites only actual specifiers: inline HTML scripts/modules and external-JS imports, re-exports, and dynamic imports with strings/fixed templates. Vite inline React Refresh and multiline imports retain port capabilities. Comments, ordinary strings, JSON data scripts, source maps, unparseable scripts, and existing Next static chunks are unchanged. Runtime-assembled dynamic imports are not all rewritten.

The direct proxy uses `acorn`/`eslint-scope` to map global `location`, `window`, `self`, and `globalThis` to the virtual app address, including `document.location`, `document.defaultView`, and `window.document.location`. It retains the actual Document for DOM arguments/identity checks. Local bindings, property names, strings, comments, shorthand properties, automatic semicolon insertion, and constructor semantics are preserved. Parse failures pass through unchanged.

SPAs read `/`, subpaths, query, and fragment without extra basename configuration. History push/replace, Back/Forward, hash changes, and iframe reload retain app paths. A nonce script passes the outer fragment to the iframe because HTTP omits fragments. The virtual address derives from the native iframe URL without changing Location properties, sandboxing, or permissions. Read-only `window.__MEW_PORT_PREVIEW_BASE_PATH__` and history-prefix removal preserve older URLs. See [ADR 0083](../decisions/0083-direct-preview-spa-routing.md).

Transformation does not provide a full independent-origin browser. `eval`, `Function`, runtime-injected code, and indirectly obtained native Location are untouched, as are address references where `globalThis`, `window`, and `self` are all local bindings. Next `/_next/` chunks stay unchanged. Apps needing fixed basePath or native identity use Mewlink's separate origin, preserving paths; its SPA paths stay aligned with browser URL/history.

Hardcoded JS references to other `localhost` ports target the viewing device; use same-port API proxies or explicit configuration. Not every app works unchanged, including PWA Service Workers, special CSP/COOP/COEP, external OAuth callbacks, or native cookie behavior.

Isolated HTTP/WS and browser tests cover login rejection, port restrictions, assets/APIs, cookies, HMR, revocation, and origin separation. An isolated HTTPS-custom-domain → HTTP-host reverse proxy uses real local login cookies to check tabs, subpaths, modules, POST, WSS HMR, app isolation, and exclusion of Mew cookies/proxy headers upstream. Actual Cloudflare Tunnel, central deployment, custom domains, Tailscale, and external networks remain separate deployment checks.
