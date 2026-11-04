---
title: "0135 — Obscura runtime for the host DOM browser"
description: "Superseded by ADR 0136. Replaces per-session headless Chrome/Chromium launches in the workspace DOM browser with isolated Obscura CDP instances (`obscura serve` + `obscura-worker`), Node-side redirect/cookie/WebSocket bridges, and per-session temporary storage cleanup."
created: "2026-11-04"
updated: "2026-11-04"
status: "superseded"
---

Superseded by [ADR 0136](0136-chromium-browser-restoration.md), which restores Chrome/Chromium for the internal browser and normal UI tests. The original decision below is retained as historical context.

## Context

The workspace **Browser** ([ADR 0103](0103-localhost-dom-browser.md), [ADR 0106](0106-dom-browser-external-sites.md)) launched a headless Chrome/Chromium process per `/api/dom-browser/ws` session, injected `@rrweb/record`, and relayed DOM snapshots, mutations, and input events to an inert client `iframe`. Although DOM replay avoided video encoding, each headless Chromium session still spawned 16 processes and consumed ~1.82 GB of RSS memory on Linux x64 while taking ~972 ms to deliver the first `rrweb` full snapshot.

The task requested replacing Chrome/Chromium in the internal DOM browser (`server/dom-browser.ts` and `server/browser-dom-executable.ts`) with Obscura while preserving the existing `rrweb` DOM relay, Mew port-blocking boundaries, SPA/document history navigation, WebSocket HMR forwarding, theme/scroll synchronization, and per-session storage isolation.

## Decision

1. **Executable discovery (`server/browser-dom-executable.ts`)**:
   - Resolve the host `obscura` binary via `MEW_DOM_BROWSER_EXECUTABLE`, `MEW_BROWSER_EXECUTABLE`, `PATH`, `~/.local/bin/obscura`, or `~/.local/share/obscura/<version>/obscura` (sorted newest-first).
   - Resolve symlinks (`fs.realpathSync`) and verify that the companion `obscura-worker` binary is executable in the same directory before accepting the binary.
2. **Per-session Obscura process and storage isolation (`server/dom-browser.ts`)**:
   - For each authenticated `DomBrowserSession`, create an ephemeral directory `mew-dom-obscura-*` under `os.tmpdir()` and spawn `obscura serve --host 127.0.0.1 --port 0 --allow-private-network --storage-dir <sessionDir>/storage --ready-file <sessionDir>/ready.json --quiet`.
   - Wait for `<sessionDir>/ready.json` and connect `playwright-core` via `chromium.connectOverCDP()`.
   - On session close, permission revocation, or server shutdown, close the CDP connection, terminate the `obscura` child process (`SIGTERM` with `SIGKILL` fallback), close bridged upstream WebSockets, and remove `<sessionDir>`.
3. **CDP and Web API bridges for Obscura compatibility**:
   - **Node HTTP fetch & redirect validation**: Because Obscura's CDP server handles `Fetch.requestPaused` synchronously per session (blocking nested `route.fetch()` or `Storage.getCookies` calls), `context.route('**/*', ...)` performs HTTP(S) requests in Node with `redirect: 'manual'`, validates every redirect hop against `domBrowserTarget()` and active Mew ports, maintains a per-session cookie jar, syncs redirected final document URLs into `history.replaceState` before `rrweb` records the snapshot, and fulfills requests via `route.fulfill()`.
   - **Node WebSocket relay**: Because Obscura's native `WebSocket` implementation stubs out frame delivery, `context.routeWebSocket('**/*', ...)` validates the target URL against `assertSubresource()` and bridges text/binary frames to an upstream Node `ws` `WebSocket` tied to the session lifecycle.
   - **Document/SPA history & element activation**: Track per-session history entries (`{ url, docId }`) so Back/Forward across SPA `pushState`/`replaceState` entries dispatches `popstate` in-place and cross-document Back/Forward/Reload navigates via `page.goto()`, avoiding CDP `Page.navigateToHistoryEntry` hangs under `context.route`. Perform element click activation via DOM `.click()` after focus/coordinate preparation so inline `<a>` elements and inline `onclick` handlers fire reliably.
4. **Scope separation**:
   - Keep `server/login-desktop.ts` on regular Chrome/Chromium (`loginDesktopExecutable()`) for agent OAuth virtual display video sessions.

## Alternatives and rationale

- **Retaining headless Chromium with extra flags**: Even with background networking and spare renderers disabled, Chromium's multi-process V8/Blink/compositor baseline remains above 1.5 GB RSS and ~16 processes per session.
- **Lightpanda or Servo**: Neither provides the combination of local Linux x64 binary installation already verified in this environment and the required `playwright-core` CDP + `rrweb` mutation recording compatibility.
- **Sharing a single long-lived Obscura daemon across DOM browser sessions**: Spawning `obscura serve` per session with `--port 0` and `--storage-dir <tempDir>` guarantees hard OS process and storage isolation per viewer session and guarantees complete teardown when the panel closes, while still starting in ~466 ms and ~146 MB RSS.

## Consequences

- Per-session process count drops from 16 processes to 1 process, startup-to-first-snapshot time drops from 972 ms to 466 ms (2.09× faster), and total RSS drops from ~1,821 MB to ~146 MB (-92.0%).
- Hosts using the internal DOM browser must have `obscura` and `obscura-worker` installed (or configured via `MEW_DOM_BROWSER_EXECUTABLE`).
- Canvas/WebGL-heavy apps, Service Workers, and complex CSS layout edge cases remain subject to Obscura's engine capabilities as documented in the [port preview contract](../development/port-preview.md) and [work record](../work/obscura-dom-browser.md).
