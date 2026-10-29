---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Validate Codex login through DOM remoting from server Chromium. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0126 — Validate Codex login through DOM remoting from server Chromium"
created: 2026-09-09
updated: 2026-09-11
---

- Date: 2026-09-09
- Status: Adopted
- Follow-up decision: [0127](0127-mew-browser-server-dom-runtime.md) — Scope limited to Codex
- Follow-up decision: [0128](0128-mew-browser-oauth-uses-internal-browser.md) — Per-task temporary contexts for regular OAuth; restricted validation helper and validation limitations are preserved
- Partially supersedes: [0121](0121-mew-codex-oauth-through-scoped-server-browser.md) — Replaces fetching, rewriting, and iframe execution of Codex authentication pages with execution in server Chromium and DOM replay
- Partially supersedes: [0109](0109-mew-agent-authentication-and-loopback-browser.md) — Allows only the DOM remoting validation newly requested by the user under the prohibition on retrying remote browsers
- Decision makers: Song Sang-hoon (requested implementation of a DOM remoting validation version), Codex (design and implementation)

## Background

Cases were reported where the existing authentication proxy displayed the OpenAI login page but submission did not proceed.
Users want site execution, networking, and login state to reside in the server computer's browser,
while directly manipulating web elements inside Mew. Relaying pixels or screen video is explicitly prohibited.

## Options

1. Expand HTML rewriting — browser origin, storage, and page code still need to be emulated.
2. Server Chromium + DOM change and input relay — a real browser runs the site, and the device only replays the display.
3. Skia command relay — useful for visual reproduction, but requires engine modifications and a separate renderer, and does not preserve HTML elements on the device.

## Decision

Adopt option 2 as a pilot limited to Codex authentication. The general loopback Browser panel is outside this scope.

- Chromium runs the actual original URL on the server. The existing Codex CLI owns OAuth, PKCE, token exchange, and storage.
- Use rrweb's record/replay packages for DOM capture and incremental replay. Do not run site scripts in the replay document.
- Check Mew session authentication, manager and owner roles, and ownership of each login job. Accept connections only from the original Mew origin.
- Create a disposable browser context for each login job. Do not pass site cookies to the device or save input and DOM transcripts to disk or logs.
- Limit site requests to registered HTTPS hosts and the loopback callback origin specified by the CLI. Do not provide general-purpose fetch or arbitrary CDP command APIs.
- Page routing alone cannot block all requests after redirects, so also provide a connection relay dedicated to Chromium. Preserve the original TLS for HTTPS through CONNECT tunnels. Block QUIC and WebRTC UDP outside the proxy.
- Register `challenges.cloudflare.com`, observed at the public OpenAI login entry point, as an authentication resource host. Do not include functionality to bypass or automatically solve CAPTCHAs.
- Forward client requests for site resources through the server context. Do not send Mew session cookies to sites.
- Clean up browser contexts and in-memory state on close, expiration, or the end of the grace period for a disconnected connection. Show installation guidance if the runtime is unavailable.
- Do not automatically fall back to pixel, video, or canvas capture. Identify unsupported surfaces as support limitations.

## Rationale

Because the server browser handles clicks and authentication requests on the original page, the existing proxy has less need to reimplement the web execution environment.
However, DOM replay is not a complete remote browser. It does not promise full compatibility with cross-origin frames, canvas, OS authentication dialogs, or media.
Local tests verify the boundaries for original DOM input, server cookies, form submission, callbacks, permissions, and cleanup. Successful authentication with an actual OpenAI account requires separate real-world verification.

References: [rrweb guide](https://github.com/rrweb-io/rrweb/blob/main/guide.md), [Playwright BrowserContext](https://playwright.dev/docs/api/class-browsercontext).

## Results and validation scope

Local tests with real Chromium verified DOM input, checkboxes, submission using server cookies, callback navigation, and screen restoration after reconnecting. Accessing the public
OpenAI login entry point reached the Cloudflare verification step. The pilot does not support interacting with cross-origin security verification frames,
so this is not reported as a successful login with an actual OpenAI account. This limitation is neither hidden nor automatically replaced with pixel relaying.
