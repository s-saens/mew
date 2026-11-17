---
title: "Login screens and the host browser"
description: "Explains the shared host Chrome browser and login screens, permissions, connection prerequisites, extension isolation, session lifetimes, and the removal of Mew Port."
created: "2026-09-04"
updated: "2026-11-07"
---

## Login screen

Clicking **Open Login Page** for an agent displays the host Chrome login screen in that panel. The virtual screen's mouse and keyboard are isolated from the host's actual desktop. Closing the screen after login cleans up the browser, video, and virtual input while preserving completed CLI authentication. If disconnected, use **Reconnect** to return. On mobile, use the keyboard button for input.

Currently supported hosts are Linux/WSL. Ordinary Google Chrome, Xvfb, FFmpeg, Python 3, and libX11/libXtst are required. The Debian/Ubuntu packages are `xvfb ffmpeg python3 libx11-6 libxtst6`; Mew setup/update prepare Google Chrome inside Linux/WSL. If preparation is missing, run `npm run browsers:install` from the source checkout; use `npm run browsers:check` for a read-only check. The listed native-login packages remain separate prerequisites. Windows Chrome is not used. Set `MEW_CHROME_EXECUTABLE` to its absolute executable path if automatic discovery fails. Chrome for Testing and Playwright Chromium are not automatic substitutes. In an unprepared environment, Mew does not control the actual host desktop as a substitute.

Login screens and the Browser panel below use the same Chrome window, H.264/WebRTC video component, input, and per-account browser profile. Cookies saved while signing in are available when you return to the Browser, and browsing cookies are available to login screens. This profile belongs to the Mew browser; it is separate from the host user's personal Chrome profile and other Mew accounts. Do not attach CDP or a DOM recorder to login pages. Detailed behavior and lifecycle follow [Login Virtual Screen](../../.mew/docs/development/login-desktop.md). Successful authentication with actual Google and Antigravity accounts must be verified in the user's environment.

<a id="find-running-localhost-apps"></a>
<a id="open-host-localhost-apps"></a>

Mew Port and its port list have been removed. Browser and login access remain available with the **Browser** permission.

## Browse with host Chrome

Choose **Browser** in the dock to open ordinary Google Chrome on a private virtual display. Use Chrome's own address bar, tabs, Back, Forward, and menus. Its real rendered screen reaches your device as encoded H.264 video over WebRTC, and input returns directly. This is not DOM reconstruction or periodic screenshots. It shares the account's browser-only profile with login screens and never takes over the host's actual desktop.

On a phone, tap to click and swipe to scroll. Tap a remote input field and then the keyboard button to type. Use **Reconnect** after a connection error; it does not retry automatically. A brief disconnection retains the browser for up to 60 seconds. Explicit close cleans up the virtual screen and Chrome process while keeping the account's browser cookies and profile. Sessions expire after eight hours, and losing browser permission or logging out ends access. Opening another browser/login view takes over the same Chrome window; finishing an older login job cannot close a newer view.

The native Browser currently supports Linux/WSL and requires ordinary Google Chrome, Xvfb, FFmpeg with X11 capture and libx264, Python 3, libX11/libXtst, and Mew's existing native WebRTC dependency. `npm run browsers:check` checks browser executables; it does not establish the separate virtual-display and encoder prerequisites. Configure `MEW_CHROME_EXECUTABLE` if ordinary Chrome discovery fails. UI automation continues to use Playwright Chromium.

Direct WebRTC uses the shared ICE/NAT settings, including STUN candidate gathering on both host and viewer. Some networks still block direct connections because Mew does not provide a TURN relay. The video display is isolated from ordinary page-wide media extension scans; extensions that inspect shadow roots may still detect it. The video path works without WebCodecs or a secure-context requirement, including HTTP Tailscale addresses. A working Mew page alone does not prove that the peer-to-peer video route is reachable on another network. Mewlink must also admit `/api/browser-desktop/ws`; host and central updates are separate. A UI build does not reload a running server, so apply server changes with your normal restart procedure.

The [native browser contract](../../.mew/docs/development/browser-desktop.md) owns input, profile, authorization, and verification limits. The older DOM endpoint remains for compatibility; [its archived contract](../../.mew/docs/history/dom-browser-purpose-routing.md) is no longer the default Browser behavior. No implementation establishes that a particular provider login or CAPTCHA will succeed.
