---
title: "Obscura host DOM browser migration"
description: "Records the 2026-11-04 switch of the workspace DOM browser from headless Chrome/Chromium to per-session Obscura CDP instances, including executable discovery, CDP/WebSocket/history compatibility bridges, passed integration tests, and measured startup/RSS benchmarks."
created: "2026-11-04"
updated: "2026-11-04"
---

## Purpose and resulting behavior

The workspace **Browser** (`server/dom-browser.ts` and `server/browser-dom-executable.ts`) now runs each session on an isolated host Obscura process (`obscura serve` + `obscura-worker`) instead of launching headless Chrome/Chromium:

- `server/browser-dom-executable.ts` discovers `obscura` through `MEW_DOM_BROWSER_EXECUTABLE`, `MEW_BROWSER_EXECUTABLE`, `PATH`, `~/.local/bin/obscura`, or `~/.local/share/obscura/<version>/obscura` (newest version first), resolves symlinks, and checks that `obscura-worker` is executable in the same directory.
- `server/dom-browser.ts` creates a per-session temporary directory (`mew-dom-obscura-*`), spawns `obscura serve --host 127.0.0.1 --port 0 --allow-private-network --storage-dir <tempDir>/storage --ready-file <tempDir>/ready.json --quiet`, and connects over CDP via `chromium.connectOverCDP()`.
- All HTTP(S) requests and redirects are fetched and validated in Node inside `context.route('**/*', ...)` with a per-session cookie jar and `domBrowserTarget()` / `assertSubresource()` checks, avoiding Obscura's single-threaded CDP deadlock during `Fetch.requestPaused` while preserving strict Mew port blocking across redirect hops.
- Upstream app WebSockets (such as Vite HMR) are bridged in `context.routeWebSocket('**/*', ...)` using Node's `ws` client and cleaned up on session teardown.
- Document and SPA (`pushState`/`replaceState`) history entries are tracked per session so Back, Forward, and Reload work across both full documents and SPA routes without hanging on CDP `Page.navigateToHistoryEntry`.
- Closing the WebSocket session, revoking permissions, or calling `closeDomBrowsers()` closes the CDP client, terminates the `obscura` child process, closes upstream WebSockets, and deletes the temporary storage directory.

The [port preview contract](../development/port-preview.md#internal-dom-browser) owns the runtime behavior and [ADR 0135](../decisions/0135-obscura-dom-browser.md) records the architectural decision.

## Resource and latency benchmark (Chromium vs Obscura)

Measured on the Linux x64 host (`1280×800` viewport, identical HTML/CSS/JS + WebSocket HMR fixture with `@rrweb/record` stylesheet/image/font inlining):

| Metric | Chromium (`chrome-linux64`) | Obscura (`v0.2.6`) | Delta |
| :--- | :--- | :--- | :--- |
| Process count per session | 16 processes | 1 process (`obscura` + worker threads) | **-93.8% processes** |
| Startup to first `rrweb` full snapshot | 972 ms | 466 ms | **2.09× faster (-506 ms)** |
| Idle total RSS memory | 1,820,596 KB (~1,820.6 MB) | 146,136 KB (~146.1 MB) | **-92.0% RSS (~12.5× lighter)** |
| Active input / scroll / HMR total RSS | 1,834,248 KB (~1,834.2 MB) | 139,756 KB (~139.8 MB) | **-92.4% RSS (~13.1× lighter)** |
| 10× input + scroll + HMR batch latency | 235 ms | 240 ms | Equivalent interactive latency |
| Remaining processes / temp dirs after `close()` | 0 | 0 | Clean teardown verified |

## Verification

- `node --test server/browser-dom-executable.test.ts` passed (1/1): verified `PATH`, `~/.local/bin/obscura` symlink resolution, versioned `~/.local/share/obscura/<version>/obscura` discovery, companion `obscura-worker` validation, and `MEW_DOM_BROWSER_EXECUTABLE` / `MEW_BROWSER_EXECUTABLE` overrides.
- `node --test server/dom-browser.test.ts` passed (10/10):
  - Mew listener port registration and dynamic blocking when a new Mew server starts listening after a browser session is open.
  - URL scheme, credential, and Mew port validation.
  - External HTTP hostname navigation, link clicks, 302 redirects, and Back/Forward history without internet access.
  - Instant host scroll application, per-node `scrollRevision` echo, and revision reset after document or SPA history navigation.
  - WebSocket authentication, capability, and Origin enforcement.
  - Native SPA paths (`pushState`), JS execution, text/select/checkbox input, scroll, history, WebSocket HMR updates, SVG/CSS asset inlining, and redirect blocking to Mew's port.
  - Document generation increments on reload/navigation, fresh inlined asset snapshots, and rejection of stale DOM node IDs from prior generations.
  - Per-session cookie and `localStorage` isolation across concurrent sessions and removal of `mew-dom-obscura-*` temporary directories on close.
- Migrated `server/dom-browser-flow.browser.test.ts`, `src/components/dom-browser-entry.browser.test.ts`, `src/components/dom-browser-panel.browser.test.ts`, and `src/components/dom-browser-ports.browser.test.ts` to use `connectTestBrowser()` for their outer UI viewer browser and fixed the missing `prepareEditorPane` mock export in `src/components/dom-browser-entry.browser.test.ts`. Running those 4 UI viewer tests requires the user-managed external Obscura UI test service on `ws://127.0.0.1:9222` ([browser-testing.md](../development/browser-testing.md)).
- `npm run build`, `npx tsc -b`, `npm run lint`, and `npm run check:docs` passed.
