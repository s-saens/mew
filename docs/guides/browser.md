---
title: "Login Screen, localhost Apps, and Android"
description: "Explains the standalone login video screen; app access through /port-number on custom domains, Cloudflare Tunnel, Tailscale, and Mewlink; compatibility with standard SPA routes; per-branch port settings; opening in a new tab; Android environment checks; and gateway usage."
created: "2026-09-04"
updated: "2026-10-28"
---

## Login screen

Clicking **Open Login Page** for an agent displays the host Chrome login screen in that panel. The virtual screen's mouse and keyboard are isolated from the host's actual desktop. Closing the screen after login cleans up the browser, video, and virtual input while preserving completed CLI authentication. If disconnected, use **Reconnect** to return. On mobile, use the keyboard button for input.

Currently supported hosts are Linux/WSL. Chrome/Chromium, Xvfb, FFmpeg, Python 3, and libX11/libXtst are required. The Debian/Ubuntu packages are `xvfb ffmpeg python3 libx11-6 libxtst6`; install Chrome separately. Use `MEW_BROWSER_EXECUTABLE` to specify the executable's absolute path. Regular Chrome is preferred, and an existing Playwright Chromium installation is also checked as an alternative executable. In an unprepared environment, it does not control the actual host desktop as a substitute.

This screen is for login and account management. The general internal browser panel, address bar, shortcuts, and standalone `/browser` screen have been removed. Do not attach CDP or a DOM recorder to login pages. Detailed behavior and lifecycle follow [Login Virtual Screen](../../.mew/docs/development/login-desktop.md). Successful authentication with actual Google and Antigravity accounts must be verified in the user's environment.

## Open host localhost apps

If the app running on the host is at `localhost:3333`, append `/3333` to the current Mew URL.

| Mew access method | Example app entry URL |
| --- | --- |
| Custom domain | `https://mew.example/3333` |
| Tailscale IP | `http://100.x.y.z:5000/3333` |
| Mewlink | `https://mew.run/<user>/<device>/3333` |

If Mew is served on a different port, include that port too. For example, if you use Mew at `http://100.x.y.z:5000`, append `/3333`. The app's subpath and query are also forwarded.

In the dock's **Features** panel, click the branch's **Port Settings** to save the running app's port and subpath, then click **Open in New Tab**. Each worktree's app must already be running on a different port. The displayed status indicates port connectivity, not a successful check or completed user verification. Follow the [work branch verification steps](projects.md#기능-패널에서-작업-브랜치-확인).

If you connected a custom domain to Mew through Cloudflare Tunnel, open the app at a path on the same domain, such as `https://mew.example/3333`. The app must be running on port `3333` on the Mew host; you do not need to register the app port separately in the Tunnel. The Tunnel must also forward requests for that path and WebSocket requests to Mew.

Mew login and the **Access localhost Apps** permission are required. If you are not logged in, the login screen appears first, and you return to the app after logging in. Access is allowed by default for owner and manager; the owner grants the feature permission to other accounts. The app runs in the browser on the connecting device, with its execution area separated from Mew's login and administration screens. Logging out or revoking permission also stops open forwarding connections.

Direct access through a domain or Tailscale uses an HTTP/WebSocket proxy, so HTTP IP addresses are also supported. Mewlink requires the central `PREVIEW_DOMAIN` setting and wildcard HTTPS setup. If the app hardcodes a separate backend's `localhost` address, it may point to the connecting device, so configure it to use a same-port `/api` proxy or similar setup. Follow [localhost app preview](../../.mew/docs/development/port-preview.md) for configuration and compatibility limitations.

A typical SPA opens at its root and subpaths without a separate basename setting. Use a Mewlink URL for apps that depend on Next static chunks or the original browser URL. API-only ports may not have a `/` page, so open the frontend port that serves the web UI. Previews expire after 30 minutes; reopen the entry URL to continue using them.

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
