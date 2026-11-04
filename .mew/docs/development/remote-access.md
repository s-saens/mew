---
title: "Mewlink device registration and locally authenticated P2P access contract"
description: "Defines Mewlink registration, launcher behavior, authentication, browser trust, UI resources, notification permission bridging, microphone delegation, signaling proofs, and transport limits. Links recovery and distinguishes host updates, central rollout, and isolated verification."
created: 2026-10-07
updated: "2026-11-04"
---

[Work and release criteria](<../work/remote-access.md>) · [Central service installation](../operations/remote-central.md) · [ADR 0195](../history/decisions/0195-mew-account-based-p2p-remote-access.md) · [Follow-up ADR 0203](../history/decisions/0203-mewlink-workers-p2p-ui.md) · [Local authentication ADR 0207](../history/decisions/0207-mewlink-device-access-local-auth.md) · [Permissions](access-control.md)

Central accounts manage device registration, lists, deletion, and optional external identity proofs. Public device URLs start WebRTC without central login; the installed UI accepts **local email/password or a Mewlink account with completed owner approval and self-linking**. Central identity, email, public address, and device registration do not grant local work permissions ([ADR 0208](../history/decisions/0208-mewlink-approved-login-identities.md)). Implementation/isolated checks do not establish production application: users must update local mew and redeploy central. Provider-specific production login, external Android/LTE, sleep, and network-switch measurements remain outstanding.

On 2026-10-10, the user confirmed public-address UI/agent chat, then reported desktop/mobile disconnections. Native-RTC isolated loads found and fixed small-message IPC count limits and misclassified native send-wait returns. Checks also reproduced/fixed socket closure, callback exceptions, ordering, and central-tab-close races. They establish neither one cause for the reported symptoms nor deployment/mobile network-switch validation. Browser-view resource 503 is a separate issue.

## Domain migration and device dashboard

Device URL: `https://mew.run/{username}/{device}`; owner dashboard: `https://mew.run/{username}`. Only the centrally logged-in owner receives that device list. Another account gets 404; logged-out users see login without a list request. `/` and former `/dashboard` redirect to the owner's address after login. Public device connections need no central login.

