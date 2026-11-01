---
title: "Login Screen, Browser, and Android"
description: "Explains the internal DOM browser for localhost apps and external HTTP(S) websites, address entry, host Chromium prerequisites and limits, separate login video, retained proxy URLs, and Android environment checks and gateways."
created: "2026-09-04"
updated: "2026-11-01"
---

## Login screen

Clicking **Open Login Page** for an agent displays the host Chrome login screen in that panel. The virtual screen's mouse and keyboard are isolated from the host's actual desktop. Closing the screen after login cleans up the browser, video, and virtual input while preserving completed CLI authentication. If disconnected, use **Reconnect** to return. On mobile, use the keyboard button for input.

Currently supported hosts are Linux/WSL. Chrome/Chromium, Xvfb, FFmpeg, Python 3, and libX11/libXtst are required. The Debian/Ubuntu packages are `xvfb ffmpeg python3 libx11-6 libxtst6`; install Chrome separately. Use `MEW_BROWSER_EXECUTABLE` to specify the executable's absolute path. Regular Chrome is preferred, and an existing Playwright Chromium installation is also checked as an alternative executable. In an unprepared environment, it does not control the actual host desktop as a substitute.

This video screen is for login and account management. The localhost DOM browser described below is a separate workspace panel. Do not attach CDP or a DOM recorder to login pages. Detailed behavior and lifecycle follow [Login Virtual Screen](../../.mew/docs/development/login-desktop.md). Successful authentication with actual Google and Antigravity accounts must be verified in the user's environment.

## Open host localhost apps

Click a `http://localhost:3333` link in a document, agent response, or terminal output, or click a command's port number in the command menu. Mew opens the host app in its internal **Browser** panel. The command keeps running; clicking the port does not execute it again. You can also select **Browser** in the dock and enter a localhost address or an external website such as `https://example.com`. Paths, queries, and fragments are preserved.

The Browser toolbar provides Back, Forward, refresh, an address field, and close. Type and click in the app as usual; its JavaScript and network requests run in headless Chromium on the host. Only the resulting DOM and your input travel through Mew. The same flow works through direct access and Mewlink without a separate preview domain or wildcard DNS setup. Mewlink also needs its central launcher updated to admit the new DOM browser connection; updating only the host is insufficient with an older launcher.

The app must already be running, and Chrome/Chromium must be installed on the Mew host. Set `MEW_BROWSER_EXECUTABLE` to its absolute executable path if automatic detection fails. Mew login and **Access localhost Apps** permission are required; owner and manager have it by default. The browser accepts local and external HTTP(S) addresses. It blocks addresses containing login credentials and Mew's own port numbers, even on external hosts. Agent login screens continue to use the separate video display.

Closing the panel disposes of its isolated browser context. If the connection closes or the session expires, use **Reconnect** or reopen the link. Reconnection starts a fresh context; app cookies and local storage are not kept across it. Logging out or losing permission closes the browser too.

DOM-based forms and SPA navigation are supported. Canvas/WebGL, nested frames, file uploads, native dialogs, media, and drag interactions may need a regular browser. See the [implementation and compatibility contract](../../.mew/docs/development/port-preview.md#internal-dom-browser).

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
