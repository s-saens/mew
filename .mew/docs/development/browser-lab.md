---
title: "Local manual browser comparison lab"
description: "Defines the six loopback browser lab endpoints, external runtime configuration, optional Tailscale access, supervised execution, pixel and input relay, isolated session lifecycle, and manual challenge workflow. Covers mobile controls and touch scrolling, Lightpanda's text-only boundary, WPE TLS prerequisites, and direct-tab use."
created: "2026-11-05"
updated: "2026-11-05"
---

The standalone lab lets a person compare six browser engines through local or explicitly configured tailnet browser tabs. Its source is in [tools/browser-lab](../../../tools/browser-lab/run.mjs). It runs separately from Mew and does not change Mew's [DOM browser](port-preview.md#internal-dom-browser), [browser dependencies](browser-dependencies.md), or [normal UI testing](browser-testing.md).

## Start and open the lab

Starting or stopping these test listeners requires an explicit user request under the repository's [execution rules](getting-started.md#execution-and-verification). The November 5 experiment authorized only the six lab listeners and their owned browser processes. Existing Mew, application, and display servers remain outside that authorization.

Prepare a runtime JSON file containing absolute local paths, then run from the repository root:

```bash
node tools/browser-lab/run.mjs --config /absolute/path/runtime.json --detach --runtime-dir /tmp/mew-browser-manual-lab
```

Without `--detach`, the process stays in the terminal. `--runtime-dir` defaults to `/tmp/mew-browser-manual-lab`; it holds the lab PID and detached `server.log`. The detached command checks all six health endpoints before reporting readiness. A busy port causes an error; the lab does not stop its existing owner.

### Keep the lab outside the agent scope

`--detach` creates a separate process session, but it does not escape an agent's systemd control group. If that scope is removed when the agent finishes, its lab process can also disappear while Tailscale forwarders remain configured. For an authorized lab that must remain available after the agent turn, use a separate user service on hosts with a running systemd user manager:

```bash
systemd-run --user --unit=mew-browser-lab --collect \
  --property=WorkingDirectory=/absolute/path/mew \
  --property=Restart=on-failure --property=RestartSec=2s \
  -- /absolute/path/node /absolute/path/mew/tools/browser-lab/run.mjs \
  --config /absolute/path/runtime.json --runtime-dir /tmp/mew-browser-manual-lab
```

Run the lab in the foreground inside this service: omit `--detach`. Its process and owned browser children belong to the service's control group rather than the agent scope. Check `systemctl --user status mew-browser-lab.service` and use `journalctl --user -u mew-browser-lab.service` for service output. After an authorized shutdown request, stop this unit with `systemctl --user stop mew-browser-lab.service`; leave other Mew services untouched. A transient unit is not a boot-time installation and still depends on its runtime files and user manager remaining available.

Open these addresses directly in tabs on the host:

| Address | Engine |
| --- | --- |
| `http://localhost:5600/` | Google Chrome |
| `http://localhost:5601/` | Chrome Headless Shell |
| `http://localhost:5602/` | Moli |
| `http://localhost:5603/` | Obscura |
| `http://localhost:5604/` | Lightpanda |
| `http://localhost:5605/` | WPE WebKit |

Each page starts at `https://www.scrapingcourse.com/cloudflare-challenge`. Use `--initial-url <HTTP(S) URL>` to choose another initial page. Toolbar shortcuts open that initial page, `http://127.0.0.1:5000/` for Mew, or Google's sign-in page. The address field accepts a user-chosen HTTP(S) URL without embedded credentials. Lab addresses are rejected as navigation targets to avoid opening the comparison UI inside itself.

The person using the lab solves any challenge manually. The harness does not select CAPTCHA answers or automatically interact with a challenge. A failed engine remains an error in its own tab; the lab never substitutes another browser.

## Connect through Tailscale

After an explicit request for remote access, add this host's Tailscale IPv4 address and MagicDNS names to the runtime JSON's `viewerHosts` array. Entries are exact hostnames without a scheme, path, or port. Other Host headers remain rejected, and the HTTP listeners still bind only to loopback. Restart only the authorized lab process to load the updated configuration.

```json
{
  "viewerHosts": ["100.64.0.7", "lab.example.ts.net", "lab"]
}
```

With the lab running, configure one tailnet-only TCP forwarder per HTTP port:

```bash
for port in 5600 5601 5602 5603 5604 5605; do
  tailscale serve --bg --tcp="$port" "tcp://127.0.0.1:$port"
done
```

Open `http://<host-tailscale-ip>:5600/` through `:5605/` from a device on the same tailnet with access permitted by its policy. MagicDNS names also work when included in `viewerHosts`. Engine links preserve the hostname; the WebSocket uses the same origin and token. Verify both `/health` and the viewer connection through the Tailscale address. A host-side check does not prove another device's ACL or DNS configuration.

These are Tailscale Serve endpoints, not public Funnel endpoints. They expose the shared comparison sessions to permitted tailnet clients without adding a separate lab account system. Preserve existing Serve routes. To remove only these forwarders after authorization, run `tailscale serve --tcp=<port> off` for each lab port; do not reset the machine's entire Serve configuration.

## Runtime prerequisites

