---
title: "Cause-specific Mewlink recovery and offline waiting"
description: "Decision to use a short host heartbeat response deadline, lightweight presence queries after offline confirmation, retries based on visibility and network state, and an authentication body timeout. Preserves existing RTC, lease, and authentication boundaries and distinguishes central and host application scope."
created: "2026-10-29"
updated: "2026-10-29"
---

## Status

Accepted. Implemented locally and validated in isolation; the user applies it to production. [Remote access](../development/remote-access.md#reattaching-the-same-rtc-after-a-brief-signaling-interruption) owns the current contract, and the [Work record](../work/mewlink-efficient-recovery.md) owns validation and application scope.

## Background

Response monitoring was added to address a defect where the host mistook a disconnected central WSS for `OPEN` or `online`, but the initial policy terminated it only after 60–80 seconds. This may leave insufficient time to reattach within the existing RTC's 60-second lease. The browser also treated the central service's `offline` error as a generic failure, repeating full bootstrap and RTC preparation and retrying even in hidden tabs. There was also a path where activation never completed if only the reconnection authentication headers arrived and the body stalled.

## Decision

- Keep the normal heartbeat interval at 20 seconds and wait 5 seconds for a response. Retransmit once and wait another 5 seconds before handing off to the existing abnormal termination and reconnection path. While the event loop is running, disconnection detection takes approximately 30 seconds in the worst case. Even if the first deadline runs late after sleep, allow 5 seconds for rechecking without extending permissions or leases.
- Query the lightweight presence API for public devices only after an explicit `offline`. Start a new bootstrap once online status is confirmed. Preserve parallel preparation for normal initial connections. The API provides only online status, checks IP request limits, device existence, and current DO state, and performs no login, launch, or RTC work.
- Preserve error codes to distinguish offline status, delayed responses, rate limiting, and authentication denial. Increase retry intervals with jitter after repeated failures. During full recovery, cancel requests and timers if the tab becomes hidden or internet connectivity is lost, and resume once when visibility or connectivity returns. Continue allowing renewal and central reattachment for an RTC connection that is already alive.
- Limit authentication verification to 10 seconds from the request through completion of the JSON body. Discard responses from previous generations, and stop automatic retries on explicit authentication denial or account changes.
- Preserve the 5-second natural recovery period and 1-second display delay from [ADR 0081](0081-mewlink-transient-recovery.md). Use a small indicator for ordinary brief interruptions and a short status message over the existing app for known persistent failure reasons. Preserve initial connection parallelization from [ADR 0060](0060-mewlink-startup-handoffs.md) and existing lease and permission checks.

## Alternatives and Rationale

Rebuilding the entire connection on every failure simplifies the path but repeats RTC, key, and STUN preparation while waiting for a powered-off host. Always querying presence first adds a round trip even to normal initial connections. A WebSocket dedicated to online notifications requires separate waiting-state, lifecycle, and authorization contracts. Limit the scope of changes by using time-limited queries only after explicit offline status.

## Impact

Offline waiting incurs costs for device existence queries, request limit handling, and DO liveness checks. For 404 responses before the new central version is applied, fall back to the existing full reconnection process. Explicit errors for deleted devices stop recovery. The fast recheck policy may reconnect connections with prolonged delays and must be tuned through measurements on external networks and after sleep. Host server updates and central launcher and Worker application are each required. Preserve the Git exclusion boundary for private central source code.
