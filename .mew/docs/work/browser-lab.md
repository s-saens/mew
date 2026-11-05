---
title: "Local manual browser comparison lab implementation"
description: "Records the November 5 implementation of six isolated manual browser comparison endpoints, WPE TLS preparation, and adapter verification. Separates adapter, viewer, build, Tailscale, process recovery, and mobile gesture checks from pending human challenge results."
created: "2026-11-05"
updated: "2026-11-05"
---

## Purpose and resulting behavior

The user requested six local comparison pages so they could inspect browser output and operate challenge pages themselves. The [lab contract](../development/browser-lab.md) owns the launch command, runtime keys, engine-to-port mapping, input path, and session lifecycle.

The implementation adds a standalone harness under `tools/browser-lab/`. Each engine opens lazily in an isolated session. Five viewers display actual browser PNG captures and relay user input; Lightpanda displays DOM text and explicitly disables coordinate input. Startup, navigation, and capture failures remain visible without engine fallback. The initial page is the ScrapingCourse Cloudflare challenge, with shortcuts for Mew and Google sign-in.

This experiment uses screenshot capture and browser input rather than Mew's rrweb DOM reconstruction. Direct localhost tabs are the intended comparison surface. The normal Mew DOM browser and production browser selection remain unchanged.

The user explicitly authorized the six test listeners on ports 5600 through 5605 and their owned browser children for this session. That authorization does not extend to existing Mew, application, or display servers. There was no deployment or Mew launcher operation as part of this work.

## WPE runtime preparation

The available Playwright WebKit 2370 bundle contains a genuine WPE build for Linux headless execution. A matching Playwright 1.64.0 module was unpacked outside the repository. Missing Ubuntu shared libraries were downloaded and extracted into the experiment's temporary runtime without installing system packages.

An initial HTTPS attempt failed with `TLS support is not available` before any HTTP response or challenge appeared. Inspection found that GnuTLS itself was installed, while GIO's `glib-networking` TLS module was absent. The isolated runtime was extended with `glib-networking`, its common and service packages, and `libproxy1v5`. Its wrapper supplies `GIO_EXTRA_MODULES` and `GIO_USE_TLS=gnutls`, alongside WPE's library and resource paths. Later ordinary HTTPS verification succeeded. The earlier setup error provides no evidence about Cloudflare compatibility.

## Verification recorded so far

| Check | Observed result | Scope |
| --- | --- | --- |
| Parent adapter test run | Seven passed; one WPE integration test skipped | Adapter checks; the skipped test was not counted as a browser success |
| Explicit WPE adapter integration run | Two passed | Missing-runtime error, persistent profile launch, actual fill and click, nonzero element bounds, valid PNG bytes, HTTPS 200 and `Example Domain` title, repeated close, disconnected browser |
| Native engine smoke checks | Three completed against `about:blank`; visual adapters produced PNG output | Moli, Obscura, and Lightpanda startup paths; Lightpanda retained its text-only capability declaration |
| WPE adapter lint | Passed | The WPE adapter and its test file |
| `npm run check:docs` | All 719 descriptions passed; link validation reported 42 errors in other documents | Neither new browser-lab document appeared in the error list; existing references to removed MOC and decision README paths remain outside this task |

The explicit WPE run enabled `MEW_LAB_WPE_TEST_EXECUTABLE` and `MEW_LAB_WPE_TEST_PLAYWRIGHT` to use the isolated wrapper and matching module. Its ordinary HTTPS target was `https://example.com`; no CAPTCHA interaction occurred in that check. The current example page has an `Example Domain` title without the older heading, so the test asserts the title rather than assuming that heading exists.

The final combined adapter, protocol, session, real Chrome viewer, and real WPE run passed all 26 tests with no skips. The WPE environment variables above enabled its integration check. Real viewer tests used intercepted synthetic HTTPS origins and a cross-origin checkbox, without CAPTCHA interaction. They verified screenshot coordinate input, ASCII and Korean committed text, Space activation, viewer reconnection with retained session state, desktop/mobile resizing, text-only output remaining visible after subsequent state updates, and rejection of foreign Host headers and invalid WebSocket tokens. Session regressions cover shared startup, transient capture recovery, failed resize state, and fresh-profile reset. Physical operating-system IME composition remains unverified.

`npx oxlint tools/browser-lab` passed. `npm run build` passed with the existing large-chunk advisory. The final documentation check again passed description validation and reported the same 42 unrelated missing-link failures. The new documents' relative links were inspected directly. The UI detector reported the intentionally hidden screenshot image without an initial source and Mew's inherited Inter font; these are intentional in this utility. A desktop/mobile screenshot review found the controls and remote image usable.

