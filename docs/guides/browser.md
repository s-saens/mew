---
title: "Login Screen, Browser, and Android"
description: "Explains Chromium for localhost apps, ordinary Google Chrome for external sites and login, host browser prerequisites and overrides, engine switching, DOM relay limits, port selection, theme matching, separate login video, legacy proxy URLs, and Android checks."
created: "2026-09-04"
updated: "2026-11-05"
---

## Login screen

Clicking **Open Login Page** for an agent displays the host Chrome login screen in that panel. The virtual screen's mouse and keyboard are isolated from the host's actual desktop. Closing the screen after login cleans up the browser, video, and virtual input while preserving completed CLI authentication. If disconnected, use **Reconnect** to return. On mobile, use the keyboard button for input.

Currently supported hosts are Linux/WSL. Ordinary Google Chrome, Xvfb, FFmpeg, Python 3, and libX11/libXtst are required. The Debian/Ubuntu packages are `xvfb ffmpeg python3 libx11-6 libxtst6`; install Google Chrome separately inside Linux/WSL. Windows Chrome is not used. Set `MEW_CHROME_EXECUTABLE` to its absolute executable path if automatic discovery fails. Chrome for Testing and Playwright Chromium are not automatic substitutes. In an unprepared environment, Mew does not control the actual host desktop as a substitute.

This video screen is for login and account management. The localhost DOM browser described below is a separate workspace panel. Do not attach CDP or a DOM recorder to login pages. Detailed behavior and lifecycle follow [Login Virtual Screen](../../.mew/docs/development/login-desktop.md). Successful authentication with actual Google and Antigravity accounts must be verified in the user's environment.

## Find running localhost apps

Choose **Menu → Localhost browser** to list ports currently listening on the Mew host. Click a port to open it in the internal browser. The list includes services started outside Mew's command buttons; use refresh to update it. A port labelled **Mew** is disabled, as are reserved ports marked unavailable. Each row shows the app name followed by its port number as a tag, such as **Along** `5173`. When there is no HTML page title, Mew uses the actual process name when available, for example **postgres** `5432` or **sshd** `22`. If neither can be read, the name is **(Unnamed)**. A process name identifies the listener owner; it does not prove what the service does. Long names are shortened to fit; hover over a name to read it. Refresh updates the list and its names. Pages whose title requires JavaScript or app login, HTTPS-only services, and processes hidden by OS permissions may lack a descriptive name. The list shows TCP listeners, so a non-web service may not open as a webpage.

If the list asks you to restart Mew with the latest code, the UI has loaded but the running server does not provide the port-list API. Apply the current server code with your normal server restart procedure, then retry the list. A UI build alone does not reload server routes.

The list itself starts no host browser or app. In an open page, choose **Open ports** in the toolbar to return to the list. This closes that page's temporary browser session and its stored login state. You can still enter a full URL in the address field. The same localhost-app permission controls this menu and the Browser dock.

## Open host localhost apps

Click a `http://localhost:3333` link in a document, agent response, or terminal output, or click a command's port number in the command menu. Mew opens the host app in its internal **Browser** panel. The command keeps running; clicking the port does not execute it again. You can also select **Browser** in the dock and enter a localhost address or an external website such as `https://example.com`. Paths, queries, and fragments are preserved.

The Browser toolbar provides Back, Forward, refresh, an address field, and close. Type and click in the app as usual; its JavaScript and network requests run in an isolated host browser. Localhost and loopback addresses use Chromium; external websites and LAN addresses use ordinary Google Chrome. External browsing still uses Playwright control and DOM relay, unlike the native login video screen. Only the resulting DOM and your input travel through Mew. The same flow works through direct access and Mewlink without a separate preview domain or wildcard DNS setup. Mewlink also needs its central launcher updated to admit the new DOM browser connection; updating only the host is insufficient with an older launcher.

