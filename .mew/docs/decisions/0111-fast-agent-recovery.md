---
title: "Fast agent recovery with fresh relay liveness checks"
description: "Replaces the earlier agent recovery delays with a three-second cap, negotiates fresh relay ping/pong checks with monotonic paused budgets, bounds command-status reads while retaining permanent HTTP status, and shortens cache startup. Extends Mewlink foreground probes to visible RTC disconnection while preserving drafts, authorization, compatibility, and non-replay boundaries."
created: "2026-11-01"
updated: "2026-11-02"
---

## Status

Accepted. Supersedes only the retry-delay policy in [ADR 0110](0110-continuous-agent-panel-recovery.md) and extends the foreground verification in [ADR 0105](0105-mewlink-foreground-recovery.md) to visible RTC disconnection. Continuous quiet recovery and permanent failure boundaries remain. Current contracts belong to [agent sessions](../development/agent-sessions.md#messages-reconnection-and-queues), [conversation storage](../development/conversation-storage.md#browser-and-screen), [UI recovery](../development/ui-contracts.md#automatic-recovery-within-panels-and-menus), and [remote access](../development/remote-access.md#reattaching-the-same-rtc-after-a-brief-signaling-interruption). Measurements, checks, and application status belong to the [work record](../work/fast-agent-recovery.md).

## Context

Removing manual retry exhaustion did not bound a socket stuck in CONNECTING or OPEN, or a command-status request whose response never completed. Later retries could also wait 30 seconds. Foreground events alone could not recover a request still marked as in flight. Cache startup serially waited for queue and transcript reads. Local measurement showed warm supervisor reattachment below one millisecond, so restarting the provider would add work without addressing these waits.

## Decision

- Retry transient agent connections and safe command-status reads without an attempt limit, using delays of 0, 250, 500, 1,000, 2,000, and then at most 3,000ms. Reset after synchronization, coalesce visible, online, `pageshow`, and verified-transport wake signals, and pause monitoring while hidden, offline, or transport-suspended. Explicit offline events pause the socket monitor, new unavailable reads or connections do not start, and wake-up does not require a surviving retry timer.
- Bound the first relay packet to 3 seconds of active time independently of ACP readiness. Use monotonic clocks, exclude paused intervals, start native socket budgets at construction, and start virtual socket budgets only after their open frame is transmitted; quota and local backpressure waits are not remote failure time. Advertise `ready.connectionProbe: true`; accept bounded opaque ping IDs and return matching pong after current socket permission checks, before provider preparation or command queuing. Ping/pong never enters the transcript or task queue.
- Check supported sockets with a fresh probe on visible foreground return, `pageshow`, and a 15-second idle timer. Use a 750ms initial response deadline, adapting to observed relay round trips up to 5 seconds. Only the matching pending pong proves freshness. Keep older relays compatible by replacing them on foreground return only after at least 15 seconds without a packet.
- Bound each safe command-status read through JSON completion to 5 seconds, excluding suspended transport waits. Replace an in-flight read at least 250ms old on foreground or verified transport return. Abort and generation guards reject stale results even when the underlying request ignores cancellation. Preserve an already-received permanent HTTP 4xx status if its diagnostic body times out; 408/429 and 5xx remain retryable, and explicit caller abort retains its own reason. Mutation retries and execution remain unchanged.
- Wait at most 25ms for an existing session's transcript cache before connecting, and read its queue independently. A cache available within that gate supplies the generation and cursor. New sessions skip both cache reads. Preserve the live supervisor and current provider session on warm reattachment.
- Reuse the existing fresh P2P probe immediately on visible RTC `disconnected`, without waiting for the ordinary five-second grace before checking. Retain RTT-aware 250–1000ms deadlines, quota and backpressure guards, hidden/congestion fallback grace, authentication, identity, and lease validation.
- Preserve the mounted app, conversation, composer, drafts, known records, and permanent operation errors. Recovery reconnects or reads state; it never resends accepted prompts, commands, saves, or queued writes. Other components' retry limits remain unchanged.

## Alternatives and rationale

Shorter retry delays alone cannot recover a request or socket that never fails. Trusting an OPEN flag or arbitrary queued packets can mistake stale pre-sleep traffic for a live connection. A fresh bounded relay probe detects that case without waiting for provider initialization. Restarting ACP discards a cheap warm reattachment and risks writer conflicts. A full-page refresh rebuilds unrelated panels and risks transient input state. Capped retries and guarded reads address the observed waits while preserving current protocol and permission boundaries.

## Consequences

Healthy foreground returns add a small relay round trip, and idle supported sockets exchange occasional probes. Fast paths issue more bounded recovery attempts during a prolonged visible outage than the earlier 30-second policy. The deadlines are recovery policies, not guarantees of provider readiness or total external-network latency; slow paths adapt within their stated ceilings. The separate central frontend must be built and applied by the user for shared Mewlink browser-client changes. A host build alone does not update that copy, and this decision authorizes no deployment or server lifecycle operation.
