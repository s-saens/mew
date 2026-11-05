---
title: "Native Chrome browser desktop"
description: "Defines ordinary headed Chrome on a private Linux/WSL X11 display, bounded H.264 WebRTC video, native input, account profiles, authorization, and session lifetimes. Separates localhost app tabs, the existing login display, automation, and host/central rollout requirements."
created: "2026-11-05"
updated: "2026-11-05"
---

## Scope and entry points

Mew's Browser panel displays ordinary headed Google Chrome running on the host in a private Xvfb display. Chrome retains its native address bar, navigation controls, tabs, and page rendering. The panel receives encoded video and sends native input; it does not reconstruct the page DOM or poll PNG screenshots. The initial page is exactly `about:blank`.

Localhost app links and command-port actions open a separate viewer tab at `{mew-address}/{port}`, preserving the app path, query, and fragment. For example, `http://localhost:3333/settings?mode=dark#theme` becomes `https://mew.example/3333/settings?mode=dark#theme` or `https://mew.run/<user>/<device>/3333/settings?mode=dark#theme`. These tabs use the existing [port preview](port-preview.md) HTTP/WebSocket proxy, authentication, URL transformation, and origin/sandbox boundaries. App JavaScript executes on the viewing device. Port discovery remains read-only and does not start app servers.

The [login desktop](login-desktop.md) remains a separate agent-authentication display with its existing transport and lifetime. Browser desktop profiles do not share that login profile namespace. [Playwright UI automation](browser-testing.md) continues to use managed Chromium; this change does not move automation into the native Chrome panel. The earlier experimental [browser lab](browser-lab.md) is independent of this production panel.

| Owner | Responsibility |
| --- | --- |
| `server/browser-desktop.ts` | Authorized viewer attachment, native Chrome session, capture lifecycle, navigation, and reconnect grace |
| `server/browser-desktop-video.ts` | H.264 access-unit parsing, encoder arguments, negotiated sizing, and native WebRTC transport |
| `server/login-desktop.ts`, `server/login-desktop-x11.py` | Shared private X11 process lifecycle, window placement, clipboard, and XTest input |
| `shared/browser-desktop.ts` | Browser signaling path and validated commands |
| `src/components/BrowserDesktopPanel.tsx` | Panel, native video surface, reconnect, keyboard control, and port entry |
| `src/utils/browser-desktop-peer.ts`, `src/utils/browser-desktop-input.ts` | Viewer WebRTC, feedback, coordinates, touch, and keyboard input |
| `src/utils/local-browser-links.ts`, `src/utils/port-preview-url.ts` | Local app link capture and direct/Mewlink tab URLs |

## Video and native input

The media path is `Chrome → private X11 framebuffer → FFmpeg H.264 → paced WebRTC RTP → viewer video element`. Chrome runs without headless mode, Playwright, CDP, or a remote debugging port. Only this session's virtual display is captured; the host's ordinary desktop is not selected or shared.

FFmpeg uses local `x11grab` and CPU `libx264`, with the ultrafast preset, zero-latency tuning, baseline profile, YUV 4:2:0, two encoder threads, and no B frames or lookahead. Access-unit delimiters and repeated parameter headers support stream parsing and fresh decoder recovery. The requested ceiling is 60 FPS. The SDP offer permits up to 1080p at 60 FPS; the actual even dimensions preserve the panel aspect ratio within the viewer's negotiated H.264 limits. FPS and dimensions can be lower after negotiation. This path does not claim hardware encoding or a guaranteed frame rate.

FFmpeg stdout chunks are parsed into complete Annex B access units. A single access unit is limited to 4 MiB. The capture process pauses its stdout while the native RTP pacer drains pending units; its completion callback provides backpressure. The capture-side pending queue is bounded to 12 units and 8 MiB. Overflow requests recovery instead of accumulating an unbounded playback delay. The shared remote-desktop pacer retains bounded sending/pending frames, feedback-driven rate adaptation, and reference-order checks.

An RTCP keyframe request, queue overflow, or material bitrate change triggers a bounded, coalesced encoder restart. The new FFmpeg process emits a real IDR with parameter headers; the implementation does not relabel a dependent frame as a keyframe. Each new capture generation ignores callbacks from the replaced process. Resizing cancels scheduled recovery and invalidates already queued recovery, so an obsolete encoder cannot restore the old viewport.

Pointer motion uses the unordered, non-retransmitted `motion` data channel. Buttons, wheel, keys, paste, and input release use the reliable `control` channel. The host validates channel purpose and input shape, rechecks authorization, limits input frequency, and injects into the session's private X server through XTest. Viewer coordinates map through the actual contained video rectangle. The viewer supports touch scrolling and an explicit software-keyboard action. Lost focus, detach, and close release held input.

