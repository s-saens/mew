---
title: "Hotview voice recording and browser microphone policy"
description: "Accepts browser-native recording for Hotview voice insertion, same-origin microphone permission on the direct host, and source-origin delegation through Mewlink frames. Records browser consent, format compatibility, and separate host and central application limits."
created: "2026-11-04"
updated: "2026-11-04"
status: "Accepted"
---

# Hotview voice recording and browser microphone policy

## Context

Hotview needs to record audio from the editing browser and insert the saved audio into Markdown. The direct host previously blocked microphone use through `Permissions-Policy: microphone=()`. Mewlink loads the installed UI through nested frames, including a cross-origin app launcher, so each embedding boundary must delegate microphone permission.

## Decision

Use the browser's `getUserMedia` and `MediaRecorder` APIs for audio-only recording. Keep recording and permission requests in the editor's explicit voice action. Save the resulting audio through the existing document upload contract and insert a Markdown audio reference. Supported recording containers follow the browser's available recorder types.

Set the direct host's microphone policy to `(self)`. Preserve denial of camera, geolocation, and payment. Delegate `microphone 'src'` through both Mewlink connection-frame creation paths and the app launcher's installed-UI frame. The configured frame source determines the allowed origin; no wildcard delegation is needed.

Current recording behavior belongs to the [Markdown editor contract](../features/document-code-media-editing/markdown-hotview-source-and-properties.md); frame and rollout requirements belong to the [remote access contract](../development/remote-access.md#microphone-permission).

## Alternatives and rationale

Retaining microphone denial makes direct recording unavailable even after browser consent. A wildcard policy grants broader origin access than this feature needs. Recording on the server captures the host's microphone rather than the editing device and adds a separate capture pipeline. Browser-native recording uses the user's device and existing browser consent without a new server recorder or transcoding dependency.

## Consequences

Browser consent and a secure context remain necessary. Recorder and playback format support vary by browser. The policy enables access; it does not grant permission or override file-edit authorization.

The direct header requires a user-managed host restart. The excluded Mewlink source requires its own central frontend rollout, independent of the host build. Local automated checks do not establish live-service application or physical-device audio quality.