Command ports and localhost links use the [internal DOM Browser](port-preview.md#internal-dom-browser) through authenticated `/api/dom-browser/ws`. Host and central shared socket allowlists must include it; old launchers reject it. This panel needs neither preview domain nor Service Worker. Legacy `/<port>` URLs retain the [port-preview](port-preview.md#mewlink) public base and preview-origin rules. Central and host updates apply separately.

Execution uses `https://app.mew.run`, a separate origin on the management site to reduce mobile cross-site storage restrictions while isolating central cookies/APIs. Former `mew.saens.kr` screens redirect without changing registration, persistent WSS, signing keys, or device IDs. Central permits only configured previous origins and checks host-proof audience/ticket issuer against the connected host's origin. Browsers accept only configured current/previous issuers and retain signing-key/instance-audience checks. Existing Durable Objects need no new launch RPC. Approved local identities keep the host issuer, and direct-email identities keep their previous namespace to prevent duplicate same-email accounts.

Legacy provider callbacks use `OAUTH_ORIGIN`. A single-use proof, valid 60 seconds and bound to the new origin's browser verification cookie, issues the new management session only after origin/cookie/expiry checks. The app origin exposes no such route. See the [migration decision](../decisions/0005-mewlink-domain-and-private-dashboard.md).

## Launcher touch zoom

`mew.run` connection and `app.mew.run` launcher documents apply the [workspace touch policy](../features/appearance-accounts-operations/panel-layout-mobile-and-state-restoration.md#touch-zoom) before installed UI load. Both must apply it because iframe touch events do not propagate. Dashboard browser zoom is unchanged.

`mewlink/src/workspace-touch-zoom.ts` reuses `startWorkspacePinchZoom`: append `maximum-scale=1` without losing viewport directives, set root `data-workspace-touch-zoom`, and scope `touch-action: pan-x pan-y` CSS. Disposal restores viewport/root state and removes listeners.

Cancel native multi-touch/gesture defaults only; preserve propagation for editor-local font resizing. One-finger input, Ctrl/Cmd+wheel, keyboard zoom, and third-party policies remain. Launcher whole-page enlargement is restricted, with accessibility/device limits in [ADR 0112](../decisions/0112-workspace-touch-zoom.md).

This central **source contract** does not establish a live `mew.run` change. Host builds cannot publish launcher assets; central application is user-owned and separate. The [work record](../work/mewlink-touch-zoom.md) records local checks and remaining rollout limits.

## Microphone permission

Hotview voice recording uses the connecting browser's microphone. The direct host's `server/security-headers.ts` permits `microphone=(self)` while retaining camera, geolocation, and payment denial. Browser permission and a secure context (HTTPS or a browser-trusted loopback origin) remain required.

The Mewlink connection page delegates `microphone 'src'` to its configured app-origin iframe. Both the prepared frame (`mewlink/src/connection-frame.ts`) and fallback frame (`connection-parent.ts`) set this policy. The app launcher (`app-launcher.ts`) delegates the same permission to the installed UI frame. This permits the configured frame origins without granting unrelated origins or camera access. See [ADR 0131](../decisions/0131-hotview-voice-recording.md).

Host builds update browser assets only. Applying the changed direct HTTP header requires a user-managed host restart; applying Mewlink delegation requires a separate user-managed central frontend rollout. Older central launchers continue to block recording in their cross-origin app frame. Local checks establish source behavior, not live Mewlink or physical-microphone operation.

## Public file and folder links

Public links append `/share/f/{id}` or `/share/d/{id}` to `https://mew.run/{username}/{device}`. Central preserves the typed path through parent, launcher, and `mew:context`. After transport initialization, the app opens its standalone public editor without workspace/login UI; direct localhost/custom-domain paths choose the same editor.

Vite retains `base: './'` for per-connection resources. Direct SPA fallback `server/direct-ui.ts` rewrites relative startup script/link HTML attributes to host-root paths, letting `/share/f/{id}` and `/share/d/{id}` load `/assets/`. Document links, inline scripts, and saved HTML are unchanged. `/api/remote-ui/file?path=/index.html` reads that artifact for isolated Mewlink entry.

Before login, the dispatcher permits only exact `/api/public-shares/{f|d}/{id}` capability endpoints. The [public capability service](access-control.md#public-capability-links) authorizes metadata/tree/file/raw reads and existing-file content updates; management, other work APIs, and work WebSockets require local login. Invalid IDs cannot retain public connections. Capability lifetime revalidation removes anonymous access when publication is disabled or creator permission is lost. Authenticated-session revocation is unchanged.

`publicShareUrl` uses the validated public device base forwarded through `previewBaseUrl`; an invalid remote base fails instead of copying the internal app origin. Public raw responses forward CSP, Referrer-Policy, X-Content-Type-Options, and X-Frame-Options across the data channel.

Central source lives in excluded `mewlink/` and applies separately from host commits. Host/isolated launcher tests do not prove deployment. Users must apply both changes and verify a copied link from another browser; hosts must stay awake, online, and directly reachable.

## Connection information display

Connection settings show the public URL, connected central `@username`, device name, direct readiness, and own-account/device management links. Registration identity remains distinct from local mew login. Online means central signaling, not proven external direct reachability. The same screen handles registration, pending state, lookup failure, setup, and deregistration confirmation.

The host never derives public URLs from immutable account IDs. An unauthenticated `HEAD` to the public device path checks username redirects. Display/copy accepts only the same public origin/device with no query, fragment, or credentials. Old `mew.saens.kr` registrations resolve at `mew.run` without key/mapping changes. A confirmed username selects its management path; failed lookup shows error/refresh and uses the public root instead of exposing an internal ID.

Lookup results are cached for 60 seconds in-process; reconnect/explicit refresh recheck. Requests coalesce with a 5-second timeout and discard results after replacement/deregistration. Status adds only display username, device name, and URL, never central cookies/email/internal IDs/keys. No central change/redeployment is needed.

Isolated checks cover addresses/origins (`server/remote-access-address.test.ts`), status/cache/retry/key preservation (`server/remote-access-registration-network.test.ts`), and copying/accounts/errors/deregistration/desktop/mobile (`server/remote-access-ui.test.ts`). Mock central responses do not establish live-account or external-network results.

## Architecture and identity

`mewlink/src/worker.ts` is the Cloudflare entry in an independent Git/package.json repository excluded from parent Git/npm workspace. Compatible parent protocols/tooling are still required; see [tracking/recovery boundaries](../operations/remote-central.md#location-and-deployment-configuration). Workers + Static Assets deploy login/device/connection frontend; D1 owns management accounts, registrations, sessions, and single-use requests; per-device Durable Objects own persistent WSS, signaling, and revocation. Central loads no local API/workspace/terminal/agent modules or parent `dist/`, and `/api` has no work routers. OAuth integrates Google, GitHub, Apple, and optional email OIDC directly, without Supabase.

The address bar remains `mew.run/{user}/{device}`. The launcher bootstraps the device through WSS without central login. `authMode: local` and random subject are connection context, not local account/role. Nonces, tickets, browser keys, and resume tokens stay in the central parent; `app.mew.run/launch/{임시 ID}` gets frame-specific public config and credential-stripped transport only. Management cookies use `__Host-`, Secure, HttpOnly and never reach app origin; app-host auth/account APIs are blocked. The installed UI is fetched from A into an internal iframe. Both hosts use one Worker.

`server/remote-ui.ts` permits dispatcher-key/proof-verified GET/HEAD of installed A `dist/` only, never direct HTTP, arbitrary files, ports, or dev servers. Realpaths reject external symlinks/dotfiles/traversal; files cap at 32 MiB, index at 512 KiB. Built-index `mew-p2p-bootstrap=1` rejects old UIs; injected `mew-p2p-app` selects remote bootstrap. `src/main.tsx` overlaps lightweight auth-entry download and parent MessagePort checks, rendering only after transport and account/instance storage scope exist. Workspace App waits for login/password change and reuses initial auth. See [browser startup](architecture.md#initial-browser-startup). Ordinary A project paths never select remote mode.

The Service Worker maps `/__mew_ui/{임시 ID}/...` to `/api/remote-ui/file?path=...`, redirecting absolute static paths into that prefix. `import.meta.url`, dynamic imports, and workers stay connection-scoped. After worker restart, only the exact `/launch/{임시 ID}` window qualifies; another tab cannot substitute. APIs use MessagePort → verified central-parent DataChannel; native URL requests use worker → the same parent transport. App code never receives central sessions or launch proofs.

Browser notification permission and delivery belong to the top-level public device page, not the cross-origin installed UI. `src/utils/browser-notifications.ts` uses the frame-bound port installed by `remote-app.ts`; the excluded central `app-launcher.ts` relays bounded state/request/show/close/result/click messages to `notification-host.ts` in the connection parent. The central build emits the shared public notification worker and serves it on the central origin before authentication fallback. Its narrow scope preserves the existing root resource worker. Account changes and connection disposal close notices and discard stale actions. See [ADR 0126](../decisions/0126-mobile-browser-notifications.md) and the [notification contract](../features/appearance-accounts-operations/mewpet-mascot-notifications-and-breaks.md#notification-settings-and-pc-desktop-notifications). Host builds and central frontend deployment are separate application steps; this work does not deploy the central service.

A's `server/remote-access-agent.ts` verifies local-owner registration within 5 minutes, A's Ed25519 possession proof, and the signed central receipt, then saves immutable instance/account IDs, device name, and key. Production `server/serve.ts` (`npm start`, `npm run serve`, `./mew start`) opens central WSS only for saved registration. `npm run dev`'s Vite plugin creates neither an agent nor `/api/remote-access`, so it cannot register, reconnect, or take over production even with saved configuration. Production backoff caps at 30 seconds plus jitter; restart reuses the key.

Central identity is **provider ID + verified issuer + immutable subject**; GitHub uses a numeric ID and fixed issuer. Matching email/display name or cross-provider subjects never merge. Provider changes or email-OIDC issuer replacement create another account. Cross-provider linking UI is not yet available.

A retains email/password, roles, server sessions, and separately linked approved identities. The initial `accounts` mapping remains for config compatibility, not new-access authorization. Former local/central member APIs still return 410; central membership grants no work permission. New approvals use the local API/owner UI below.

Ticket and browser-key possession verification open transport. Before login, only `GET/HEAD /api/remote-ui`, `/api/remote-ui/file`, `GET /api/auth/me`, `/api/auth/mewlink`, `POST /api/auth/login|logout|change-password`, and `/api/auth/mewlink/request|login` are available. Unauthenticated P2P blocks even guest-readable files and all work WS. Temporary-password users must change passwords before work. Independent approved external login does not clear the password store's change requirement.

Local auth reuses `createAuthRouter`, scrypt, and failure limits. Only signed central `clientIp` drives IP limits; app cookies/roles/auth headers are untrusted. Server connection context applies sessions to requests/WS and checks password changes, deletion, expiry, and revocation per request and timer. Logout/account switch first cleans old requests/sockets.

The central-origin launcher stores/removes `x-mew-session` from login/password/trust/logout responses per device and strips it from app headers. WebRTC, keys, and resume tokens stay central-side; app launcher gets credential-stripped MessagePort only. Later visits resume through the first transport-auth message. `/api/auth/me` local email + instance ID partition app storage; account switching restarts the frame. See [browser storage](browser-storage.md).

A atomically stores version 1, server key, pinned central key, and account mappings in `<DATA_DIR>/remote-access.json`. Private-key permissions allow only the OS user; damaged config is never replaced with new keys. Central key/DB backup locations follow the [installation contract](../operations/remote-central.md).

## Opening device connection settings

Owners use header **Mewlink** for registration, status, URL copy, and deregistration. `RemoteAccessModal` uses shared `DialogFrame` Esc/back/outside-dismiss and focus restoration. Account management contains identity approval/revocation only. Remote-access sessions hide registration/deregistration controls.

## Keeping browser login and revoking access

After local-password or approved-Mewlink login, **Stay signed in on this browser → Remember** in the central parent trusts this browser/profile, not every browser on the device. Temporary passwords must be changed first. The app bridge rejects `/api/auth/remote-device`, preventing app-side consent bypass ([ADR 0015](../decisions/0015-trusted-browser-access.md)).

`POST /api/auth/remote-device` accepts `{ label }` on authenticated P2P and binds trust to the host-verified local account, `authenticationMethod`, password credentials or approved `credentialId`, and browser-key fingerprint. Expiry is **90 days of inactivity**, renewed immediately on resume and at most daily during active-session checks. Resume proves the same key; the pre-trust bearer session is discarded. Every request rechecks password changes, link revocation, deletion, and permissions. Tokens cannot resume with another key or silently convert password login to external login.

Central IndexedDB stores non-extractable Ed25519 keys **per host instance**: same-host tabs share a key, different hosts do not, reducing correlation. Unavailable storage uses a non-extractable memory key that cannot survive visits. New sessions enter sessionStorage and remove old persistent entries; only trusted tokens use per-device localStorage after `/api/auth/me` confirms trust or parent consent succeeds. Existing 30-day local tokens resume compatibly. Keys/tokens never reach the app iframe; passwords are never stored. Consented external login can issue trust bound to its approved link and resume without a central cookie while that link/key remain valid. See [storage/removal rules](browser-storage.md#storage-scope-for-remote-local-account-connections).

The host sends `{ type: 'trusted-browser', connection, label }` over central WSS only after local auth and trust consent. Central uses the key fingerprint as `browserId`, storing label, registration time, and latest confirmation in D1 `0005_browser_access.sql`. Revoked rows are retained and never reactivated; revocation racing verification/registration cannot reopen a terminated connection.

| Path/action | Contract |
| --- | --- |
| `GET /central/instances/:id/browsers` | Only the central device owner can retrieve `{ id, label, createdAt, lastSeen, revoked, connected }[]`. Times are epoch ms, and `connected` indicates a valid connection state in the DO |
| `DELETE /central/instances/:id/browsers/:browserId` | Only the owner can revoke access. Persist the revocation record first, send `access-revoked` to all tabs with the same device and key, then close the connections and forward `end` to the host |
| Dashboard: **Manage Connected Browsers → Revoke Access** | Revoke a specific browser through the API above. Connections from other browsers and to other hosts remain active |
| Device: **Unregister** | Discard the entire host registration and terminate all connections. This is a separate action from revoking a specific browser |

Logout/revocation removes saved resume tokens and stops auto-connect; `access-revoked` and explicit auth rejection also stop retries. The key remains as revocation identity; other hosts' keys/tokens remain untouched. Deleting IndexedDB and authenticating a new key can register a new browser, so browser revocation does not revoke the login method. Lost devices/compromised credentials also require password change or external-link revocation.

## Static Asset Compression and Revalidation Caching

### Separating Caches for the Central Public Launcher and Installed Host Code

Under [ADR 0050](../decisions/0050-mewlink-startup-preparation.md), successful central GET/HEAD `/launcher/<이름>-<8자리 빌드 해시>.js/css` permits 1-day browser-only caching: status 200, extension-matching JS/CSS MIME, and strong ETag are required. `Set-Cookie`, personalized `Vary`, Range, Authorization, queries, or upstream `no-store` prohibit it. Header: `private, max-age=86400, immutable, no-transform`. CSP/origin isolation remain; new hashed HTML references fetch new code.

HTML, connection-token paths, public config/keys, Service Workers, APIs, unhashed compatibility files, and errors stay `no-store`. This HTTP cache covers non-personalized central code only. Host code still needs per-device SHA-256/current-P2P validation below; auth results, documents, and sessions are never cached. Disconnection/permission failure cannot launch saved code.

Only public production connect GET status-200 HTML on configured `https://mew.run`→`https://app.mew.run` adds `Link: <https://app.mew.run>; rel=preconnect`. Other origins/roles, HEAD, and errors cannot add it. Never inherit ASSETS Link or include device/instance/admission/query/cookie data. Omit `crossorigin` to match iframe credentials; retain final CSP, `no-referrer`, auth, and limits. Enabled [Cloudflare Early Hints](https://developers.cloudflare.com/cache/advanced-configuration/early-hints/) may start TLS before HTML when cache-ready, without guaranteeing 103 issuance, reuse, or faster production timing. Preload is forbidden because it requests resources before final Referrer-Policy.

Connect HTML runs static bootstrap before CSS/external scripts and `modulepreload`s controller/JOSE together. The Worker adds the body's SHA-256 hash to CSP only when trusted ASSETS HTML has exactly one direct-head `script[data-mewlink-prime="v1"]` with matching marker/static body. No `unsafe-inline`; an internal Response WeakMap carries the hash. Dynamic device/admission metadata precedes code, outside its body, and responses specify UTF-8. Invalid markers or older HTML/Worker use the external entry.

Preliminary code prepares same-origin signaling and a per-device non-extractable Ed25519 key. Versioned, single-use slots hand matching preparation to the controller once; [signed-offer rules](#signed-offer-in-the-first-websocket-upgrade) bound endpoints, sockets, FIFO, and lifetimes. Departure, config mismatch, or exceeded limits cleans up; unknown-slot callbacks never execute. Final ticket, device-answer, and key-possession checks remain.

Inline/external ESM share a same-instance key promise once, checking native promise, version, instance, and actual non-extractable Ed25519 key. Unused slots expire at 10 seconds/pagehide; forged slots or preparation failure use normal key generation. Atomic IDB add/re-query still selects simultaneous-tab winners; no candidate key connects before storage. Public JWK and offer preparation overlap. Normal connect follows a fresh challenge; admitted flight sends in Upgrade. Cancellation prevents late completion from reopening.

### Host UI Compression and Revalidation

Vite `base: './'` keeps HTML, modulepreload, CSS, and worker URLs relative at root or temporary P2P prefixes. Matching preload/import URLs avoid duplicate module fetch after `/assets/...` redirect. Worker redirects preserve old absolute builds. See [relative base](https://vite.dev/config/shared-options.html#base) and [modulepreload](https://vite.dev/config/build-options.html#build-modulepreload).

With `DecompressionStream`, the worker requests `encoding=gzip` for non-Range UI GET only. A streams allowed HTML/JS/CSS/JSON/SVG/text after path, realpath, size, and bootstrap checks. Only UI responses forward `Content-Encoding`; the worker decompresses and strips encoding/length headers. The same stream retains P2P windows, cancellation, and backpressure. HEAD, Range, images, and woff2 remain raw.

Older hosts ignore optional compression queries; older workers/unsupported browsers never request them. Task APIs and document bodies are neither compressed assets nor CacheStorage entries.

The resource worker allows 30 seconds for headers. For static UI bodies, each consumer `pull` starts a 30-second no-chunk/no-completion deadline; a stall cancels upstream through the same MessagePort and errors the read. A chunk clears the timer until the next `pull`, so progressing downloads have no 30-second total cap. Backpressure pauses and long-lived general-API SSE are excluded. End/error/cancel/bodyless responses clean timers/ports. Virtual-clock `server/remote-resource-worker.test.ts` checks stalls, progress, backpressure, long-lived APIs, and cleanup; `server/remote-ui-resource-browser.test.ts` checks real compression/cache/imports.

Under [ADR 0018](../decisions/0018-mewlink-startup-revalidation.md), internal-launcher `remote-resources.ts` explicitly manages `mew-remote-ui-v1` CacheStorage:

| Rule | Contract |
| --- | --- |
| Eligible requests | Non-Range GET: JS/MJS/CSS/fonts/Wasm in `/assets/`; CSS/WOFF/WOFF2/TTF/OTF in `/fonts/` |
| Exclusions | Scripts/JSON in `/fonts/`; accounts, documents, auth tokens, HTML, images, APIs, HEAD, Range |
| Key | Current-parent-verified instance ID + resource path; launch-token changes retain host lookup |
| Limits | 8 MiB decompressed per resource; app-origin total 64 entries/32 MiB; 7 days from last storage; oldest removed first |
| Verified body rewrite | Re-store and refresh its timestamp only after 24 hours since storage, avoiding repeated large writes across visits |
| Failure | Existing P2P download path |

HTTP responses remain `no-store`; these are separately managed static copies ([Cache API vs HTTP cache](https://developer.mozilla.org/en-US/docs/Web/API/Cache)).

After path/realpath/size checks, A issues content-SHA-256 strong ETags with distinct raw/gzip variants. The launcher rehashes cached bodies and sends current-P2P `If-None-Match`; only matching host 304/ETag permits reuse. Stored ETag alone is untrusted, including same-origin cache tampering. Mismatch, expiry, or older hosts fetch fresh; invalid 304 retries unconditionally. Disconnect, 403, and 503 never permit fallback; the worker reapplies response CSP. First downloads stream before storage. Host hash reuse requires matching file identity, size, and modification/change times, capped at 256 entries.

Generated `/assets/` paths accept URI-unreserved `~`, including entry-aware chunks. Hidden segments, traversal, foreign origins, extensions, quotas, SHA checks, and current-host validation are unchanged. An old/rolled-back host returning 400 for controlled index revalidation cancels that response and retries index once without the batch. Each asset still needs host validation; permission, disconnection, and other failures permit neither this retry nor cached HTML.

An index finding no eligible current-instance cache entries records absence for ≤one second on that index request/open transport generation. Matching first-visit assets download live without individual known-empty cache lookups; only bounded SHA-verified copies store in the background. New index/transport, expiry, or cancellation invalidates the hint. It never supplies saved bodies or offline fallback.

Launcher fetch and parent forwarding classify only GET/HEAD `/api/remote-ui/file` as bulk. Bulk uses at most fourteen of sixteen request slots, reserving admission for files/ordinary APIs. Eligible ordinary requests bypass blocked bulk; each class stays FIFO. Legacy shared limits, negotiated separate socket limits, cancellation, queue bounds, windows, and non-replayed writes are unchanged. Scheduling grants no host permission.

Subsequent `/index.html` GET can include ≤64 cached paths in a 6 KiB encoded query. Cache-list preparation exceeding 25 ms starts index immediately and retains per-resource validation. Host hashes allowed realpaths/types/≤8 MiB files in batches of eight and returns ordered raw SHA-256 ETags/`null` in `x-mew-ui-revisions`. HTML is never stored.

Rehashed bodies skip a round trip only when matching that list, bound to instance, open `resourceGeneration`, ≤1 second after response, and one use per resource. Suspend/close/new index invalidates it; late responses cannot replace newer verification. Missing/expired/mismatched lists or old versions use individual 304 validation. Disconnect/permission errors never permit cache fallback.

Users must update host and central and reopen the page. First visits, changed code, or restricted storage still download; reconnect retains current authentication/host validation.

## Preparing the App Bridge During Connection Negotiation

With complete public central/app metadata matching the current central origin, `connection-frame.ts` prepares a fresh-token hidden app iframe alongside WSS bootstrap. Old HTML without metadata waits for bootstrap; partial/invalid metadata errors. No device ID, auth data, or MessagePort is passed yet.

Takeover requires bootstrap-confirmed central/app origins matching preparation. Ready messages must match exact frame/origin/token. Public device context follows bootstrap; transport follows `ready && connected`. `/__mew_ui/` and task requests wait for authenticated P2P. Browser-key/session, ticket, revocation, lease, and recovery-account checks remain.

Failure/cancel/duplicate start/departure/config mismatch cleans iframe, listeners, timers, and pending bootstrap. Saved instance is a lookup hint only: a different actual device closes preparation and restarts with its identity mode. The device-free early iframe has no authorization until confirmed takeover ([ADR 0050](../decisions/0050-mewlink-startup-preparation.md)).

## Approved Mewlink Account Login

**Log In with Mewlink** sends only an action through the designated app MessagePort. Frame/parent verify exact port/frame; the parent navigates to the current device's `?login=mewlink`, which OAuth/email login also return to. App URLs cannot choose navigation targets; cookies, launch tokens, and local sessions never reach the app.

Centrally authenticated connections may carry signed `{ issuer, subject, displayName, provider, username }`: `issuer` is central origin, `subject` its immutable account ID, distinct from the random connection subject/local user ID. Bootstrap identity/session hash bind to the socket attachment; connect, tickets, renewals, and alarms recheck both session/account. Legacy HTTP launch retains signatures, actual session hashes, and single-use checks. A accepts ticket identity only after pinned-key/origin verification. HTTP bodies/headers/prepare display fields prove no identity.

Unapproved users **Request Access** with verified transport identity only; supplied email/role grants nothing. Owners inspect identity/provider/username in **Account Management → Mewlink Account Access**. **Approve** immediately creates a passwordless member in the approved list; account management changes roles. Waiting UI checks approval and logs in, and later connections reuse that approved identity. Device registration grants no local rights; approval or self-linking is required.

Existing email users use **Settings → Account → Link Mewlink Account**, requiring verified identity on that same live P2P connection plus a password session with temporary password changed. Local permissions permit self-linking without another approval. External users first choose **Log In with an Existing Email Account**, then link from a new account-scoped app screen ([decision](../decisions/0007-mewlink-self-service-linking.md)).

Linking targets the current password-session user, never body identity/account/role. `previousAccountId` is the UI-confirmed previous link; return 409 if the actual stored link has changed; retrying the same target is idempotent. Moving a link creates a new link ID, revokes old external sessions/tasks, and clears related requests. In the same atomic account save, an old account without another password/identity is deleted, revoking saved sessions, trusted browsers, Git credentials, and feature/file permissions across workspaces. Accounts retaining another login survive; removing the last owner returns 409. Target role/password/settings/current email session remain. Old project files, personal settings, and work records remain without automatic transfer.

During synchronous merge permission cleanup, only that P2P request stays active, then rebinds to current permissions and responds. Other old-account requests/connections follow normal revalidation/revocation ([merge decision](../decisions/0041-mewlink-merged-account-removal.md)).

| Path | Boundaries and behavior |
| --- | --- |
| `GET /api/auth/mewlink` | Verified connection identity and unavailable/unlinked/pending/denied/approved status. unavailable over ordinary HTTP |
| `POST /api/auth/mewlink/request` | Requests use only the transport identity. Deduplication, up to 256 pending requests, up to 256 processing history entries, a 7-day lifetime, and a 15-minute restriction on resubmission after denial |
| `POST /api/auth/mewlink/login` | Select the current approved link. Switch the request generation and terminate previous tasks without issuing a password session |
| `POST /api/auth/mewlink/link` | Links the verified transport identity to the user's own current password account. Not logged in or no identity: 401; external login or temporary password: 403; conflict with a previous link: 409 |
| `GET /api/admin/mewlink` | Only the owner can view request and link lists |
| `POST /api/admin/mewlink/requests/:id/approve` | Owner approval. The UI creates a new member with an empty body. The compatibility API retains the existing accountId, display name, and member/manager selection. Reject re-execution of processed or expired requests |
| `POST /api/admin/mewlink/requests/:id/deny` | Owner denial of a request |
| `DELETE /api/admin/mewlink/links/:id` | Owner revocation of external authentication. Local passwords and personal settings are preserved |

Processing frees its pending slot immediately and retains only 256 recent history entries. Denial's 15-minute retry restriction lasts only while its history is retained; rapid eviction allows a new request, never access without approval.

`users.json` v2 atomically holds `accounts`, `passwordCredentials`, `mewlinkIdentities`, and `mewlinkRequests`; approval/user creation save together, avoiding orphan users on failure. First save migrates v1 while preserving email-based IDs, sessions, permissions, and personal data. External-only users get `account_…` without fabricated emails/passwords. Compatibility `email` is internal ID; `accountId` is also exposed. Profiles/contact data are separate from login methods. CLI `role`/`remove` accept IDs; `add`/`reset` serve email accounts only.

`server/remote-authentication.ts` selects connection login method. External auth binds current local account/link ID and revalidates every request; reapproval after unlink/delete never restores old-link rights. Approval alone cannot switch a waiting connection: login action does. External auth cannot replace expired/logged-out password sessions. `/api/auth/me` `hasPassword`/`authenticationMethod` select passwordless forms/external logout. Profile save preserves password records.

Saved password/explicit trusted-session resume uses `identity: false`, independently of central login. Trusted external resume still checks the original approved link. Explicit Mewlink login sends no saved local session. Identity-bearing transport ends with central session; even after a password switch, the password session survives for independent next-connection resume. External logout clears local selection, ends central session, and returns to that device's login.

Application requires **local mew update and central redeployment**. Agents run the [required build](getting-started.md); users deploy/restart. Public Git still excludes central source, retained in separate private backup.

## Usernames and Device Addresses

First central login chooses a username; header account settings (`/account`) changes it. Names are case-insensitive unique, trimmed/lowercased, 3–30 English-letter/digit/hyphen characters, starting/ending alphanumeric. Consecutive hyphens/reserved service words are forbidden. Provider names are not auto-claimed.

Current URL is `https://mew.run/<username>/<device-name>`. D1 `0002_usernames.sql` adds nullable `username` and separate name-ownership history. Atomic batch claim/change ensures one winner under concurrency. Old names remain owned permanently. Old-name, uppercase, and internal-ID URLs redirect 307 to current names; unnamed accounts retain existing URLs until set.

Provider identities, admin sessions, and device ownership retain immutable central IDs; work permissions/storage use local account + instance. Username aliases transfer neither rights nor storage. Central IDs are management identities, not local login/device-use permission. Stored ID URLs redirect centrally, so renaming needs no re-registration.

`PUT /central/account` requires central origin/login: invalid names return 400, another owner's name 409. App origins remain blocked. Users deploy frontend/Worker/D1 migrations together with `npm --prefix mewlink run deploy`; username-only changes need no local build/restart.

`mewlink/test/username.test.ts` covers concurrent claims, casing/reserved names/history, session/owner preservation, origin, and old redirects. `mewlink/test/p2p.browser.test.ts` covers setup, duplicate recovery, rename, native P2P through current/old URLs, and mobile widths. Actual deployment is user-owned.

## Direct Email Login

Central email login appears only with Cloudflare `EMAIL` and valid `EMAIL_FROM`: email → send code → verify → first-use username → original registration/device path. Missing config hides it; Google/GitHub/Apple/email-OIDC remain independent. See [sending/deployment](../operations/email-login.md) and [ADR 0206](../history/decisions/0206-mewlink-email-code-login.md).

`POST /central/email/start` checks central origin/email in a bounded body, then sets per-browser host-only Secure/HttpOnly `__Host-mew_email`. Cryptographic 6-digit codes last 10 minutes. D1 `email_logins` stores challenge hash and code hash bound to the raw challenge, never plaintext. Send success marks `ready`; failure deletes the request. Same-browser requests replace previous challenges.

`POST /central/email/verify` requires cookie/code, atomically increments D1 attempts (maximum 5), compares fixed-length hashes timing-safely, then atomically DELETE-consumes success against replay/concurrent winners. Only consumption creates accounts/sessions with existing cookie security. Send limits: 10/IP/minute, 1/normalized-email/minute; verify: 30/IP/minute. Codes, cookies, and email bodies are never logged. Hourly cleanup removes expiry.

Email trims whitespace and lowercases all ASCII, with 64-character local and 254-character total limits. Dot/plus aliases never merge. Identity uses `email-code:<central-origin>` + verified normalized address and retains immutable account ID, without merging same-email OAuth/OIDC/local accounts. Email ownership grants no extra device-management/work permission.

Send failures return 502, rate limits 429, invalid cookie/code 401, and expired/exhausted/consumed codes 410. UI retains input/errors, allows resend/email changes, blocks duplicate resend/verify, and clears countdowns on refresh/navigation. Initial username setup returns only to a safely validated original central path. Tests mock sending; actual delivery, domain activation, and deployment need user confirmation.

## Central login and device selection UI

Central login, code entry, username setup, account settings, and registration share the Mew symbol, IBM Plex Sans KR, purple accents, OS light/dark theme, and input/button/error styles. OAuth buttons pair provider icon/action; email-code entry hides providers. One code field supports paste/autofill; resend countdowns are not announced every second.

Username/device inputs preview the final URL. Account ID stays in copyable collapsed details. Device rows show name, online state, address, and owner-only unregister. Copy success uses check/status announcement. Inline unregister confirmation returns focus on Cancel/Esc. Mouse/keyboard share DOM tooltips; touch has no hover tooltip.

Empty lists explain local-account-settings registration. Public device connection uses only a **full-screen gradient and centered indicator**, matching initial HTML, without header/account menu/address card/list link. It shows `mew에 연결 중`, then transport-ready `mew를 여는 중`, and transitions only on app-ready. Brief recovery preserves app/drafts.

A single OS-themed CSS radial gradient animates transform/opacity only, without image/video/canvas downloads or extra animation libraries. Reduced motion is static; hidden tabs stop animation. Connection uses system fonts; central regular/bold fonts (~809 KB) load through `shell()` only for login/registration/management. Installed-app fonts retain their contract. See [animation guidance](https://web.dev/articles/animations-guide).

`bootstrapRemoteConnection()` opens device-path/instance WSS while preparing offer/ICE. It verifies the instance, app origin, allowed issuer, and central public key from the same-origin challenge, avoiding HTTP launch and `/central/key`. Once instance key/resume state are ready, connect sends once with socket nonce, offer, and public key. Cancellation closes socket/peer/waits and prevents late reopen. Legacy `connectRemote()` HTTP/key lookup applies only to transport failure before bootstrap context, never invalid context, denial, or revocation. Candidates retain WSS ordering/authorization and all key, signature, issuer, audience, time, and browser/device proofs below.

Authenticated host WSS pre-supplies its proof-specific auth epoch and up to 8 single-use challenge/generation entries for 60 seconds. Central SQLite `mew_signal_preparations` atomically consumes entries before prepare/final ticket, skipping ready round-trip; consumption records survive until expiry against hibernation/duplicate supply. The host also consumes once per epoch and rejects tampering/reuse/expiry. Preparations grant no access or replace device/browser checks. Unsupported/exhausted entries or ≤2 seconds remaining use the [existing ready path](../decisions/0028-mewlink-websocket-bootstrap.md).

Resume, dispatch, and authenticated responses wait for final-ticket/key-possession verification. `remoteTicketInbox` bounds early data to 32 KiB/frame, 512 KiB total, and 4096 entries. Termination/expiry releases waits/helpers; late tickets, signatures, and process callbacks are ignored. Answers/candidates during signing stay after ticket and cannot send after revocation/host replacement.

After challenge verification/connect, pre-ticket ICE uses the same WSS. Central orders same-socket messages and forwards only to approved `state.connection` with current identity/revocation/lifetime checks. Pre-ticket candidates cap at 127 within the 128-entry queue including connect. Cancellation, signaling interruption, or recovery-auth wait pauses candidates until verified reattachment.

Registered hosts prepare native components/certificates/ICE in at most one separate standby RTC helper without account, registration key, session, or remote offer. Prepared SDP/candidates stay local. Warmup channel 1022 closes before the real offer; upstream rollback creates a normal answer. Its closed JS wrapper remains until `rtc.cleanup()` because premature GC of the SDK-global-list wrapper can crash/hang shutdown; native closure retains no sockets. Unused UDP sockets refresh every 30 seconds within `55000–55031`; central reconnect also replaces standby. Takeover prepares the next helper when capacity permits, but router mapping waits for actual prepare. Eight active connections/separate processes remain the limit; used helpers never serve another connection. No standby is created at 8 active or while central is down. Preparation errors cannot loop creation immediately; takeover, registration changes, unregister, and shutdown clean retries/standby.

Active NAT preparation waits 100 ms and cancels if connection wins. Linux [async route/address lookup](remote-desktop-connectivity.md#automatic-nat-preparation-for-active-connections) avoids blocking RTC callbacks. Active/standby termination sends close, then SIGKILL after 4 seconds; normal exit cancels it, and stalled cleanup is not repeatedly awaited via SIGTERM. NAT leases, permissions, and per-connection isolation remain.

The launcher verifies `mewlink-central-origin`/`mewlink-app-origin` HTML metadata and exact-parent instance, starting worker registration/activation during P2P preparation. Only HTML missing both queries `/config`; partial/invalid metadata errors. HTML contains no nonce/ticket/key/session; final MessagePort instance must match. Initial `/api/auth/me` overlaps resources, and index replaces duplicate `/api/remote-ui` bootstrap checking. Index 403, 404, and 409 become launcher errors. Existing-app recovery reopens transport only after same-account/auth-method verification.

Current-connection `initialAuth` passes once. Negotiated `authStatusPending` makes earlier index/app code await that same `/api/auth/me`, avoiding duplicate reads. Old launchers query normally; invalid/terminated state errors. Reconnect/account switch discards pending state and rechecks account/auth method; results never persist. Route auth-entry download overlaps MessagePort/storage setup; rendering waits for scope verification.

A saved session/device-path hint chooses bootstrap `identity=0`. Address→instance is only a hint: mismatch closes preparation and restarts in the actual identity mode, without sending that session/key to another device. Explicit Mewlink login excludes saved sessions. Recovery bootstraps anew and resumes app only after account/auth-method match.

Simulated overlap of 180 ms preparation and 200 ms signaling reached connect at 200 ms. This is not production timing and guarantees nothing about network, ICE, or downloads. Application needs local update and central redeployment.

Offline/failure views provide specific errors, retry, or device-list navigation. Bound relay ports send launcher reasons before termination so cleanup cannot overwrite them. Frame-ready, resource preparation, and app-ready each allow 15 seconds. Frontend application needs user **central redeployment**; agents perform the [required build](getting-started.md), not deployment.

`shared/remote-launcher-role.ts` defines public device/port, app, and management roles. Worker selects connect/app/dashboard HTML; Vite builds role entries, static CSS, and preload from `public/index.html`. New HTML bypasses unified `launcher.js`; `client.ts` keeps a small dynamic router for old HTML ([ADR 0029](../decisions/0029-mewlink-launcher-entries.md)).

| Module | Responsibility |
| --- | --- |
| `connection-parent.ts` | WSS, browser keys, sessions, trust, recovery |
| `app-launcher.ts` | MessagePort, Service Worker, installed app |
| `dashboard.ts` | Login, registration, management |
| `launcher-ui.ts`, `launcher-page.ts` | Shared DOM, state, tooltips |
| `dashboard-ui.ts` | Brand/provider SVGs |
| `launcher.css`, `dashboard.css` | Base/connection styles and management styles respectively |

Normal connections omit management/provider SVGs; app bridges omit JOSE, central connection, and key code. Management login loads only for explicit Mewlink login.

`launcher-assets.ts`/Vite reuse parent `public/` symbols, fonts, and licenses/sources. Worker serves designated assets and direct `/launcher/` JS/CSS only, not nested files, maps, or arbitrary source. App-origin auth/API blocks and P2P boundaries remain.

Central/app launcher responses specify `Cache-Control: no-store, no-transform`, preventing storage and requesting no intermediary injection, including Cloudflare analytics, while retaining own-script CSP. `static.cloudflareinsights.com/beacon.min.js` blocks prove analytics CSP violations, not device-connection failure. Regression tests intentionally inject it and still verify native P2P, refresh, and two tabs. [Analytics FAQ](https://developers.cloudflare.com/web-analytics/faq/) · [Cache-Control](https://developers.cloudflare.com/cache/concepts/cache-control/#other).

Isolated tests cover both themes at 320, 390, 700, and 1100 px: providers, email errors, names/duplicates/rename, previews/IDs, empty/offline/long-name lists, copy/unregister/Cancel/Esc, touch, failures/timeouts, and native P2P fullscreen. Provider config is mocked; real OAuth, email delivery, and central deployment require separate confirmation.

## External WSL access and UDP inbound traffic

Native WebRTC uses only UDP `55000–55031`. STUN external candidates do not ensure phone access when inbound UDP is blocked. WSL mirrored needs separate Hyper-V and Defender checks; allow only the required range, never the overall default inbound policy ([WSL networking](https://learn.microsoft.com/windows/wsl/networking#mirrored-mode-networking)).

Local **Mewlink → Register Device** invokes `remote-access-network.ts` before registration; **Prepare Connection** applies the same procedure to registered devices without changing key/ID. Startup, status, and external-phone connections never trigger Windows approval. Read-only status reuses results for 30 seconds. Only local owners may call `POST /api/remote-access/prepare-network`; P2P dispatch rejects it.

`remote-access-network.ps1` prepares only WSL Hyper-V or Windows Node inbound UDP. Required UAC is requested once with concurrent-call coalescing. Cancel, explicit blocks, name conflicts, and management restrictions fail without overwriting rules. WSL range rules cover the VM, not one program. Linux/macOS/uninspectable Hyper-V remain `unknown`: registration proceeds without claiming preparation.

For WSL installations requiring manual recovery, a range rule can be added in administrator PowerShell as shown below.

```powershell
New-NetFirewallHyperVRule -PolicyStore PersistentStore -Name 'Mewlink-ICE-UDP-55000-55031' -DisplayName 'Mewlink ICE UDP 55000-55031' -Direction Inbound -VMCreatorId '{40E0AC32-46A5-438A-A0B2-2B479E8F2E90}' -Protocol UDP -LocalPorts '55000-55031' -Action Allow -Enabled True
```

Existing same-name rules require range/direction/allow checks, not duplicates. Management/Defender blocks must be checked separately. Router NAT and external UDP remain independent; firewall rules alone guarantee no network-wide success. Revocation deletes only that named rule.

Source installs read `remote-access-rtc.mjs` in each new connection process, so helper-only port/candidate changes apply next time. Parent registration API, settings, and preparation need user update/build/restart; CLI changes need a new executable. Same-PC anonymous mobile-browser/UDP-candidate checks do not establish external LTE success.

### Router preparation and direct connection diagnostics

The helper exchanges host/STUN candidates immediately. After 100 ms without connection, `nativeConnectivity` tries PCP → NAT-PMP → UPnP only if the host UDP socket matches the OS default route. Supported routers get a 120-second lease for that port; success adds its public candidate. Renew at half returned lifetime; delete only owned mappings on close. Established direct connection cancels needless discovery. Channel/peer close immediately; mapping cleanup allows 3.5 seconds.

`RemoteStatus.network` reports OS preparation; `connectivity` reports latest helper gathering, host/srflx/public-IPv4/global-IPv6 counts, and mapping state, without addresses, ports, or auth values. `online` means central signaling, not a connected external phone. OS preparation and synthetic NAT success do not prove external access.

Work stays on direct DataChannel, without HTTPS/WSS/TURN relays. Unsupported mapping, multiple NATs, or external UDP blocks may still prevent access ([decision](../decisions/0006-mewlink-direct-network-preparation.md)).

## Windows Chrome connection to WSL on the same PC

Only WSL kernels add a `127.0.0.1` candidate through `server/remote-access-rtc.mjs`/`remote-access-ice.ts`, matching IPv4 UDP host socket port/mid. Duplicate interfaces emit it once. Normal host/STUN and ticket/key checks remain; TCP, IPv6, srflx, relay, and mDNS never produce loopback. No extra relay socket/HTTP path opens.

Mirrored Windows/Linux interface ICE may fail on the same PC. On 2026-10-09, actual Windows Chrome 155 + isolated WSL2 mirrored helper reproduced 0 responses with original candidates, then selected pairs/opened DTLS/DataChannel with loopback. Chrome experiments, firewall, and WSL settings were unchanged. Other WSL modes/external networks remain unproven ([WSL networking](https://learn.microsoft.com/windows/wsl/networking)).

Each connection rereads its helper, so candidate-only changes need neither central redeploy nor app rebuild. Use **Reconnect** or refresh for a new connection.

## Central signaling authorization state

Each device DO SQLite owns device key, browser trust, and revocation. Initial D1 device/browser import runs once; failure is never empty/completed initialization. Hibernation restores the same SQLite/attachments. `shared/remote-signaling-state.ts` implements shared state; private `mewlink/src/signaling.ts` handles central connections ([ADR 0025](../decisions/0025-mewlink-signaling-authority.md)).

SDP ready/answer/ICE never reread D1 device/browser state: password, saved-session, and anonymous traffic makes 0 such queries. Identity-bearing connections retain central session checks/request limits. Bootstrap consumes its attachment nonce once without D1 launch INSERT/DELETE; legacy HTTP issuance/consumption remains D1-backed. Prepare/ready, signatures, leases, and direct transfer are unchanged.

Management revocation/disposal persists DO SQLite first, terminates targets, then updates D1. D1 failure returns an error without undoing DO revocation. Admission and post-verification/signing recheck latest revocations; late initial imports/trust registration cannot reverse them. Management lists read DO state.

Renewals and the 10-second alarm merge D1 revocations monotonically and revalidate central sessions; active D1 rows never undo DO revocation. Direct D1 edits apply next renewal/alarm. Backup/rollback must cover both stores under [central deployment rules](../operations/remote-central.md#preserving-and-restoring-signaling-authorization-state).

## Connection authentication and revocation

### Single-use rate limit proof prepared in HTML

Public-device HTML GET consumes HTTP, IP launch, device launch, and IP browser-signal limits in one D1 batch. `0006_instance_rate_keys.sql` `instance_rate_keys` binds instance to the existing SHA-256 key without changing counters/limits/order. Registration/authenticated host startup prepares keys; missing legacy associations use existing lookup then backfill. A conflicting key denies connection. HEAD, old-name redirects, missing/disposed devices consume no bootstrap quota early.

Successful GET embeds signed 10-second admission bound to device, path, origin, IP, and single-use jti: proof of quota consumption, never device/account access. Only first bootstrap sends `mew-admission-v1` + `mew-admission.<증명>`; response selects the fixed value. Reconnect cannot reuse it. URLs, referrers, app context, workers, and logs never receive the proof.

Worker strips external `X-Mew-Admission` and forwards signature-verified values only. DO rechecks device/owner/name/IP/origin/expiry, atomically consumes `mew_signal_admissions` jti before WSS, and retains ≤128 consumption records until expiry. Forgery/reuse opens no socket; socket nonce, key ownership, and ticket checks remain.

Valid admission skips WSS D1 lookup/rate writes. Missing/expired admission or changed IP uses normal D1 limits without refunding HTML counts. Old HTML/HTTP launch remain compatible. Mixed rollout/version mismatches may conservatively count twice; deploy Worker, role HTML, and hashed chunks together. Explicit rejection/forgery cannot bypass through old client auth.

### Signed offer in the first WebSocket Upgrade

Admitted GET advertises `mewlink-connect-flight=1`, allowing `mew-connect.<JWT>` alongside admission protocols while selecting only `mew-admission-v1`. Old HTML uses challenge/offer. Replacement RTC uses its separate protocol below, never consumed HTML admission.

Ed25519 offer JWT uses the non-extractable per-instance key and binds admission SHA-256/`jti`, instance, full SDP/fingerprint, key thumbprint, and `${centralOrigin}/connect-flight`. Central admission supplies issue/expiry times, not browser clock. Candidate-free SDP caps at 4KiB, JWT 8KiB, entire header 12KiB. No local session/private key/account/identity credential is included. Never log protocol headers/tokens.

Worker requires valid admission for the same IP/path. DO checks signature/bindings/current authority and atomically consumes admission before opening. Challenge/context sets `earlyConnect: true`; existing connect uses a fresh internal socket nonce, without a second client connect. Ticket, signed host answer, browser-channel proof, revocation, host generation, quotas, and transmission leases remain. Client account/identity/session/preparation claims grant no authority.

Hash-authorized inline code prepares one public RTC endpoint and signs Upgrade before controller download finishes. Controller reconstructs exact protocol from original offer/key/admission times; admission's one-use `jti` makes deterministic Ed25519 reproduce the token. Matching URL/admission adopts endpoint/socket once. Pending signaling caps at 128 messages/64KiB, ICE at 128 candidates. Departure/ten seconds closes unused preparation. Leases retain original Upgrade monotonic/wall times, never handoff time.

Settings changes discard preparation. Instance-hint mismatch restarts with the real device key, even anonymously; accepted flight rejects a later different key. Cancellation closes the exact unadopted socket and prevents late creation. Elapsed admission may reconstruct only to adopt its existing exact socket, never open a fresh connection.

Unusable local preparation may use challenge flow; forged/explicitly rejected flight cannot downgrade to legacy auth. See [decision](../decisions/0122-mewlink-initial-offer.md) for proofs and [work record](../work/mewlink-subsecond-startup.md) for measurement versus deployment.

### Signed replacement RTC offer

Separate `mewlink-recovery-flight=1` allows explicit RTC replacement for a known instance/key through `mew-recovery-v1, mew-recovery.<JWT>`. Never mix HTML admission protocols. Response selects `mew-recovery-v1`; suppress ordinary connect only after accepted context confirms `earlyConnect` and `recoveryConnect`.

Recovery Ed25519 JWT binds kind `rtc-recovery-connect-v1`, audience `${centralOrigin}/recovery-connect`, random 24-byte `jti`, ten-second lifetime, instance, thumbprint, candidate-free SDP/fingerprint, and renew/resume flags. No session/account credentials; SDP/token/header remain 4KiB/8KiB/12KiB. Date uses last central `serverNow` + monotonic elapsed time; >two-second wall divergence from sleep/clock changes disables preparation. Actual transmission still anchors leases.

Worker applies normal bootstrap IP/instance/signaling quotas. DO verifies signature/time/bindings/current authority and atomically consumes instance/thumbprint/`jti` hash in `mew_signal_recovery_flights`. Records survive hibernation until proof expiry, cap at 128, and cannot be reserved by another key. Fresh internal nonce invokes existing connect. Host preparation, tickets, host answer/channel proofs, revocation, and local auth remain mandatory.

Unsupported Upgrade/missing recovery ACK closes that exact socket/peer before one fresh challenge attempt: no signed-proof reuse or same-socket downgrade. Malformed nonce/context, verified denial, revocation, or target mismatch ends without fallback. Old central with unsupported bootstrap retains finite HTTP compatibility. Missing metadata/key/usable server clock starts ordinary negotiation. Signal-only resume is unchanged; socket opening alone renews no session.

### Resource-worker readiness

Reuse requires activated `/remote-resource-worker.js` with matching exact script URL, root registration scope, active worker, and controller. A private MessagePort must confirm protocol 1 within 40ms, followed by identity recheck. Only then does public-script update run in background rather than blocking UI.

First install, foreign/inactive worker, missing registration, incompatible reply, or old worker awaits registration/activation/exact controller; failure stays an error. Departure aborts waits. Probe carries public version only: resources still need exact launch token/current P2P, with no disconnected saved-body fallback. Incompatible future contracts must bump probe version.

### Non-bootstrap signaling admission

Host signal/non-bootstrap browser reattachment batch active-instance lookup and conditional IP counter. Missing/revoked instances never increment. Existing host/browser keys, 30/minute limit, expiry reset, and 403 for missing instances before rate-limit 429 remain. Incomplete/failed batches deny; the saved D1 round trip changes no DO authority/revocation/lease check.

1. A signs the central nonce with the server key on every WSS connection. The central service verifies the registered public key and instance ID.
2. B opens `/central/signal?role=browser&bootstrap=1` WSS using the device path or instance ID. The central service checks the origin, registered device, IP, and device request limits. The DO binds the nonce, random subject, and optional central identity to that socket and sends a challenge. The session is an empty string for anonymous or identity-omitted connections.
3. B sends that socket's nonce, SDP offer, and Ed25519 public key. The central service consumes the nonce once and checks current device and browser revocations. When A creates a challenge/generation and sends ready, the central service signs a 60-second ticket for the instance, connection, browser key, SDP fingerprint, and trusted CF connection IP. Older versions obtain an existing HTTP launch, verify its signature, target, and session binding, and atomically consume it once.
4. A starts RTC preparation after ready and separately completes final ticket validation of the pinned central key, issuer, audience, algorithm, expiration, connection, negotiation, authentication mode, and IP. The answer fingerprint is signed with the server key, and B verifies it using A's registered key confirmed by the central service. The DO's host FIFO forwards answers and candidates after sending the ticket.
5. In the channel's first message, B presents the exact ticket and proof of browser key ownership. A local session for reconnection is accepted only from `session` in this message, and a trusted session must also match the saved public key fingerprint. An invalid session leads to the login screen without operation permissions. Challenge/generation values are not reused.
6. Before login, limited UI, authentication, and access request APIs are used. A local password or explicitly approved external identity applies the existing account's feature and file permissions. Central login and logout do not create or revoke local password sessions. Transports containing an identity also check the central session lifetime.

The browser's central connection proof and device answer verification, and the server and central service's `verifyRemoteToken`, use the shared `REMOTE_TOKEN_CLOCK_TOLERANCE` to allow **2 seconds** of clock skew. The tolerance missing from browser verification was aligned with the server, while the `iat` maximum age of 60 seconds and expiration, signature, issuer, and audience validation remain in place. If a future `iat` exceeds the allowed range, guidance to automatically synchronize the date and time on the connecting device and mew host is shown instead of a raw JWT error. The current time is not changed to the token's issuance time, and time validation is not skipped. Applying this fix to the central launcher requires the user to redeploy Mewlink; actual device clock skew and production application are checked separately.

Active connection leases last at most **60 seconds**, and B's renewal interval is **20 seconds**. A does not apply renewals before transport key proof is complete. Central logout terminates connections containing an identity while preserving identity-omitted local password connections and saved password sessions. Previous central member revocation is not a basis for new local permissions. Disposing of device registration terminates open signaling connections and A's connections. A revalidates the selected authentication method, current account, and lease on every request and at 1-second intervals. During central disconnection, only connections that negotiated reattachment remain within their existing lease; all others close immediately. A's policy change events also trigger validation. Existing WS and desktop per-feature permission revalidation and input leases are used together.

After the existing 10-second alarm check, the central DO sends a `renew` request specifying the connection ID to browsers that sent `serverRenewal: true`. The browser responds immediately only on the same connection where key proof is complete, allowing renewal even if the 20-second timer is delayed. Sending the request alone does not extend the lease, and responses are also subject to device, identity, and expiration checks. This request is not sent to older browsers, and new browsers connected to an older central service continue using the 20-second timer. Browser suspension or authenticated WSS disconnection does not extend the current lease, and negotiated reattachment stays within the [recovery lease bounds](remote-access-recovery.md#same-rtc-reattachment). Application requires the user to redeploy the Mewlink central service. Isolated validation checks the delayed-timer path and does not establish the cause of actual repeated disconnections or replace phone power-saving or external-network verification.

### Reattaching the same RTC after a brief signaling interruption

The [remote connection recovery contract](remote-access-recovery.md#reattaching-the-same-rtc-after-a-brief-signaling-interruption) owns signaling reattachment, replacement RTC, foreground probes, suspended work, retry budgets, and verified subscription/focus recovery.

## Transport paths

| Path | Implementation and support scope |
| --- | --- |
| Actual UI HTML, JS, CSS, workers, images, and PDF static assets | A's installed build → authenticated P2P GET/HEAD → internal iframe. Only the connection frontend is deployed to central |
| App HTTP, JSON, multipart, and SSE | Explicit `mewFetch` → local fetch or authenticated DataChannel request/response/stream |
| App WebSocket | `openMewSocket`; terminals use the injected `socketFactory`. Uses the existing WS server's sessions, permissions, and account workspace |
| Allowed WS | `/api/tmux/ws`, `/api/agent/ws`, `/api/presence`, `/api/collab`, `/api/db/ws`, `/api/login-desktop/ws`, `/api/dom-browser/ws`, `/api/remote-desktop/ws` |
| URL requests for images, PDF.js, media, and downloads | The internal app origin's `remote-resource-worker.js` forwards `/api/` GET/HEAD through the **connection bound to the requesting tab/worker**. Preserves Range and PDF version/edit headers |
| Central accounts, registration, login, and signaling | Central HTTPS/WSS. Kept separate from work transport |
| Remote desktop | Negotiation uses app transport; video/input uses the existing separate peer. OS approval, single-controller, input lease, and NAT contracts remain in place. Actual video/input verification was not performed in this work |
| Internal localhost DOM browser | Authenticated `/api/dom-browser/ws` through the ordinary Mew P2P socket bridge, with host `portPreview` authorization. Requires an updated host and central shared socket allowlist, but no preview domain. Execution and assets follow the [DOM browser contract](port-preview.md#internal-dom-browser). |
| Legacy localhost app preview | Entry through `/user/device/<port>`. Passes only a port-specific capability issued through Mew login and `portPreview` permission. Assets, APIs, and WS on the separate preview origin connect to host loopback over P2P. Requires the wildcard HTTPS configuration in [Port preview](port-preview.md). |
| Android iframe | Unsupported over P2P. Hides the Android capability and does not allow arbitrary URL proxying. |
| Agent and GitHub login screens | Transmits JPEG video and input from `/api/login-desktop/ws` through existing app transport. The host's independent X server owns the virtual display and input. |
| Local login, password changes, and logout | Uses A's existing authentication API over P2P. Separate from central device registration and management login |

`remote-access-dispatch.ts` binds verified session lookup to an in-memory duplex, reusing HTTP parser, Express, and WS upgrade without a TCP loopback port. Private WeakMap context supplies auth; B cookies, Authorization, role, Host, and forwarded headers are untrusted. Both ends forward allowed headers only. `/api/auth/me`, profile, and password changes retain local authorization; old remote-member API returns 410.

`remotePath` validates fixed `/api`/WS allowlists, normalized paths, and size. User HTML/SVG retains sandbox CSP, nosniff, and no-store. Temporary connection paths bind iframe/navigation/resources; unidentified connections fail. Workers neither cache work nor substitute another tab. Unsupported browser/network paths error with retry. TURN, relay candidates, and central work-HTTP proxies are unused.

Remote downloads use A's `Content-Disposition`, not Chromium's worker-bypassing `download` attribute. Worker lookup uses `clientId` or same-tab navigation `replacesClientId`; missing owning tab returns 503, never another tab's transport.

Central connection mode survives termination: missing transport fails app requests/sockets without central HTTP/WSS fallback, including late save/command bodies. Central account/logout uses its separate client.

Late local-WS messages/send failures close only that socket. Virtual-socket callbacks use [DOM exception handling](https://dom.spec.whatwg.org/#concept-event-listener-inner-invoke), reporting browser errors without failing P2P receive processing. Invalid protocols/global transport failures close the connection. Session/permission revocation closes affected old work/WS while retaining restricted login transport. Late Blob reads/split chunks send nothing after socket close.

## Protocol and resource lifetimes

The protocol version is **1** in `shared/remote-access.ts`. It is checked in the central challenge and A's authentication-complete message, and incompatible connections are rejected. The server name is fixed after initial registration; changing it requires deletion and reregistration. Production verification of version-specific updates and automatic key rotation remains pending.

| Limit | Current value |
| --- | --- |
| Single JSON frame / binary chunk | 32 KiB / 12 KiB (size before base64 encoding) |
| Extended HTTP/WS receive window | Initially 8 chunks / 96 KiB after negotiation; up to 256 chunks / 3 MiB after consumption. Unnegotiated HTTP retains 1–8 chunks; WS retains the existing send method |
| RTC send queue | Wait at 512 KiB or above; terminate if no progress is possible for 10 seconds |
| A's per-connection native IPC receive queue | UTF-8 total of 512 KiB including the frame being processed; at most 4096 queued items. Processes authentication and frames in FIFO order and removes unprocessed items on termination |
| A's pending native IPC send ACKs | At most 64 per connection, with at most 512 total across A's 8 connections. Terminates the affected connection if no response arrives within 10 seconds |
| Concurrent HTTP/WS work | After separation is negotiated, 16 each and 32 total per channel. Unnegotiated peers share 16 slots |
| Admission queue when concurrent work exceeds the limit | At most 64 per transport instance, with a 30-second wait. The same caps apply to the actual channel's shared app/resource queue |
| Concurrent browser connections | 8 per A |
| HTTP upload / single WS message and queue | At most 25 MiB each. Lower limits in existing APIs also apply |
| A's total in-flight HTTP bodies and WS assembly/send data | 64 MiB. Not a RAM limit for the entire OS process |
| Signaling message / pending processing / ICE count | 96 KiB / 128 per connection / 256 total in both directions per app connection |
| No initial HTTP response or upload progress | 30 seconds. After the response, streams end through cancellation or channel/authentication lifetime limits |

App MessagePort and launcher/resources share actual-DataChannel admission. Negotiated `flowControl.separateStreams: true` gives HTTP and WS 16 slots each; blocked WS cannot hold free HTTP slots. Unnegotiated peers share 16, and older versions retain shared FIFO. Current HTTP bulk/ordinary classes retain their own FIFO under the [bulk-resource reservation](#host-ui-compression-and-revalidation) above. HTTP holds slots through body completion, WS through close. Cancel/close/termination removes unsent queued work; bounds/timeouts error. Server completion frees work before its end frame; browser cancel frees slots after its cancel frame. Writes never auto-retransmit.

Forwarded `request`, chunks, `end`, `cancel`, and credit share per-work send FIFO. Close/cancel cannot overtake RTC-backpressured chunks. Pre-admission cancellation discards unsent body; started work sends prior frames then cancel before slot release. Late completed-work credit is discarded.

`node-datachannel` 0.33.4 `sendMessage()` returning `false` still means success if RTC accepts without throwing. Helper sends once, returns acceptance ACK, and applies 512 KiB/10-second backpressure, never duplicate retransmission. This is not remote-work completion ACK. The installed [libdatachannel v0.24.5 send implementation](https://github.com/paullouisageneau/libdatachannel/blob/v0.24.5/src/impl/sctptransport.cpp#L340-L359) and native load tests establish this; actual exceptions/closed channels terminate.

Native pending ACKs are per connection: 64 allowed, send 65 rejected only there. Close clears waits; late ACKs cannot affect recreated same-ID connections. Host tests cover three browsers each with 16 HTTP + 16 WS ACK waits, overflow, close, and recreation.

Apply both host/server and central frontend changes. Agents run root `npm run build`; users run `./mew restart`, `npm --prefix mewlink run deploy`, and refresh the device page. Agents never restart/deploy.

Version-1 `request.responseWindow`/`response.responseWindow` retain 1–8 chunks. Old hosts lacking fields use one-chunk credits; old clients omitting them get no initial credit. New peers negotiate consumption control below. Downloads stream rather than accumulate whole-file Blobs, retaining file-API limits. Large WS splits/reassembles by sequence. Early HTTP 403 and post-cancel chunks do not disrupt other work. Lost save/command results require user checking before retry, never automatic retransmission. Termination cleans streams/sockets/children; helpers exit after 10 seconds without parent heartbeat.

### Consumption-based HTTP/WebSocket receive control

`flowControl: { version: 1, maxWindow: 256, separateStreams: true }` is proposed on HTTP/socket open and applies only after matching response/`open` confirmation ([ADR 0032](../decisions/0032-mewlink-consumer-flow-control.md)). `maxWindow` accepts 8–256; `separateStreams` is optional. Old peers retain HTTP windows/WS sending without batched credit.

New hosts begin with 8 chunks. Final-consumer `RemoteReceiveWindow` uses RTT, processing cost, outstanding credit, and unread bytes to grow within 3 MiB. HTTP grows only on reader consumption, leaving unread responses at initial 96 KiB. WS measures validation, decoding, assembly, and dispatch cost. Next-task batched credits leave UI/small-message opportunities. Bridge `forward` relays final-consumer credit without adding ACKs.

Negotiated `credit.count` returns 1–256 credits/frame. `RemoteSendWindow` rejects over-cap credit and releases waits on cancel/socket close/revocation. Browser rejects over-window chunks and clears pending credit for closed windows. Message/upload/RTC/server-byte caps remain. Base64 keeps native conversion, with simple iterative fallback on unsupported browsers.

In the 2026-10-20 isolated mixed-load test with native RTC, Chromium, and both MessagePort endpoints, small WS latency p95 was 3 ms, small HTTP latency was 5.9 ms, and the maximum display frame interval was 16.8 ms while receiving 22.5 MB over WS. In a separate simulation of 100 ms round-trip latency, 4 MiB HTTP decreased from 4.48 seconds with the existing receive window to 0.55 seconds with the expanded window. Tests also covered 4× CPU slowdown, unread responses, slow readers, 16 persistent WS connections alongside HTTP, older versions, cancellation, and permission revocation. These figures are results from that isolated run, not total loading times on actual user devices or external networks.

`@mew/ui/browser-storage-scope` names localStorage/IndexedDB by local email + instance, separating files/tabs/drafts/agent history by account/A and replacing open DB connections on scope change. Regenerable localStorage shares the existing origin-wide budget/retention across hosts. Termination clears current-scope regenerable bodies/transcripts/transfers while **preserving unsent drafts, PDF annotations, open tabs, and settings** ([storage contract](browser-storage.md)). Global fetch/WebSocket/localStorage are never replaced.

## Verification and remaining gates

The 2026-10-22 rate-limit batch change has been applied to the local private central source and has not been deployed to production. Actual Workers/D1 regression tests and production timings before application are recorded separately in the [central deployment history](../work/mewlink-deployment-history.md#2026-10-22-connection-latency-remeasurement-and-request-limit-batching). This change removes two DB calls and does not guarantee resolution of overall initial connection time or external network latency.

On 2026-10-20, isolated regression tests passed for consumption-based transport, signaling reattachment, and per-connection native ACK isolation. The central launcher and Worker were deployed, and anonymous initial connections and refreshes with the new bootstrap were verified 6 times, along with maintaining a connection for 80 seconds. The local mew build/restart and timing of actual conversations after login remain pending. Deployment versions, measurement scope, and DO propagation checks follow [central production verification](../work/mewlink-deployment-history.md#2026-10-20-production-verification). Undeployed labels in the earlier verification records below reflect the status at the time of each record.

The 2026-10-20 in-memory ESM and cache-disabled Chromium tests of role separation confirmed that the JS bodies of the two documents decreased from 194,482 B to 102,017 B. These used identical minification conditions excluding CSS, Vite preload helper code, and HTTP compression; they are not production build or connection timing figures. Management code and provider SVGs for ordinary connections, and JOSE and browser key implementations for the app bridge, were not included; there were 0 requests to `/config`. Tests passed for 1 new graph, 11 existing launcher tests, and 83 Workers tests covering role HTML and ASSETS boundaries.

After role separation, actual native P2P connection, signaling recovery, and refresh tests also passed, along with separate tests for a 65-second lease, 1000 WS operations, mixed HTTP, and password/device revocation. CSS order was fixed as base → management, and existing declarations and computed styles were compared across PC/mobile and light/dark themes. Type checks for the root, central, and Vite configuration, lint, and documentation checks were performed; no production build, deployment, or server restart was performed.

2026-10-20 WebSocket bootstrap and parallel RTC preparation were verified with 79 Workers tests, 33 browser connection tests, 14 host and ticket inbox tests, and 11 mock Chromium launcher tests. On actual Workers/DO, native RTC, and Chromium, we observed 0 HTTP launches and a new bootstrap WS on first connection, signaling recovery, and refresh. Separate checks covering a lease of at least 65 seconds, 1000 WS messages, mixed HTTP traffic, and password/device revocation also passed. Root and central type checks, lint, and documentation checks are distinct from production application, and existing lint warnings remain. Production redeployment of the new path, external-network timing, and the 0.5-second target remain unverified.

Isolated connection and authentication verification:

2026-10-19 Local type checks and 69 host and transport tests for this change passed, along with central type checks and 56 Workers Vitest tests across 9 files. The 1 native P2P browser test and the mock launcher's trust/recovery checks were run separately. The trust screen, browser management, and revocation states were checked at 1100px/390px in light and dark themes. These results do not turn the earlier full `npm test` failure history preserved below into a full pass.

- `remote-access-network.test.ts`·`remote-access-registration-network.test.ts`: Read-only queries, explicit preparation, permission denial, cancellation, duplicate requests, preservation of existing keys, environments where checks are unavailable, and mocked Windows PowerShell policy responses. Actual firewall settings and UAC are not changed.
- `remote-access-rtc-nat.test.ts`·`remote-access-rtc-nat-browser.test.ts`: Passing only UDP host candidates to temporary mappings, early connection cancellation, shutdown cleanup, diagnostics without addresses, and actual node-datachannel↔Chromium data round trips using only mapped candidates from a synthetic UDP NAT, followed by lease deletion. This does not verify actual routers or mobile networks.

- `server/remote-ui.test.ts`·`server/remote-ui-resource-browser.test.ts`: Actual gzip dispatcher transport, Service Worker unregistration, HTML/JS/CSS/dynamic import/worker execution, old servers/unsupported browsers, HEAD/Range, compression/cancellation, and path/size/bootstrap limits. Also verifies 304 with a 0-byte body for a new launch, host isolation, body tampering, resource updates, 7-day expiration, invalid 304 responses, storage failures, and blocking offline reuse.
- `server/vite-resource-paths.browser.test.ts`: Reproduces duplicate requests from the previous absolute preload in a separate write:false Vite fixture, then verifies 1 module request and CSS/image/worker paths and execution under the local `/browser` and P2P prefixes with the actual relative base configuration. Does not change the production build or dist.
- `src/app-bootstrap.browser.test.ts`·`src/utils/fontPreferences.test.ts`: Removal of workspace downloads before login, reuse of authentication results and account lifetime, removal of external CSS requests for the default font, and one-time preparation of the selected font. Detailed boundaries follow the [app startup contract](architecture.md#initial-browser-startup).
- Local `mewlink/test/connection-screen.browser.test.ts`: Initial HTML, full-screen/centered layout on desktop/mobile in light/dark themes, reduced motion and pausing in hidden tabs, 0 font requests before connection, starting UI resource preparation before connection completes with 0 metadata requests, app transition, recovery from stalls/failures, and deferred font loading on the management screen.
- Local verification of `mewlink/test/startup.browser.test.ts` on 2026-10-19 used a mock browser running the actual app bootstrap to confirm 1 launch for saved sessions, correction of invalid path hints, parallel key and resource preparation, index requests while awaiting authentication, 0 additional GET requests when authentication results are passed and the existing query when they are not, and index error guidance and same-identity verification during recovery. At the time, 65 related local tests, 6 central browser tests, 1 actual Workers/DO and native RTC P2P test, type checks on both sides, root lint, and documentation checks passed. Verification of 0 launches with the current WebSocket bootstrap follows the 2026-10-20 record at the start of this section.
- `src/utils/remote-connection.test.ts`: Authentication key preparation before negotiation, reuse in tickets, cancellation of unfinished requests on shutdown, and existing signature, clock skew, reconnection, and session handoff boundaries.

- `mewlink-identities.test.ts`·`users-cli-identity.test.ts`: v1→v2 migration, owner approval, falsified input, existing/new users, accounts without passwords, limits on requests and processing history, expiration, revocation, CLI roles/deletion, and email-based owner recovery.
- `remote-mewlink-auth.test.ts`: Access requests, owner approval, external login without a password session, local roles, revocation, reapproval, authentication transitions, blocking delayed requests, and preservation of password-change requirements through an actual in-memory HTTP/WS dispatcher. Transport identity and password-session verification for linking one's own account, temporary passwords, falsified targets, conflicts, duplicate requests, and revocation of previous access permissions.
- `mewlink-identity-ui.test.ts`: Login, access requests, entry after waiting, immediate approval/rejection/removal, connecting after logging in with one's own email, failure recovery, and both themes on desktop/mobile.
- Local `mewlink/test/identity.test.ts`·`login.browser.test.ts`: Signed identity, binding to a central session, one-time launches, forgery/expiration/logout, anonymous fallback, independence of saved local sessions, and return to the correct frame after login/logout.
- Local `mewlink/test/p2p.browser.test.ts`: with actual Workers/D1/DO, native RTC, and Chromium, signed identity → access request → owner approval → passwordless member → operation allowed → 401 after disconnection. Central operation requests, central cookies exposed to the app origin, and long-lived session header exposures: 0.

Project type checks and lint were run. The full `npm test` did not pass due to existing failures in per-account agent instruction expectations, the Git environment, DB, and UI, plus a Git panel test that did not terminate. The per-account agent instruction expectation failure was also confirmed in an isolated checkout of the same baseline commit. The authentication, approval, remote access, and UI checks above were verified through individual runs and are not described as a full test pass.

- `remote-local-auth.test.ts`: Anonymous UI and authentication boundaries, existing session resumption, temporary password changes, logout, account switching, blocking delayed requests from previous authentication, expiration/deletion/reset/permissions/IP failure limits, and regression checks for ordinary HTTP cookie authentication.
- `remote-trusted-device.test.ts`: Discarding the bearer before trust, binding key fingerprints, storing token hashes, resumption after process restart, expiration after 90 days of inactivity, extension through activity checks at most 1 time per day and immediate extension on resumption, external approval revocation/reapproval, account deletion, and blocking delayed trust requests. On 2026-10-19, all 29 tests in `node --experimental-strip-types --test server/remote-trusted-device.test.ts server/remote-local-auth.test.ts server/remote-mewlink-auth.test.ts server/auth.test.ts`, type checks, and lint for changed files passed.
- `remote-login-ui.test.ts`: Required login, incorrect passwords, temporary password changes, and saved temporary-session flows on desktop/mobile.
- `remote-access-inbox.test.ts`: FIFO handling of 1000 small messages while awaiting authentication, UTF-8 byte and item limits, and discarding unprocessed work after shutdown during processing or a failure.
- `remote-access-rtc-buffer.test.ts`: A normal pending return from native sending receives an acceptance ACK only once; an actual exception terminates the connection.
- `remote-access-rtc-lifetime.test.ts`: Confirms that prewarm→offer→forced GC→cleanup in an actual native child helper exits normally. Uses fixed synthetic SDP, an environment with only PATH, and a separate NAT substitute without changing the router. Reproduced SIGSEGV/SIGABRT under the original reference-release conditions to confirm the regression check's sensitivity.
- `remote-connection.test.ts`: Verifies parallel execution of the connection handshake and local key/offer preparation, blocking transmission before the challenge, cancellation of preparation during shutdown and error handling, acceptance of browser ticket/answer timestamps 1 and 2 seconds in the future using actual signed tokens, rejection of timestamps 3 seconds in the future with synchronization guidance, and rejection of expired tokens.
- `remote-access-rtc-state.test.ts`·`remote-connection.test.ts`: Natural recovery within 250ms in the browser and 15 seconds on the host, fixed deadlines, retaining the same transport, immediate termination conditions, updates on return, central request responses without timers and connection ID checks, waiting before authentication, and listener cleanup.
- `remote-access-socket-close.test.ts`·`remote-transport-callbacks-ui.test.ts`: Preserving other HTTP requests and sockets when messages arrive late during normal socket closure, local sending fails, app events throw exceptions, or closure occurs while reading a Blob; an invalid protocol terminates everything.
- `remote-forward-order.test.ts`: Preventing shutdown and cancellation from overtaking traffic under RTC backpressure, cancellation before admission, and discarding late credit after completion.
- Local `mewlink/test/signaling.test.ts`: DO hibernation, heartbeat, server renewal requests, unchanged leases before responses, backward compatibility, lease renewal, expiration-based revocation, and isolating the effects of tab closure during asynchronous authorization checks. Also verifies browser registry owner/Origin checks, revocation across multiple tabs with the same key, preservation of other browsers/hosts, and races involving pending and late trust registration.
- `server/remote-signaling-state.test.ts` and local `mewlink/test/signaling-performance.test.ts`: Verify SQLite initialization, restoration, monotonic merging of revocations, rollback on failure, removal of device/browser D1 queries from actual Workers/DO signaling while retaining session checks for external identities, hibernation restoration, preservation of revocations after management API D1 update failures, and blocking connections when the initial list query fails. These checks do not verify a 0.5-second initial connection or external-network performance.
- Local `mewlink/test/browser-consent.test.ts`: Rejects requests to `/api/auth/remote-device` and requests with a query in the installed app's bridge while preserving normal login/logout.
- Local `mewlink/test/p2p-stability.browser.test.ts`: On actual Workers/D1/DO, native RTC, and Chromium: resuming a saved local session without central login, 1000 normal WS messages, 40 downloads of 256KiB each, a 2MiB upload and cancellation, retaining the same UI after renewing the lease through central requests for at least 65 seconds with the browser's 20-second renewal timer stopped, subsequent transfers at mobile width, and blocking operations and discarding the device after a local password reset. Central operation requests: 0. This does not test device sleep or external mobile networks.
- Local `mewlink/test/recovery.browser.test.ts`: Preserving the existing iframe and unsaved input during recovery state transitions in the actual launcher, with 0 metadata requests.
- Local `mewlink/test/trusted-browser.browser.test.ts`: In Chromium with mocked central and RTC responses, verified non-extractable keys, reuse of the same host key, preservation of the same iframe and draft after replacing the transport with a new connection, 1 command execution, confinement of the new bearer to sessionStorage, blocking reactivation of the previous account after an empty session response on expiration, and token deletion and stopping retries on `access-revoked`. This does not test actual network switching or native RTC.
- `server/mewcat-assistant-reconnect-ui.test.ts` verifies restoration of read subscriptions for Mewpet conversations, conversation preservation, and prohibition of input retransmission. The removed DOM browser reconnection check was replaced with `server/login-desktop.test.ts` and `src/components/login-desktop-viewer.browser.test.ts` for login video. Port-specific origins, HTTP, WS, and actual Service Worker/P2P transport are verified in `server/port-preview-browser.test.ts`.
- `remote-transport-admission-ui.test.ts`: Uses actual Chromium and an in-memory HTTP/WS dispatcher to run 4 persistent app WS connections alongside 48 app/resource HTTP requests, verifying that all complete with no more than 16 in-flight operations on the actual channel, cancellation of queued HTTP/WS requests, and cleanup of unsent work on disconnection.
- `remote-response-window-ui.test.ts`: Actual browser transport and an in-memory HTTP dispatcher, with a simulated 100ms round trip for an 86,023B response: approximately 937ms with the previous method → approximately 110ms with the receive window; a limit of 8 unconsumed response chunks and compatibility with older servers. This does not guarantee actual external-network speed.
- `remote-access.test.ts`: Optional receive window validation, 8-chunk backpressure, older-client compatibility, allowed paths, frame sizes, signatures/expiration/targets, header spoofing, JSON/binary, existing WS context, and account revocation.
- Local `mewlink/test/worker.test.ts`: Atomic registration, management sessions, anonymous local-mode launches, origins, roles, reuse prevention, signed signaling, hibernation, separation of central logout from local use, and device disposal on actual Workers/D1/DO.
- Local `mewlink/test/oauth.test.ts`: state, PKCE (supported flows), nonce, JWKS, and host-only sessions using Google/GitHub/Apple/email OIDC response fixtures. Does not replace actual provider login.
- Local `mewlink/test/p2p.browser.test.ts`: HTTPS Workers central service + registered native A + actual Chromium; P2P HTML/CSS/JS/dynamic imports/images/workers and operation requests, public-address access without central cookies, incorrect/correct local passwords, blocking unauthenticated operations, no session-header exposure and no credential exposure even when intercepting JSON in the app realm, refresh, two tabs, and 0 central operation requests.
- `remote-ui.test.ts`: P2P access to the installed UI; blocking direct HTTP, secret files, traversal, and external symlinks.
- `remote-access-files.test.ts`: Reading/saving through the actual file API, read-only access, permission revocation, temporary-password blocking, and per-account working roots.
- `remote-access-browser.test.ts`: 1MiB downloads, POST, early 403, cancellation, native images, Range, large binary WS messages, and 0 central operation API requests.
- `remote-access-storage.test.ts` and shared storage tests: Isolation by account and A, origin cache budgets, and draft preservation.
- `remote-access-ui.test.ts`: Registration errors, registration completion, local authentication guidance, and desktop/mobile screens and interactions.

Automated browser verification was performed on the **same host**. A native DataChannel connection on the same PC between Windows Chrome and WSL2 mirrored was also verified. Actual OAuth/OIDC providers, different NATs, LTE/5G, Windows/WSL, macOS, phone sleep/network switching, concurrent use of actual terminals/agents/DBs/browsers/desktops, malicious content, load, key rotation/recovery, and security review remain part of the [release criteria in the work record](<../work/remote-access.md>). Local verification does not establish direct-connection success rates or production-service support.
