---
title: "Virtual Login Desktop"
description: "Defines the X server, standard Chrome, video WebSocket, XTest input, account profiles, permissions, process lifetimes, and readiness requirements for the Linux/WSL-only OAuth and account management screen. Distinguishes the boundaries of a regular DOM browser and verification of actual account authentication."
created: "2026-10-20"
updated: "2026-10-20"
---

## Execution and Support Scope

`server/login-desktop.ts` owns a virtual desktop for each login job. After receiving the panel's initial size, it starts dedicated Xvfb, a Python X11 window manager and input handling, Chrome, and FFmpeg. Sites run in host Chrome, and only JPEG video frames and OS input connect to the panel. CDP, Playwright execution, DOM recorders, and players are not used. Playwright is used only to find an alternate location for the browser executable.

The virtual framebuffer is at most 3840×2160, and the Chrome window and video crop match the panel's display area. Resizing reconfigures the window and capture while preserving the same browser, page, and input values. The page viewport and video dimensions fit the panel, but the `screen.width/height` read by sites reflects the virtual framebuffer dimensions. The minimum is 320×240 and the maximum is 3840×2160, with video dimensions adjusted to even numbers.

Linux/WSL requires Chrome or Chromium, Xvfb, FFmpeg with X11 capture and an MJPEG encoder, Python 3, and libX11 and libXtst. An installed regular Chrome takes priority; otherwise, it looks for Playwright's installed Chromium. `MEW_BROWSER_EXECUTABLE` can specify the executable's absolute path. Display preparation failures do not fall back to the actual desktop or headless mode. macOS and native Windows return a preparation error.

`server/login-desktop-x11.py` handles focus, popups, clipboard, keys, and buttons on a separate X server. It does not connect to input, clipboard, or portals on the actual host desktop. Browser CPU/GPU usage is not isolated. It does not attach personal Chrome profiles and maintains `DATA_DIR/browser/profiles/<account-hash>` per account. Currently, each account uses one login screen at a time.

## APIs and Permissions

| Route | Behavior |
| --- | --- |
| `POST /api/login-desktop` | Opens a registered provider's HTTPS login or account management URL with `agent` permission. Returns `{id, job, url, streamUrl}` |
| `DELETE /api/login-desktop/:id` | Closes the user's own login screen and cleans up child processes and the virtual desktop |
| `WS /api/login-desktop/ws?session=<id>` | Receives video and sends pointer, button, wheel, key, and paste input after the initial resize |
| `POST /api/agent-runtimes/:id/auth/:method/browser` | Validates a registered URL in the output of a running official CLI and creates a login screen |
| `POST /api/git/github-auth/:id/browser` | Creates a fixed device login screen for the current GitHub connection job |

Checks login, account ownership, temporary passwords, Origin, and purpose-specific feature permissions. Agents use `agent` permission; GitHub connections use `git` or `filesWrite` permission. Checks are repeated when receiving input and while maintaining connections. No general URL navigation API or browser tab list is provided.

## Lifetime and Input

Original URLs, video, input, pasted content, and authentication codes are not saved in logs or transcripts. Provider cookies in profiles and official CLI credentials have separate lifetimes. Completed CLI logins persist after the panel closes. Existing job paths that detect authentication completion, failure, or interruption also clean up the corresponding login screen.

The maximum lifetime is 20 minutes. Temporary disconnections allow 60 seconds to reconnect; explicit closure triggers immediate cleanup. Keys and mouse buttons are released on blur, connection replacement, and shutdown. Video is limited to JPEG frames at 12 FPS, retaining only one frame in transit and the latest frame. The next frame is sent after the viewer acknowledges image decoding completion; if no ACK arrives for 5 seconds, the video connection closes and the reconnection grace period applies. Limits are 2 MiB per frame, 32 KiB per input, 500 inputs per second, and 4096 characters per paste.

Requests graceful shutdown of the last browser window, waits for the profile to be saved, and sends termination signals only to unresponsive child processes it owns. Cancellation while the virtual desktop, input, or video is starting also cleans up the profile lease and temporary Xauthority.

## Verification Boundaries

`server/login-desktop.test.ts` tests video, input, popups, Korean text pasting, reconnection, permission revocation, and cancellation during startup using isolated Xvfb, a new test profile, real Chrome, and FFmpeg. Account UI and login viewer tests verify video connection and closure without DOM replay. These tests do not cover actual Google or Antigravity login, passkeys, physical security keys, or performance while gaming concurrently.
