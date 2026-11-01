---
title: "Fast verified Mewlink recovery on foreground return"
description: "Records fresh bounded P2P read probes on foreground return, immediate replacement of unresponsive or expired connections, RTT-aware deadlines, verified subscription retry acceleration, renewed collaboration sync deadlines, and focus preservation. ADR 0111 extends the same check to visible RTC disconnection without relaxing identity or lease checks."
created: "2026-10-31"
updated: "2026-11-02"
---

## Status

Accepted, extended by [ADR 0111](0111-fast-agent-recovery.md) to probe immediately on visible RTC disconnection. Hidden and congestion fallback paths retain the five-second recovery grace. The original decision below remains as the rationale for foreground verification. Extends [ADR 0099](0099-quiet-automatic-recovery.md) and supersedes [ADR 0081](0081-mewlink-transient-recovery.md) where a fresh check confirms that the retained data path is unresponsive. Current behavior belongs to [remote access](../development/remote-access.md#reattaching-the-same-rtc-after-a-brief-signaling-interruption); earlier measurements and application status belong to the [work record](../work/mewlink-foreground-recovery.md), with the subsequent extension recorded in the [fast recovery work record](../work/fast-agent-recovery.md).

## Context

After background suspension, the browser can still report an open signaling socket and a connected RTC peer while the data path has stopped responding. Waiting for native detection and then the existing recovery grace introduced about eleven seconds in a local native reproduction. Host panels could add another one or three seconds after verified transport recovery. Making the retained app frame inert also cleared input focus.

## Decision

- On visible, pageshow, or online return, coalesce events and check the retained authenticated P2P path with a fresh random-ID `HEAD` request through the existing request quota. Only a response for this new probe proves the round trip; queued old data and signaling renewal acknowledgments do not.
- Start the failure deadline after the probe is sent. Use 250ms by default, increasing it within a one-second ceiling for a known slower selected ICE path. Read RTT statistics concurrently so missing or late statistics do not block the default decision. If quota admission or local backpressure prevents the probe, cancel only that check and retain ordinary recovery.
- Replace an unresponsive peer through the existing bootstrap, browser key, ticket, and same-account authentication checks. Already-expired authorization starts fresh recovery immediately. Bind both monotonic and wall-clock expiry to request transmission, including renewal and signaling reattachment, so queued acknowledgments after sleep cannot extend an expired lease.
- After verified replacement, emit one app-local `mew:remote-reconnected` event. Pending agent, presence, and collaboration subscription retries may bypass their existing delays; connected, connecting, exhausted, terminal, and unauthorized states retain their guards where applicable. A pending collaboration handshake keeps its socket and receives a fresh sync deadline from verified transport availability, so an overdue pre-sleep timer cannot retire it immediately. Collaboration retains its existing Y.Doc, unsent changes, and undo history through its normal sync protocol. No prompt, save, or command is replayed.
- Preserve the same app and drafts. Restore the previously focused input only when it remains connected and the parent still permits restoring app focus; keep the inert and authentication gates during replacement.

## Alternatives and rationale

Reducing the five-second RTC grace globally would rebuild healthy peers during ordinary short interruptions. Waiting solely for browser RTC state changes leaves the observed foreground stall. A probe through signaling checks the wrong path, while accepting arbitrary incoming frames can mistake queued pre-sleep traffic for a fresh round trip. An ICE restart requires native backend and protocol support absent from the current implementation. A bounded foreground read targets the observed delay with the existing authenticated data path and resource limits.

## Consequences

Healthy returns add one small read without rebuilding the app. The timeout is a failure-detector policy, not a universal latency guarantee; unknown high latency, a busy host, network loss, and exhausted stream capacity can still delay recovery. The 500ms goal is measured for verified recovery in a controlled native environment and must remain distinct from physical-device or external-network results. Applying the shared connection client and focus bridge requires a central frontend build and deployment as well as the host build. Existing authorization, revocation, retry exhaustion, and non-replay rules remain in force.
