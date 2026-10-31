---
title: "Restore DOM relay for localhost apps"
description: "Restores an authenticated internal DOM browser for localhost links and command ports, partially superseding decision 0023 while preserving independent login video and legacy proxy URLs. Records host execution, isolated replay, transport, limits, and alternatives."
created: "2026-10-31"
updated: "2026-10-31"
---

## Status

Accepted. Host build and application remain the user's responsibility. Partially supersedes [0023](0023-login-desktop-and-port-preview.md) for local-app entry and the removal of all DOM relay. The dedicated login video desktop and existing proxy routes remain.

## Context

Localhost app previews still depend on URL rewriting for direct access and a separate wildcard preview origin for Mewlink. These constraints can prevent ordinary apps from loading. The user requested restoration of the internal DOM browser and routing localhost links and command-port buttons into it.

## Decision

Run the local app in headless Chromium on the Mew host, preserving its native app URL, scripts, API requests, and HMR. Record DOM snapshots and changes with rrweb and replay them in an inert iframe. Send user input back to the host page using recorder node IDs. The Browser is one workspace dock panel, available on desktop and mobile, with address entry, navigation, refresh, close, and explicit reconnection.

Carry the stream over authenticated `/api/dom-browser/ws` using the existing direct/Mewlink WebSocket transport. Reuse the `portPreview` capability; do not add another capability or require the preview domain for this panel. Use an ephemeral, isolated context per viewer, recheck access, restrict documents to loopback HTTP(S), block Mew's ports, and dispose of owned resources on close or revocation. External app subresources may execute or load on the host. Replay does not execute the app's scripts or expose Mew transport credentials.

Keep agent authentication on the dedicated video login desktop. Keep existing `/port-number` proxy entries for compatibility, but stop opening them from localhost links and command ports. Detailed contracts belong in [localhost app access](../development/port-preview.md#internal-dom-browser) and [the feature specification](../features/browser-android-remote-desktop/server-browser-login-and-popups.md).

## Alternatives and rationale

- Extending proxy rewrites retains dependence on app syntax, browser URL behavior, and remote preview DNS. DOM relay preserves the host browser's execution environment.
- Video streaming supports canvas and native visual effects but changes interaction and bandwidth costs. DOM relay fits document-based local app interfaces and the explicit request.
- Restoring a general external-site and OAuth DOM browser broadens scope. Localhost navigation meets this request while preserving the separate login path.

## Consequences

The host needs Chrome/Chromium and incurs its CPU and memory cost. DOM replay does not guarantee canvas/WebGL, iframe, media, upload, drag, or native-dialog compatibility. Reconnection creates a fresh context and does not restore app cookies or storage. Host/local regression checks do not prove deployment, external-network Mewlink behavior, or compatibility with every app. Apply and validate the host change separately. Mewlink's central launcher imports the shared socket allowlist and must also be rebuilt and deployed for the new path; older launchers reject it. This feature needs no preview-origin DNS or Service Worker deployment.