The app must already be running. Localhost browsing and UI tests require Playwright's bundled Chromium or installed Chromium; set `MEW_CHROMIUM_EXECUTABLE` to an absolute path when needed. External browsing requires separately installed ordinary Google Chrome; set `MEW_CHROME_EXECUTABLE` when needed. Each purpose-specific override takes priority over the legacy `MEW_BROWSER_EXECUTABLE`, which affects both purposes. Remove old Obscura overrides; `MEW_DOM_BROWSER_EXECUTABLE` is no longer used. Mew login and **Access localhost Apps** permission are required; owner and manager have it by default. The browser accepts local and external HTTP(S) addresses. It blocks addresses containing login credentials and Mew's own port numbers, even on external hosts. Agent login screens continue to use the separate video display.

`localhost`, subdomains ending in `.localhost`, `127.x.x.x`, and IPv6 loopback addresses use Chromium. All other hosts use ordinary Chrome, including LAN addresses and hostnames that resolve to a local address. Mew chooses from the written URL without a DNS lookup. Address entry, page links, and redirects switch browsers when they cross this boundary. Cookies and local storage remain in memory separately for each browser during the session. Returning to a URL in the other browser reloads it; Back and Forward retain the URL sequence across browser switches.

Pages that support automatic dark/light mode follow Mew's theme. Changing Mew's theme updates the open page without reloading it. A site's own explicit theme setting may override its automatic appearance.

Closing the panel closes its isolated browser context and terminates its Chrome/Chromium process. If the connection closes or the session expires, use **Reconnect** or reopen the link. Reconnection starts a fresh context; app cookies and local storage are not kept across it. Logging out or losing permission closes the browser too.

DOM-based forms and SPA navigation are supported. Canvas/WebGL, nested frames, file uploads, native dialogs, media, and drag interactions may need a regular browser. See the [implementation and compatibility contract](../../.mew/docs/development/port-preview.md#internal-dom-browser) and [browser selection decision](../../.mew/docs/decisions/0137-browser-purpose-routing.md).

Existing `https://mew.example/3333`, `http://100.x.y.z:5000/3333`, and `https://mew.run/<user>/<device>/3333` addresses remain legacy proxy entries. Their URL rewriting and Mewlink preview-domain prerequisites still apply. These entries are separate from the internal DOM browser opened by links and port buttons.

## Android Panel

An auxiliary panel opened at the far right with the Android button in the header menu (`components/AndroidPanel.tsx`). Android Emulator and system images are not included in the mew distribution ([ADR 0058](../../.mew/docs/history/decisions/0058-mew-android-panel-optional-gateway.md)). The panel does only two things.

- It checks `/dev/kvm` on Linux and WSL and the Emulator's Hypervisor.Framework acceleration status on macOS, and shows whether the Android SDK tools (`sdkmanager`, `adb`, `emulator`, `avdmanager`), an API 36 system image, and an AVD exist. It selects an `arm64-v8a` image for Apple Silicon and an `x86_64` image for Intel/AMD. If the image is missing, it provides only the installation command, then provides the AVD creation command after a refresh.
- The \*\*▶\*\* next to the copy icon for a suggested command runs a server-defined command ID in a dedicated hidden tmux session (`mewcmd-*`). The adjacent terminal icon opens progress output and interactive input through `SessionTerminalPopup`. When the command finishes, it automatically terminates its own session through the same path as project one-shot command buttons. Arbitrary command strings sent by the browser are not executed.
- Enter the URL of an already running Android WebRTC/gateway to open it in an iframe through the existing loopback-compatible proxy.

Logged-in accounts with the Android feature permission can use it. The roles allowed by default are **manager and owner**. The status check API does not run the emulator, start processes, install anything, or download system images. Therefore, unless the Android panel is opened, the only overhead added to mew's default execution path is the panel code and API routes.

| Route | Role | Function |
| --- | --- | --- |
| `GET /api/android/status` | **manager·owner** | Checks Linux/WSL KVM or macOS acceleration, Android SDK, and AVD status for the host architecture. Does not run the emulator |
| `POST /api/android/commands/:id/run` | **manager·owner** | Runs an Android setup command from the server registry in a one-shot tmux session |