The six authorized listeners were started and their health responses checked. A passive viewer smoke run reached `Just a moment...` in all engines. Chrome, Headless Shell, Moli, Obscura, and WPE supplied real screenshots; Lightpanda supplied text only. In the sampled frames Chrome, Headless Shell, Moli, and WPE displayed a human checkbox; Obscura displayed the challenge shell without that checkbox. Those observations are not challenge-pass results, and the user has not yet completed the comparison. The owned lab process remains running for manual use; automated viewer clients and test-owned browser contexts were closed.

## Remaining limits and application boundary

Manual results for the full Cloudflare → Mew → Google flow are pending. The harness does not claim that any engine can solve or pass those sites, and test-owned input is not proof of a successful human challenge session. Screenshot polling also does not measure animation fidelity or interactive performance.

The experiment depends on external native binaries, their licenses, compatible Playwright versions, and host runtime libraries. Those binaries are not part of the repository change. Temporary session profiles are removed on reset and graceful lab shutdown; abruptly killing the process can leave cleanup incomplete.

The implementation does not select a replacement for Mew's current Chromium runtime. Any adoption requires a separate decision supported by the actual app and manual comparison results.

## Tailscale access follow-up

The user requested remote access to the six comparison viewers. The lab now accepts an explicit `viewerHosts` list while retaining loopback-only listeners, per-port WebSocket tokens, and rejection of unknown Host headers. The same host list prevents recursively opening a tailnet lab address inside an engine. The [lab contract](../development/browser-lab.md#connect-through-tailscale) owns configuration and proxy commands.

The six lab ports were not listening when this follow-up began, so the authorized comparison process was started again. Tailscale Serve TCP forwarders were added for ports 5600–5605. Existing Mew routes on 443, 5000, and 8282 were preserved. No Funnel was enabled. All six endpoints passed HTTP page/health and authenticated WebSocket checks through both the Tailscale IPv4 address and MagicDNS name. The complete lab test suite passed 29 tests, scoped oxlint and the repository build passed, and documentation checks again reported 41 pre-existing link failures after description validation passed. A real browser also displayed all six viewers through the Tailscale IPv4 address: five image surfaces and Lightpanda text. Another physical tailnet device remains outside this host-side verification.

## Process lifetime recovery

After the user reported that the links did not work, all six loopback ports refused connections. Tailscale's six forwarders remained configured, but the recorded lab PID no longer existed. The active agent belonged to a `mew-agent-*.scope` systemd control group. POSIX detachment does not leave that group, so the earlier detached launch did not provide a sufficient process-lifetime boundary. The exact termination event was not recorded; scope cleanup is consistent with the observed disappearance.

The authorized lab was started as a separate transient `mew-browser-lab.service` user service with `Restart=on-failure`. Its control group is under `app.slice`, outside the agent scope. Subsequent commands, after the launch command had exited, verified the same active service PID, zero restarts, and successful HTTP and authenticated WebSocket access through the Tailscale IPv4 address on all six ports. The canonical guide now describes this supervised launch and its shutdown boundary. No application code changed in this recovery; no new code tests or build were required. This does not claim verification from another physical tailnet device or persistence through a reboot.

## Mobile visibility and touch input

The user reported that the phone view devoted too much height to toolbars and engine notes, leaving the verification control below the visible image. The viewer had mouse-wheel input but no touch-scroll translation. Mobile controls now start collapsed, leaving a compact engine header and status row. The header provides a controls toggle, 100%/75%/50% view scale, and an explicit keyboard button. Touch swipes send remote wheel input, taps send clicks, and cancelled gestures send neither. Touch input does not automatically focus the hidden keyboard field.

The mobile regression uses an emulated 384×720 touch viewport and separate real Chrome processes for the viewer and a synthetic target. It checks more than 600 CSS pixels of page space, controls expansion, swipe scrolling without clicks, scaled tap coordinates, cancelled gestures, and explicit keyboard input. CDP's synthesized swipe suppresses immediate compatibility clicks in Chrome; a separate static-page reproduction confirmed that behavior, and the test allows its gesture cooldown before tapping toolbar controls. A CDP debugger breakpoint also confirmed that the suppressed tap reached the intended toolbar button. No real CAPTCHA was operated.

A separate real Moli synthetic-page check advanced `window.scrollY` from 0 to 400 using the adapter's wheel path. This verifies its input support without treating the challenge page as a test fixture. The full browser-lab suite passed all 34 tests with WPE integration enabled, and scoped oxlint and the required repository build passed. Tailscale live checks displayed Moli at phone size with controls collapsed and at 75% scale, and Chrome with the desktop toolbar. The authorized lab user service was restarted to load its cached viewer assets. Documentation description validation passed; global link validation still reported 42 unrelated failures. Physical phone keyboard and gesture behavior still require the user's check.
