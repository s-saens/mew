---
title: "Localhost DOM browser restoration"
description: "Records the 2026-10-31 restoration of the internal DOM browser, localhost and command-port entry, host execution and inert replay checks, mobile revocation fix, and pending user build and runtime application."
created: "2026-10-31"
updated: "2026-10-31"
---

## Purpose and result

Restore the internal DOM browser for localhost apps at the user's request, after proxy compatibility and preview-domain dependencies prevented reliable app access. Localhost links in documents, agent messages, and terminal output, plus command menu port buttons, now open one Browser dock panel. Repeated links navigate that panel. Command execution and port discovery retain their existing behavior.

The host runs app scripts, requests, and HMR at the native app address in an isolated Chromium context. rrweb carries DOM changes through Mew's existing authenticated WebSocket transport, and the script-disabled viewer returns input and navigation. The [current contract](../development/port-preview.md#internal-dom-browser), [feature specification](../features/browser-android-remote-desktop/server-browser-login-and-popups.md), [user guide](../../../docs/guides/browser.md), and [ADR 0103](../decisions/0103-localhost-dom-browser.md) own the behavior and limits. Dedicated OAuth video and legacy `/port-number` proxies remain available through their existing paths.

## Verification

Local checks on 2026-10-31:

- A combined targeted run passed 71 tests: URL normalization, capture before editor handlers, wrapped terminal links and OSC 8, command port actions, DOM protocol/auth/Origin/revocation, native app scripts and routes, API/HMR, input, scrolling, image/CSS assets, redirects, docking/layout, actual App desktop/mobile entry, remote transport, and reconnection.
- The real host/viewer integration test used isolated HTTP fixtures, the actual DOM backend, native WebSocket, actual rrweb recorder/replayer, and the actual Browser component. Counter updates, Korean editing and form submission, loaded inlined images, full-page navigation, Back/Forward, mobile resizing, and close cleanup passed. App scripts did not execute in the viewer.
- The App entry test kept the actual App, DockWorkspace, MobileDock, capture, and permission logic, with the editor and browser renderer replaced by test components. It found a mobile regression where revoked browser access left the editor hidden behind a stale foreground entry. Removing that entry on account/capability changes fixed the regression; desktop and mobile checks passed.
- Review also found stale CSS image caches across reload, queued input reaching reused node IDs after navigation, and a child-frame native popup bypass of the main-page request guard. Document-specific caches with cancellation, generation-bound events/input, and context-wide blocking of popup/frame document requests fixed these cases. A dedicated actual-browser regression verifies fresh assets, rejection of old-generation input, and zero requests to the protected Mew fixture through native popups or targeted forms.
- The separate replay test covered script isolation, editable controls, host DOM mutations, scrolling, same-URL entry, address navigation, reconnection, and cleanup. Browser close shortcuts were checked from the toolbar and replay iframe without falling back to closing an editor or host page. The command menu test covered desktop and compact mobile widths, both themes, no command rerun, and no popup dependency on the remote preview base.
- `npx tsc -b` passed. Targeted `oxlint` passed with React warnings, including existing App/terminal warnings and state synchronization effects in the new viewer. The Impeccable detector reported no findings on the changed UI targets. `git diff --check` passed.
- `npm run check:docs` initially passed descriptions and local links. A later run still passed 599 descriptions, but found one missing link introduced by concurrent project-picker work: `features/projects-files-search/opening-projects-tabs-and-groups.md` points to the not-yet-created `work/project-picker-path-ux.md`. That unrelated work was left untouched. Isolated desktop/mobile screenshots used actual Mew toolbar styles; their layout was inspected. Screenshots were disposable test artifacts, not public product screenshots.

## Application boundary and limits

No Mew app build, launcher run, deployment, or server restart was performed. The user must install dependencies, build, and apply the host change. For Mewlink, the central launcher must also be rebuilt and deployed with the updated shared socket allowlist; an older launcher rejects `/api/dom-browser/ws`. These checks do not establish that a running Mew instance has changed. Actual external-network Mewlink access and the user's particular app remain to be verified after application. The DOM browser needs no wildcard preview DNS or preview-origin Service Worker deployment, but still needs an updated central launcher, a working Mew connection, and host Chromium.

DOM replay does not guarantee canvas/WebGL, media, nested-frame, file-upload, or drag support. Closing or reconnecting discards the isolated app context and its storage. The legacy proxy's compatibility and preview-domain limitations remain specific to its existing URLs.
