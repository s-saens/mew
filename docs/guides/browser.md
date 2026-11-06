---
title: "Login screens and the host browser"
description: "Explains localhost apps in new proxy tabs, the native Chrome video Browser panel and mobile input, managed browser preparation, the same Browser/login video component and account cookie profile, one Browser permission, and session lifetimes."
created: "2026-09-04"
updated: "2026-11-06"
---

## Login screen

Clicking **Open Login Page** for an agent displays the host Chrome login screen in that panel. The virtual screen's mouse and keyboard are isolated from the host's actual desktop. Closing the screen after login cleans up the browser, video, and virtual input while preserving completed CLI authentication. If disconnected, use **Reconnect** to return. On mobile, use the keyboard button for input.

Currently supported hosts are Linux/WSL. Ordinary Google Chrome, Xvfb, FFmpeg, Python 3, and libX11/libXtst are required. The Debian/Ubuntu packages are `xvfb ffmpeg python3 libx11-6 libxtst6`; Mew setup/update prepare Google Chrome inside Linux/WSL. If preparation is missing, run `npm run browsers:install` from the source checkout; use `npm run browsers:check` for a read-only check. The listed native-login packages remain separate prerequisites. Windows Chrome is not used. Set `MEW_CHROME_EXECUTABLE` to its absolute executable path if automatic discovery fails. Chrome for Testing and Playwright Chromium are not automatic substitutes. In an unprepared environment, Mew does not control the actual host desktop as a substitute.

Login screens and the Browser panel below use the same Chrome window, H.264/WebRTC video component, input, and per-account browser profile. Cookies saved while signing in are available when you return to the Browser, and browsing cookies are available to login screens. This profile belongs to the Mew browser; it is separate from the host user's personal Chrome profile and other Mew accounts. Do not attach CDP or a DOM recorder to login pages. Detailed behavior and lifecycle follow [Login Virtual Screen](../../.mew/docs/development/login-desktop.md). Successful authentication with actual Google and Antigravity accounts must be verified in the user's environment.

## Find running localhost apps

Choose **Menu → Localhost browser** to list ports currently listening on the Mew host. Click a port to open it in a new browser tab through Mew's host-app proxy. The list includes services started outside Mew's command buttons; use refresh to update it. A port labelled **Mew** is disabled, as are reserved ports marked unavailable. Each row shows the app name followed by its port number as a tag, such as **Along** `5173`. When there is no HTML page title, Mew uses the actual process name when available, for example **postgres** `5432` or **sshd** `22`. If neither can be read, the name is **(Unnamed)**. A process name identifies the listener owner; it does not prove what the service does. Long names are shortened to fit; hover over a name to read it. Refresh updates the list and its names. Pages whose title requires JavaScript or app login, HTTPS-only services, and processes hidden by OS permissions may lack a descriptive name. The list shows TCP listeners, so a non-web service may not open as a webpage.

If the list asks you to restart Mew with the latest code, the UI has loaded but the running server does not provide the port-list API. Apply the current server code with your normal server restart procedure, then retry the list. A UI build alone does not reload server routes.

The list itself starts no host browser or app. The **Access localhost Apps** permission controls this menu and app tabs. **Account Management → Feature Permissions → Browser** controls both the native Chrome Browser and login screens. It is independent of **Remote desktop** and **Access localhost Apps**. Owners and managers have browser access by default; members can receive an explicit grant. Guests and temporary-password accounts cannot use it. Agent/Git workflows still require their own permissions.

## Open host localhost apps

Click a `http://localhost:3333` link in a document, agent response, or terminal output, or click a command's port number. Mew opens a new tab at `{mewAddress}/3333`, preserving its path, query, and fragment. For example, a host link ending in `:3333/settings?mode=dev#panel` opens through `/3333/settings?mode=dev#panel`. The app must already be running; clicking its link does not start or restart it.

The app runs in your viewing-device browser through the existing authenticated sandbox proxy. This also avoids sending localhost app pixels through the internal Browser video stream. Existing URL rewriting, sandbox, HTTP loopback, and [Mewlink preview prerequisites](../../.mew/docs/development/port-preview.md#mewlink) still apply. HTTPS-only development services may need a compatible HTTP entry; the proxy's protocol was not changed.

## Browse with host Chrome

Choose **Browser** in the dock to open ordinary Google Chrome on a private virtual display. Use Chrome's own address bar, tabs, Back, Forward, and menus. Its real rendered screen reaches your device as encoded H.264 video over WebRTC, and input returns directly. This is not DOM reconstruction or periodic screenshots. It shares the account's browser-only profile with login screens and never takes over the host's actual desktop.

On a phone, tap to click and swipe to scroll. Tap a remote input field and then the keyboard button to type. When localhost app access is allowed, the panel's **Open ports** button returns to its picker. Use **Reconnect** after a connection error; it does not retry automatically. A brief disconnection retains the browser for up to 60 seconds. Explicit close cleans up the virtual screen and Chrome process while keeping the account's browser cookies and profile. Sessions expire after eight hours, and losing browser permission or logging out ends access. Opening another browser/login view takes over the same Chrome window; finishing an older login job cannot close a newer view.

The native Browser currently supports Linux/WSL and requires ordinary Google Chrome, Xvfb, FFmpeg with X11 capture and libx264, Python 3, libX11/libXtst, and Mew's existing native WebRTC dependency. `npm run browsers:check` checks browser executables; it does not establish the separate virtual-display and encoder prerequisites. Configure `MEW_CHROME_EXECUTABLE` if ordinary Chrome discovery fails. UI automation continues to use Playwright Chromium.

Direct WebRTC uses the existing remote desktop ICE/NAT settings. The video path works without WebCodecs or a secure-context requirement, including HTTP Tailscale addresses. A working Mew page alone does not prove that the peer-to-peer video route is reachable on another network. Mewlink must also admit `/api/browser-desktop/ws`; host and central updates are separate. A UI build does not reload a running server, so apply server changes with your normal restart procedure.

The [native browser contract](../../.mew/docs/development/browser-desktop.md) owns input, profile, authorization, and verification limits. The older DOM endpoint remains for compatibility; [its archived contract](../../.mew/docs/history/dom-browser-purpose-routing.md) is no longer the default Browser behavior. No implementation establishes that a particular provider login or CAPTCHA will succeed.