The repository does not vendor the browser binaries or install system packages through this tool. Supply executable paths and a matching Playwright module where required:

```json
{
  "chrome": "/absolute/path/google-chrome",
  "shell": "/absolute/path/chrome-headless-shell",
  "moli": "/absolute/path/moli",
  "obscura": "/absolute/path/obscura",
  "lightpanda": "/absolute/path/lightpanda",
  "wpeExecutable": "/absolute/path/wpe-launch.sh",
  "wpePlaywright": "/absolute/path/playwright-core/index.mjs",
  "playwrightPath": "/absolute/path/playwright-core/index.mjs"
}
```

`playwrightPath` is optional and selects the Playwright client for the native Moli, Obscura, and Lightpanda CDP adapters. They otherwise use the repository's `playwright-core`. `wpePlaywright` is required and must identify an importable module file compatible with the selected WPE build. `wpeExecutable` can be a runtime wrapper that configures libraries before executing the Playwright-patched WPE MiniBrowser. Stock WPE builds are not assumed to implement Playwright's inspector pipe.

On Linux, WPE's shared libraries and GIO TLS backend must both be available. Resolving `ldd` dependencies alone does not establish HTTPS readiness: GIO loads its TLS backend dynamically. An isolated wrapper can add extracted libraries to `LD_LIBRARY_PATH`, point `GIO_EXTRA_MODULES` at its `gio/modules` directory, and select the installed `gnutls` backend with `GIO_USE_TLS=gnutls`. The runtime also needs the WPE executable, injected bundle, and inspector resource paths expected by its distribution. Keep downloaded packages and extracted runtime files outside the repository. A `TLS support is not available` error is a runtime prerequisite failure, not a website rejection.

## Display and input

Chrome, Headless Shell, Moli, Obscura, and WPE supply actual PNG screenshots. The viewer displays those pixels and forwards trusted local pointer, wheel, keyboard, pasted text, and IME composition events through the engine's input APIs. It scales coordinates to the captured viewport. This path does not reconstruct the target page with rrweb. Capture updates are periodic and are not a video or performance benchmark.

Use direct localhost tabs for pointer checks. Opening the lab inside Mew's DOM replay adds another reconstruction and coordinate boundary; that nested arrangement is not a reliable input comparison.

At viewport widths of 760 CSS pixels or less, the viewer starts with the engine navigation, address toolbar, shortcuts, engine notes, and footer collapsed. Use **도구** to show them and **닫기** to restore page space. The header keeps the active engine visible. Its percentage button cycles 100%, 75%, and 50%: smaller percentages request a larger remote viewport and scale its image down, so more page content fits without changing the target site's CSS. Resizing retains the existing maximum remote dimensions.

On touch devices, tap the image to click, or swipe it to scroll the remote page. Swipes and cancelled gestures do not dispatch clicks. Coordinate mapping applies the captured image scale, including zoomed-out views. A touch tap does not automatically open the local keyboard: tap the remote text field, then the header keyboard button to enter text. Mouse and hardware-keyboard input retain their existing path. Lightpanda remains text-only and does not accept these coordinate gestures.

Lightpanda is deliberately text-only in this lab. It exposes page DOM text, navigation, and status, but supplies no actual GUI capture or coordinate input here. A text result does not establish visual layout or CAPTCHA usability. Moli and Obscura use independent rendering implementations; their displayed pixels and input behavior may differ from Chromium.

The toolbar provides Back, Forward, Reload, and Session reset. Click the captured page to send input; Shift+Esc returns focus to the local address field. Session reset closes the engine, removes its temporary profile, and opens the current address in a fresh session, clearing login and page state.

## Ownership and access

Each engine has one session shared by its connected viewers. Its browser starts lazily on the first viewer connection. Profiles and native CDP listeners belong only to that engine; native adapters choose separate ephemeral loopback ports. Closing a viewer pauses capture when no viewers remain, while retaining the browser session until reset or lab shutdown.

Lab HTTP listeners bind to `127.0.0.1`, validate the request Host against loopback names, explicitly configured viewer hosts, and the actual port, and require a random per-listener token for the session WebSocket. Runtime state and profiles stay local. The lab does not log input values or cookies, and native startup output is bounded and discarded after connection.

For an authorized shutdown, identify the owned lab PID from its runtime directory and confirm it against `/health`; send that process SIGTERM, or use Ctrl+C for a foreground run. Shutdown closes the six listeners, their browser processes, and temporary profiles. It does not stop Mew or any application being browsed. A forced process kill can bypass graceful profile cleanup.

The [work record](../work/browser-lab.md) separates adapter checks, live browser checks, and remaining integration verification.

## Verify the harness

Run `node --test tools/browser-lab/*.test.mjs` and `npx oxlint tools/browser-lab`. The real viewer integration requires Chrome at `/usr/bin/google-chrome`; the WPE integration is opt-in through `MEW_LAB_WPE_TEST_EXECUTABLE` and `MEW_LAB_WPE_TEST_PLAYWRIGHT`. Without these paths its test is skipped, which is not a successful WPE check. Tests use synthetic intercepted pages for input checks and do not operate a real CAPTCHA. Run the repository's required `npm run build` and documentation checks after changes.
