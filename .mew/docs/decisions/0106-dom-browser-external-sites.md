---
title: "External HTTP sites and immediate DOM browser replay"
description: "Extends the restored DOM browser to external HTTP(S) sites, superseding the loopback-only restriction in decision 0103, and chooses local live replay timing and single document snapshots while preserving host isolation and blocked ports."
created: "2026-11-01"
updated: "2026-11-01"
---

## Status

Accepted. Partially supersedes [0103](0103-localhost-dom-browser.md) for allowed document hosts and live replay timing. Host application remains a user operation.

## Context

The user reported sluggish DOM browser interaction and requested external-site access. Document navigation accepted only loopback hosts. Recorder timestamps could postpone replay when the host clock was ahead of the viewer, and navigation commands requested a second full snapshot after the recorder's initial snapshot. Ordinary external HTTP origins also lack the secure-context `crypto.randomUUID` API used to initialize recording.

## Decision

Allow HTTP(S) document navigation to any host in the existing authenticated Browser panel. Retain the `portPreview` permission, isolated ephemeral host context, Origin and revocation checks, script-disabled replay, credential rejection, and blocked Mew port numbers. Apply the existing port restriction to all hostnames and redirect hops; do not add a new permission or change how external links elsewhere in Mew open. Use random document tokens generated with `crypto.getRandomValues` on both HTTP and HTTPS.

Schedule received replay batches using the viewer's local monotonic live timeline. Preserve arrival order while removing host clock and recorded-time waits. Let new documents supply their automatic recorder snapshot once; request a snapshot for navigation-command generations that remain in the existing document, including SPA Back/Forward and fragment changes.

The [DOM browser contract](../development/port-preview.md#internal-dom-browser) owns current behavior. Agent authentication keeps its dedicated video desktop.

## Alternatives and rationale

- Keeping localhost-only navigation conflicts with the requested website access.
- Adding another external-site browser or permission would duplicate the existing host execution and access boundary.
- Keeping recorded timestamps reproduces the source clock's delay. A live control surface needs received updates promptly rather than historical playback pacing.
- Removing every forced snapshot breaks generation changes within an existing SPA document. Conditional snapshots preserve those transitions.

## Consequences

Accounts granted `portPreview` can browse external and private HTTP(S) sites from the host. Mew's blocked port numbers also exclude unrelated external services using those numbers. Asset inlining, host execution, and network transport can still delay the initial screen; canvas, media, frames, uploads, and site-specific browser checks retain existing compatibility limits. Isolated regression checks do not establish real-device or external-network performance. No deployment or server lifecycle change is part of this decision.
