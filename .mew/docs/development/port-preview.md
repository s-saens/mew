---
title: "Authenticated localhost app previews"
description: "Defines command-session port detection and /port-number links, module forwarding and virtual SPA paths in the direct proxy, remote initialization failures and the 15-second limit, and read-only DNS, HTTPS, and shared asset readiness checks for random hosts. Also explains login and port capabilities for localhost HTTP and WebSocket, compatibility limits of origin isolation and syntax transformation, and the scope of validation."
created: "2026-10-20"
updated: "2026-10-28"
---

## Entry and execution

`https://mew.example/3333`, `http://<tailscale-IP>:5000/3333`, and `https://mew.run/<user>/<device>/3333` are entry points for opening the host's `localhost:3333` app. Include the Mew port in the address when required. The app must be running on the host; Mew does not build it or start a development server.

Direct access uses the HTTP and WebSocket proxy in `server/port-preview.ts`. Users who are not logged in go to `/?preview=3333&previewPath=...` and return to the original address after logging in. The `portPreview` capability is allowed by default for owners and managers; the owner grants it to other accounts. Existing `browser` overrides are read as `portPreview` for migration. Guests and accounts with temporary passwords cannot use it.

The app's HTML, JavaScript, styles, and API responses run on the connecting device. The direct proxy rewrites URLs, scripts, CookieJar, and storage, and enforces a sandbox without `allow-same-origin`. It does not use the host's Chrome or a DOM replay view. The Android gateway uses the same loopback proxy boundary as `GET /api/android-url`.

## Command button port detection

Each button's `ports: number[]` in `GET/PUT /api/cmd-buttons` is calculated from actual TCP LISTEN sockets opened by the execution session's pane PID and descendant processes. It does not guess from command strings, URLs in terminal logs, or default ports. Ports from multiple panes are combined, deduplicated, and returned in ascending order. The result is an empty array if there is no session or no `portPreview` permission; query access retains the existing `terminal` permission. Execution state and ports are not saved in configuration files.

Linux reads the process and TCP tables in `/proc` and the target processes' FDs; macOS uses `ps` and `lsof`; Windows uses PowerShell process and TCP tables. Process and socket tables are queried in a batch within one request. Port checks must finish within 5 seconds; failures and timeouts return an empty array. Pane PID lookup has a separate 5-second limit. Command execution and terminal viewing remain available even if tools are missing or the OS denies the query.

Targets are `127.0.0.1`, `::1`, and wildcard listening sockets. LAN-only bindings and separate daemon or container processes outside the pane's descendants are not connected automatically. Detection does not determine whether a TCP port serves an HTTP app, so non-HTTP services cannot be opened in a preview. Mew's own listening port remains blocked at the existing preview boundary.

Port numbers in the command menu use `src/utils/port-preview-url.ts` to create new-tab URLs. Direct access uses `/<port>` on the current origin; Mewlink appends `/<port>` to the public device base below. The [shell terminal feature contract](../features/terminals-agents-automation/tmux-shell-terminals.md) owns button placement, updates, and interactions; the [command button guide](../../../docs/guides/commands.md) owns the usage sequence.

## Permission and port boundaries

`POST /api/port-preview/session` accepts `{port, path?}` and issues a token and URL limited to that port. The signed token is bound to the account and the original Mew authentication session. Login, current permissions, and expiration are checked on every request and open socket; forwarding stops on logout or permission revocation. Tokens expire after 30 minutes and do not renew automatically, so reopen the entry address to continue using the preview. A token alone cannot open other ports or Mew APIs. Mew's own listening port is blocked.

Targets are HTTP(S) loopback services. Mew cookies, authentication headers, and visitor IPs are not forwarded upstream, and app cookies are isolated in a CookieJar for each proxy. Redirects to external addresses or other ports also undergo session boundary checks. Allowing port previews grants access to the local service's functionality, so this is not a file ACL sandbox.

## Mewlink

Mewlink creates a port-limited HTTP and WS bridge after the existing device connection and Mew login. `capability: 'port-preview'` in `shared/remote-access.ts` allows only preview raw/cookie/WS paths. The app receives neither transport access to the full Mew API nor authentication tokens. Remote app bodies and resources use the existing direct transfer; the central service provides only the execution launcher and Service Worker.

The public device parent page builds `previewBaseUrl` from the central origin and current username and device name. The launcher verifies the origin and passes it to the app through `mew-app-context` on the existing MessagePort. The value has the form `https://mew.run/<user>/<device>` and contains no token, query, or app frame path. The same device base is retained when entering through an existing port subpath or reconnecting. With older central versions that do not send this field, clicking a port number displays an error instead of navigating incorrectly to the app origin. Follows [ADR 0076](../decisions/0076-command-port-previews.md).

Raw HTML and the app cookie API are allowed only on connections to which the verified P2P dispatcher has granted the request's `port-preview` capability. Direct HTTP is rejected with 403 even with a valid local login and preview token, and ordinary Mew remote requests are rejected by the transport protocol. HTTP headers cannot specify a capability. Direct addresses therefore continue to use the opaque sandbox proxy, and remote raw HTML runs only on a separate preview origin.

