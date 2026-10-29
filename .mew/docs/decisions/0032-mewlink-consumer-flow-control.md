---
title: "Mewlink consumption-based receive flow control and task slot separation"
description: "A decision to adapt HTTP and WebSocket receive windows to consumption, round-trip time, and CPU cost through optional negotiation in P2P v1, and to separate persistent sockets from HTTP slots. Describes backward compatibility, bridges, resource limits, and the scope of fairness validation."
created: 2026-10-20
updated: 2026-10-20
---

## Status

Accepted. After implementation and isolated validation, apply it to the central launcher and local runtime separately. This does not guarantee performance across remote networks or achievement of loading-time targets.

## Background

Large WebSocket messages lacked receive credit like HTTP's, allowing fast hosts to queue browser receive work in advance. Under a 22.5MB mixed load passing through both actual native RTC and MessagePort stages on the same host, small WS and HTTP operations were delayed by hundreds of ms. An isolated receive flow control experiment reduced this delay even with similar overall CPU utilization.

Meanwhile, keeping HTTP's existing 8-chunk, 96KiB window fixed even for large transfers requires waiting on each round trip over distant networks. If persistent sockets occupy all 16 shared slots, even small HTTP operations must wait until a socket closes.

## Decision

Retain the existing v1 and `responseWindow` contract of 1–8 chunks. New peers negotiate the optional field `flowControl` through requests and responses or socket opening, and use batched credit and expanded receive windows only with confirmed peers. Retain the existing HTTP receive window and WS transmission for peers that have not negotiated support.

Initially allow only 8 chunks. After the final consumer processes data, adjust the window based on round-trip time and chunk processing cost, accounting for both bytes remaining in the output queue and credit already granted. Do not treat the initial automatic pull of unread HTTP as actual consumption. Defer sending credit until the next task after a consumption batch to give the UI and other tasks a chance to run. Each window must not exceed 256 chunks or 3MiB.

The app, launcher, and central parent's MessagePort bridges forward the final consumer's credit unchanged. Intermediate bridges do not independently acknowledge consumption or add credit. Cancellation, closure, and authorization revocation release window waits, and late credit does not open new tasks.

As an optional capability in the same negotiation, separate admission for persistent WS and HTTP. Each type has 16 slots, with at most 32 across the channel. Before negotiation and for older versions, retain 16 shared slots. Preserve waiting order within each type and ensure blocked sockets do not leave available HTTP slots idle. Retain existing byte, message, upload, and queue limits and authentication checks.

Retain the Base64 format for compatibility, but use native conversion in supported browsers. Unsupported environments convert with a simple loop, and frame validation retains the existing accepted formats. Apply this alongside the change that reduces transmission volume through [display tool events](0031-agent-display-events.md).

## Rationale and Impact

Instead of introducing only a fixed small WS window, place bounds on latency, consumption, and CPU cost. New capabilities are used only when confirmed by the peer, so existing connections remain possible even when the central service, app, and host are updated in different orders. Do not change the single ordered DataChannel or message ordering and final assembly semantics.

[Remote access](../development/remote-access.md) owns the common transport contract and specific validation results; [Deployment contract](../operations/remote-central.md) owns central rollout. This decision does not add arbitrary-byte protocol compression or raw tool detail lookup.
