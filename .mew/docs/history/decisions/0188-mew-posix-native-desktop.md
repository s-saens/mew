---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Switch Mac/Linux remote desktop to a resident native H.264 path as well. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0188 — Switch Mac/Linux remote desktop to a resident native H.264 path as well"
created: 2026-10-01
updated: 2026-10-01
---

- Date: 2026-10-01
- Status: Adopted
- Partially supersedes: [0185](0185-mew-desktop-resident-direct-host.md) — Retaining per-session Electron and VP8 on Mac/Linux
- Partially supersedes: [0148](0148-mew-macos-local-cursor.md) — CPU pixel copying, canvas, Electron transport, and the permission app on Mac
- Decision makers: User (requested Mac/Linux implementations with the same low-latency architecture as Windows), Codex (OS-specific design)

## Background

The user requested an architecture that eliminates renderer startup and raw screen IPC as on Windows, rather than improvements to OS compatibility. The current contract resides in [Remote desktop](../../development/remote-desktop.md).

## Decision

- All operating systems share a resident Node host tied to the server lifetime, per-connection session IDs, native H.264 WebRTC, and transfer of control after shutdown is confirmed. Retain the web viewer, direct encrypted transport, and rejection of TURN and server-side video relaying.
- On Mac, run using Node in a self-signed app bundle, and submit ScreenCaptureKit NV12 CVPixelBuffers directly to the VideoToolbox hardware H.264 encoder. Limit latency with RealTime, no B-frames, only the latest surface, and bounded compressed output. Check and request Screen Recording and Accessibility permissions from the same app bundle. Do not treat Electron permissions as approval for the new app.
- Linux uses a custom GStreamer C ABI module. On Wayland, obtain input approval, the screen, and the PipeWire FD from a single RemoteDesktop/ScreenCast portal session and bind them to the same lifetime. Use VA-API or NVENC hardware encoding and retain paths that support GPU memory negotiation. X11 uses native X11 capture, and screen readback and GPU upload may remain. Do not label the entire Linux path as zero-copy.
- Terminate with an error if a hardware encoder or OS capture permission is unavailable. Do not automatically fall back to a CPU encoder, Electron, or video relaying. Initially include the captured cursor in the video, and do not advertise unsupported separate cursor support.
- Do not start capture, encoding, user input, or sleep prevention while idle. Recheck the screen and permissions for every connection. Do not skip the portal approval UI or save approval tokens to disk. Notification failures do not affect the connection.
- The user performs production installation, builds, and server restarts. The software encoder used for verification exists only in a separately compiled test module. Do not claim that test sources prove hardware latency on actual devices.

## Rationale

[Apple low-latency VideoToolbox](https://developer.apple.com/videos/play/wwdc2021/10158/) provides low-latency hardware encoding and direct CVImageBuffer submission. [VA H.264](https://gstreamer.freedesktop.org/documentation/va/vah264enc.html) and [NVENC](https://gstreamer.freedesktop.org/documentation/nvcodec/nvh264enc.html) are native GPU encoding paths. The [RemoteDesktop portal](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.RemoteDesktop.html) supports combining screen and input within the same approval session. Verify actual memory formats, additional conversions, and performance on each device.