The viewer uses the browser's native WebRTC decoder in a `playsInline` video element. WebCodecs and its secure-context requirement are absent from this path, so ordinary HTTP access through a Tailscale address can display the stream. This does not guarantee that every phone, codec implementation, or network supports the required peer connection. Media and data-channel traffic use the direct WebRTC connection; the Mew signaling WebSocket does not carry video frames.

## Permissions, profiles, and lifecycle

`/api/browser-desktop/ws` requires a logged-in account with both current `portPreview` and `desktop` permissions, a permitted Origin or verified remote request context, and a completed password-change requirement. Authentication is checked on upgrade, before commands and outgoing state, through the socket access watcher, and by the heartbeat. Data-channel input uses the active viewer's authorization check. Logout or permission loss closes the owned runtime.

One Chrome session and one active viewer are allowed per account. Replaced viewers and their pending asynchronous/video callbacks cannot act on the new viewer. A new session waits for the previous Chrome process to finish saving and release the account profile before reopening it. A replacement viewer releases input and closes the previous viewer. Reconnection creates fresh ICE/DTLS state while retaining the existing Chrome process during a 60-second disconnect grace. A media/data-channel failure disconnects the viewer into that same grace instead of closing Chrome; this also handles channel closure arriving before the old WebSocket detaches. Healthy manual reconnect replaces only the viewer. Explicit panel close, expiry, permission loss, or grace expiry stops that session's capture, Chrome, input helper, and Xvfb, and removes its temporary runtime directory. The maximum session lifetime is eight hours.

The ordinary Chrome profile persists under `DATA_DIR/browser/profiles/<sha256(profile-key)>` with private directory permissions. The key is `browser-desktop:<account>`, distinct from the login display's account key and other accounts. Reopening the panel can therefore retain Chrome cookies and settings. Closing a session clears its temporary display/runtime state rather than deleting the persistent profile.

Mew-submitted navigation accepts credential-free HTTP(S) URLs and the exact initial `about:blank`. It rejects configured, registered listening, and reserved Mew ports. This validation is a navigation guard, not an OS network firewall: the user controls an ordinary Chrome window and can enter addresses through its native controls. Native browser access therefore requires the existing OS-level `desktop` capability as well as `portPreview`. Granting localhost app access alone does not authorize native Chrome or local-file access. The direct app-tab proxy retains its own port and origin boundaries.

## Runtime and connection prerequisites

The host implementation supports Linux and WSL. It requires ordinary Google Chrome selected through the [browser dependency contract](browser-dependencies.md), Xvfb, FFmpeg with `x11grab` and `libx264`, Python 3, libX11, libXtst, and the native remote-desktop package's `node-datachannel` runtime. Managed browser readiness alone does not prove these display and media prerequisites. macOS and native Windows support are not established by this implementation.

The browser desktop uses the existing remote-desktop ICE configuration from `desktopIceServers()` and automatic NAT setting from `desktopAutoNat()`. These inherit the supported STUN settings and `MEW_DESKTOP_AUTO_NAT` behavior in the [remote-desktop connectivity contract](remote-desktop-connectivity.md). Direct connectivity, UDP permissions, and network support remain necessary; TURN media relay is not introduced. The standalone video helper defaults automatic NAT to false unless its caller explicitly enables it.

## Application and verification boundaries

Applying the host route and WebSocket upgrade handler requires the user to restart Mew with the new server code. Rebuilding `dist/` alone does not replace in-memory server handlers. Mewlink must also run the updated `shared/remote-access.ts` signaling allowlist containing `/api/browser-desktop/ws`; an older central launcher can reject this socket even after the host update. Local app tabs retain the existing Mewlink preview-origin prerequisites. Repository agents must follow the [execution restrictions](getting-started.md#execution-and-verification) and must not perform those server or deployment operations.

Regression coverage belongs to `server/browser-desktop*.test.ts`, `src/components/browser-desktop-panel.browser.test.ts`, and the existing local-link/port-preview tests. The native video test can generate synthetic FFmpeg H.264 and exchange real RTP and input without capturing the user's desktop. Isolated native-browser checks do not establish deployed Mewlink operation, physical-phone behavior, external-network latency, provider login acceptance, or CAPTCHA completion. The [decision](../decisions/0146-native-browser-video-and-local-app-tabs.md) records the transport change and the limited supersession of the older DOM-browser purpose split.
