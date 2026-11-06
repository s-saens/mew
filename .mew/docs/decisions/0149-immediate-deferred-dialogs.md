---
title: "0149 — Show dialog frames before deferred code and data"
description: "Requires immediate, dismissible menu-dialog shells while optional modules and API data load. Defines ordinary-state module commits, public-code reuse, current props, canceled completions, local import retry, and preserved overlay behavior."
created: "2026-11-06"
updated: "2026-11-06"
status: "accepted"
---

## Context

Menu dialogs used a null Suspense fallback. Settings, My account, and Account management therefore remained invisible until their optional code graph finished loading, with a possible additional React lazy retry delay. Their API reads already happen in component effects and do not require delaying the frame. The user requests visible windows before body data is ready.

## Decision

Refine [progressive startup](0003-progressive-startup.md) with a shared `deferredDialog` boundary. Commit the destination's translated title, close control, loading indicator, dimensions, and layer immediately. Begin the import in an effect and render the resolved component through ordinary state. Reuse only prepared public component code and in-flight module promises; pass current props and retain all component/server authorization and data-fetching boundaries.

Keep close, Esc, Back, outside dismissal, and focus behavior available during loading and across the shell-to-dialog handoff. Localize import failures inside a closable frame with explicit Retry. Ignore UI completions after unmount; a late import may prepare code for a future open but must not reopen the dialog. Data-backed regions load independently inside their owning components.

Apply this to menu dialogs and the same workspace dialog entries for databases/system resources; keep optional code deferred while closed.

## Alternatives and rationale

Eagerly importing every dialog increases startup work and still cannot guarantee API readiness. Intent-only prefetch can improve some desktop opens but does not cover immediate taps or slow networks. A blank fallback provides no acknowledgment. A visible Suspense fallback fixes acknowledgment but retains the lazy retry scheduling delay. A small immediate frame plus ordinary-state commit provides feedback and lets ready content appear without that additional wait, following the existing prepared editor/panel approach.

## Consequences

The first open may show loading content and then change body height; fixed-size settings/admin frames retain their dimensions. Reopening prepared code avoids a loading commit, while data refresh behavior remains owned by each dialog. The temporary and loaded frames must preserve overlay history and focus when replaced. Regression tests hold module/data responses and exercise dismissal, late results, local failures, retry, layering, current props, and warm reuse.

The [startup](../development/browser-startup.md#optional-tools-and-public-module-scheduling) and [overlay](../development/ui-overlays.md#opening-deferred-dialogs) contracts own current behavior. The [menu work record](../work/compact-workspace-menu.md#november-6-show-menu-dialogs-before-their-code-and-data) separates local verification from runtime application and actual connection latency.
