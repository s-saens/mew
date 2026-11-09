---
title: "Remove Mew Port"
description: "Removes Mew Port routing, preview permissions, listener discovery and shutdown, and command-port controls while retaining the host Browser and ordinary Mewlink transport. Records compatibility and historical decisions."
created: "2026-11-09"
updated: "2026-11-09"
---

## Status

Accepted. Supersedes the Mew Port portions of [ADR 0023](0023-login-desktop-and-port-preview.md), [ADR 0076](0076-command-port-previews.md), [ADR 0078](0078-port-preview-module-initialization.md), [ADR 0083](0083-direct-preview-spa-routing.md), [ADR 0108](0108-localhost-browser-port-picker.md), [ADR 0123](0123-localhost-port-page-titles.md), [ADR 0124](0124-localhost-port-service-labels.md), [ADR 0146](0146-native-browser-video-and-local-app-tabs.md), and [ADR 0155](0155-port-listener-shutdown.md). Their other decisions and history remain.

## Context

Mew Port exposed host localhost apps through rewritten direct previews or a separate-origin Mewlink bridge. The user requested removing the feature after compatibility and performance concerns. Browser-only Mewlink continues to connect the workspace over its existing direct transport.

## Decision

Remove numeric port proxy entries, preview capability and permission, port discovery and listener shutdown, command-port buttons, and automatic interception of localhost links. Keep the host Browser and login screens under their existing independent permission. Command state retains an empty `ports` array for older clients. Existing external Mewlink code may still send preview-only requests; the host rejects those requests.

## Alternatives and consequences

Keeping the proxy or adding per-port origins would preserve localhost app access but retain a separate compatibility and operating surface. Removing it breaks existing Mew Port links and requires current host and central code to be applied separately. The change does not expose host services or replace the Mewlink network transport. Existing historical documents remain available; [Browser behavior](../development/browser-desktop.md) and [remote access](../development/remote-access.md) own current contracts.
