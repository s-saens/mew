---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: the mew browser relays per-account server Chromium screens. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0107 — the mew browser relays per-account server Chromium screens"
created: 2026-09-03
updated: 2026-09-11
---

- Date: 2026-09-03
- Status: Superseded by: 0108
- Supersession confirmed: 2026-09-11 — [0108](0108-mew-server-fetch-device-render-browser-proxy.md). JPEG screen relaying and the runtime used at that time were removed. Subsequent DOM relaying is governed by separate contracts in 0127 and 0129.
- Partially supersedes: [0057](0057-mew-localhost-browser-panel.md) — the loopback HTTP proxy for the Mew browser side panel. The loopback proxies for `/<port>` and the Android gateway remain
- Decision makers: Song Sanghun (request), Codex (design and implementation)

## Background

The sandbox iframe proxy in [ADR 0057](0057-mew-localhost-browser-panel.md) solved viewing WSL's `localhost` from remote devices, but it rewrites root-relative URLs by guessing.
It intentionally restricts cookies, same-origin behavior, and WebSocket, which breaks complex apps, and it cannot open public sites.
Users want to interact with **the results of actually accessing any HTTP(S) address from the server running Mew**,
from `localhost:3100` to Google, in Mew on their phones, and also open them in an independent popup separate from the existing
auxiliary window.

## Options

1. Expand the existing reverse proxy's allowed addresses and rewrite scope—this builds on the existing implementation, but requires imperfectly replicating
   the web platform's origin, cookie, CSP, and WebSocket semantics and increases the risk of external page code running under the Mew origin.
2. Relay the server's headless Chromium screen and input through CDP—this provides actual browser compatibility and origin isolation, but consumes
   server memory and screen bandwidth.
3. Transmit the entire X11 desktop through VNC/WebRTC—this is easy to extend to tools beyond the browser and to audio, but requires separate daemons, displays,
   encoders, and ports, with substantial operational complexity compared with a single Mew browser.

## Decision

Adopt option 2.

- The Mew server creates Chromium targets through the Chrome DevTools Protocol and relays only `Page.startScreencast` JPEG frames and validated mouse,
  touch, keyboard, and navigation commands through `/api/browser/ws`. Only HTTP(S) URLs are allowed.
- Runtimes and persistent profiles are isolated by signed-in account. The debug port is opened only on a random
  server loopback port, and WebSocket checks for a manager or owner session and a same-origin `Origin`.
- Chrome starts lazily when the first tab connects. Changed frames are sent as binary JPEGs with an 8-byte viewport header, at up to 10 fps as determined by the ack interval; frames are dropped for clients
  that consume them slowly. The process terminates after 10 minutes with no connected screens.
- Stable Chrome for Testing is optionally installed at `<MEW_DATA_DIR>/browser/runtime/` using `./mew browser install`. System Chromium and an absolute path in
  `MEW_BROWSER_EXECUTABLE` are also supported. Playwright and browser binaries are not included in npm dependencies
  or Mew's resident process.
- The tab list and active tab are stored in localStorage for the same Mew origin, and the server knows only opaque tab IDs. The auxiliary window's Detach
  button and direct entry from the header open an independent `/browser` popup and reattach to the same server tab ID.
- The current transport contract covers the screen, input, navigation, and JS dialogs. Audio and file uploads are not transmitted, and downloads are blocked
  to prevent unexpected accumulation on the server disk.
- The existing `server/browserProxy.ts` is retained only for `/<port>` full-page compatibility and the Android gateway. This route's loopback restrictions,
  header stripping, sandbox, and signed tokens continue to follow ADR 0057 unchanged.

## Rationale

The pixel boundary preserves external pages' origins while completely separating them from Mew's authentication origin. It offers better compatibility with the modern
web than rewriting HTTP responses, and the phone becomes a screen and input client rather than the source of URL requests. It can expose a smaller interface
tailored to Mew's tabs and permission model than VNC. Optional installation, lazy startup, frame limits, and idle shutdown bring Chromium's memory cost close
to 0 when it is not in use during operation.

## Results

- Target sites see the server's external IP and the characteristics of the server's Chromium. Sites that detect headless browsers may require CAPTCHA
  or additional authentication.
- Site logins and cookies persist in server profiles for each Mew account, but managers and owners can read other profiles through the shell, so this is not
  an OS security boundary between mutually untrusted users.
- Screen bandwidth and input latency are higher than with a local iframe. Adding audio, downloads, or uploads requires first defining lifecycle, capacity, and
  permission contracts for each, then extending or replacing this ADR.
