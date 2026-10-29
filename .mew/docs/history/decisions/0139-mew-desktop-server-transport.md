---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Switch remote desktop to Mew server transport without external services. Preserves the choices, rationale, and subsequent changes from that time; see the Mew owning document for the current contract."
title: "0139 — Switch remote desktop to Mew server transport without external services"
created: 2026-09-14
updated: 2026-09-15
---

- Date: 2026-09-14
- Status: Adopted
- Follow-up decision: [0185](0185-mew-desktop-resident-direct-host.md) — direct transport without relaying, STUN, and Windows hardware H.264
- Follow-up decision: [0144](0144-mew-desktop-local-cursor.md) — cursor separation, video idle liveness checks, and ACK adaptation; retain VP8 and deployment boundaries
- Decision makers: User (required direct implementation and deployment without external services), Codex (design)
- Partially supersedes: [0136](0136-mew-native-remote-desktop-webrtc.md) — the prohibition on video WebSockets and dependence on TURN for external networks; retain screen, permission, input, and lifetime boundaries

## Decision

Try a direct WebRTC connection first, and if it fails or times out, relay VP8-compressed video and input over the authenticated WebSocket of the same Mew connection. Do not add a separate service, account, public port, or default STUN/TURN provider. Deployments using an existing HTTPS proxy continue to use that path. Removing the external proxy as well is a separate deployment change.

Separate OS capture/input, transport, and screen rendering. Release existing input during transitions and reuse the same capture stream. Direct connections and server transport must not own input simultaneously. The server only relays binary frames without decoding or re-encoding video. Limit latency and memory through rendering-completion ACKs, bounded in-flight frame and byte counts, skipping stale frames before encoding, and keyframe resynchronization. Retain the DOM transport contract for the regular browser feature and the prohibition on JPEG polling.

Use VP8 for both direct video and server transport. Use the codecs in existing Electron/Chromium and browsers; do not add GPL/AGPL media libraries, external codec services, or FFmpeg executables. Distributions preserve existing dependencies' licenses, notices, and applicable source availability requirements. Do not confuse software licenses with patent guarantees, and document the scope of review in the project documentation.

Apply the existing manager/owner, Origin, exclusive control, permission recheck, and parent lease requirements to every transport. Do not record input or video. The encryption boundary for server transport is the HTTPS/WSS endpoint. Include the TLS proxy and Mew server within the trust boundary. The OS continues to approve screen-sharing and accessibility permissions.

## Rationale

Even when Mew is externally accessible, WebRTC's separate UDP path may be blocked. Using the already reachable Mew connection enables connections without operating TURN. Accept the latency from TCP packet loss and server bandwidth costs, while controlling them through automatic direct connections and explicit buffer limits.

Official references: [WebCodecs](https://www.w3.org/TR/webcodecs/), [VP8 license](https://www.webmproject.org/license/software/), [additional patent grant](https://www.webmproject.org/license/additional/). Implementation and verification
belong in the [work plan](../../work/remote-desktop-server-transport.md) and [development contract](../../development/remote-desktop.md).