The `PREVIEW_DOMAIN=preview.mew.run` setting and Worker routes, DNS, and HTTPS for `*.preview.mew.run` are required. Each preview gets a random subhost to isolate its origin, storage, and Service Worker from Mew and other apps. The `/user/device/3333` entry address remains in the address bar. Without this configuration, a clear readiness error is displayed, and the app does not run on Mew's existing origin.

Do not determine preview readiness solely from configuration values or an HTTP 200 response from the public device page. DNS, TLS, and Worker responses for the random subdomain are all required. For remote previews, wait for `mew-preview-initialized` indicating Service Worker readiness after `mew-preview-ready` is sent from the same iframe and origin. If initialization failure is reported or the 15-second limit is reached, display an error that helps identify the cause and clean up issued sessions, sockets, pending requests, message ports, and listeners. Apply both the host code and the shared `port-preview-launch.js` included in central. Follow [Readiness checks](../operations/remote-central.md#localhost-app-preview-origin) and [ADR 0078](../decisions/0078-port-preview-module-initialization.md).

`tools/port-preview-readiness.mjs` reads `PREVIEW_DOMAIN` and `APP_ORIGIN` from the central configuration and checks DNS, verified HTTPS, and launcher responses on two different random hosts. It also checks responses from the shared launcher, Service Worker, and runtime, along with the initialization completion notification, without changing DNS, certificates, or Workers. If active previews are not ready, `npm run check:port-preview` and the post-deployment central check fail. The [deployment procedure](../operations/remote-central.md#localhost-app-preview-origin) owns specific DNS records and execution instructions. Actual device authentication, P2P forwarding, and app rendering are validated separately.

Because Service Workers cannot intercept the browser's native WebSocket, a preview-specific bridge is connected before the app runs. The subprotocol actually selected upstream is passed through to the viewer. App requests and sockets receive only the corresponding preview port permission. Closing the preview cleans up MessagePorts, sockets, and sessions. The canonical source for the shared launcher, Service Worker, and runtime is `public/port-preview-*.js` at the root, and the central build includes the same assets. The user applies central changes and prepares wildcard HTTPS.

## Compatibility and validation

Forwards root assets, APIs, POST, and WebSocket/HMR. POST bodies retain their original bytes, including JSON. Only HTML, CSS, JS, and XML are rewritten, within an 8 MiB limit; SSE and binary data are forwarded with backpressure. Client disconnection cancels the upstream request.

For inline JavaScript and modules in HTML, and imports, re-exports, and dynamic imports using strings or fixed templates in external JavaScript, only actual specifier positions identified by `es-module-lexer` are changed to proxy URLs. Vite's inline React Refresh initialization and multiline imports retain the same port capability. Comments, ordinary strings, JSON data scripts, and source maps are preserved. Not all dynamic imports assembled from runtime expressions are rewritten. Scripts that fail to parse are passed through unchanged, and existing Next static chunks continue to be preserved unchanged.

The direct proxy uses `acorn` and `eslint-scope` to analyze executable script syntax and scope, mapping global `location`, `window`, `self`, and `globalThis` references to the app's virtual address. It also handles `document.location`, `document.defaultView`, and `window.document.location`. The actual Document is retained for DOM arguments and identity checks. Local bindings, property names, strings, and comments are preserved, as are the semantics of shorthand properties, automatic semicolon insertion, and constructor calls. If parsing fails, the script is passed through unchanged.

Ordinary SPAs read the initial `/`, subpaths, query, and fragment without additional basename configuration. History push/replace, back/forward navigation, hash changes, and iframe reloads also retain the app path. Because the entry address fragment is not sent to the server, a nonce script in the outer document passes it to the iframe. The virtual address is calculated from the native iframe URL and does not change native Location properties, the sandbox, or port permissions. The read-only `window.__MEW_PORT_PREVIEW_BASE_PATH__` and existing history prefix removal are retained for compatibility with older URLs. Follows [ADR 0083](../decisions/0083-direct-preview-spa-routing.md).

This transformation does not guarantee a complete browser environment equivalent to an independent origin. It does not transform `eval`, `Function`, runtime-injected code, or native Location obtained indirectly through the DOM, and preserves address references in scopes where `globalThis`, `window`, and `self` are all local bindings. Next's `/_next/` chunks remain unchanged as before. Apps that require a fixed basePath or native browser identity use Mewlink's separate origin, which preserves original paths. Mewlink SPA paths are maintained together with the actual browser URL and history.

Other `localhost` ports hardcoded in JS point to the connecting device, so use the app's same-port API proxy or explicit address configuration. Unmodified operation is not guaranteed for every web app, including PWA Service Workers, special CSP/COOP/COEP configurations, external OAuth callbacks, and native browser cookie behavior.

Port preview tests use isolated HTTP/WS servers and browsers to check login rejection, port restrictions, assets/APIs, cookies, HMR, permission revocation, and origin separation. An isolated reverse proxy forwarding from an HTTPS custom domain to an HTTP host uses actual local login cookies to verify new tabs, subpaths, modules, POST, WSS HMR, app isolation, and that Mew cookies and proxy headers are not forwarded. Actual Cloudflare Tunnel, Mewlink central deployment, custom domain, Tailscale, and external-network checks are separate deployment checks.
