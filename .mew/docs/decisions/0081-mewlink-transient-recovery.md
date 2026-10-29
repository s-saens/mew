---
title: "Recovery wait and status display for transient Mewlink RTC interruptions"
description: "This decision selects a browser recovery wait of 5 seconds and a display delay of 1 second to reduce full reconnections and recovery indicators for brief P2P interruptions. Existing permission revocation, lease expiration, and immediate termination on actual connection failure remain; subsequent ADR 0086 adds cause-specific long-term recovery."
created: "2026-10-28"
updated: "2026-10-29"
---

## Status

Adopted. Implemented locally; the user applies it to production. Verification results and remaining limitations are in the [work record](../work/mewlink-transient-recovery.md).

[ADR 0086](0086-mewlink-recovery-efficiency.md) adds cause-specific full retries, offline waiting, and display of known failure reasons. This decision's 5-second natural recovery period and 1-second display delay remain.

## Background

There were reports of intermittent brief reconnection indicators during use. When RTC changed to `disconnected`, the existing browser controller immediately reported a recovering state and terminated the normally authenticated transport if recovery had not occurred after 250 ms. Even brief network instability could escalate into a new connection, an authentication status lookup, and app socket recovery. This path was confirmed in code and regression tests, but was not established as the cause of the reported production symptoms.

## Decision

- Change the browser RTC natural recovery wait in [ADR 0060](0060-mewlink-startup-handoffs.md) to 5 seconds. Retain the native helper's separate 15-second cleanup limit.
- Recover interruptions shorter than 1 second on the same transport, omitting status display and duplicate `connected` notifications. Use the existing recovery indicator if the interruption lasts 1 second or longer.
- Repeated status events for the same disconnection do not extend the termination deadline. Request renewal upon recovery and assign a new deadline to the next disconnection. Clear both timers on termination or recovery.
- Handle `failed`, `closed`, DataChannel closure, explicit revocation, and authentication rejection immediately. If the existing lease expires sooner, terminate at that time; waiting does not extend permissions.
- Retain the 10-second central check and 20-second renewal intervals. Do not retransmit writes or commands.

## Alternatives and Rationale

Keeping 250 ms starts new connections quickly but escalates even brief interruptions into full reconnections. Delaying only the indicator does not reduce reconnections themselves. Having the browser also wait 15 seconds delays new connection attempts for too long after an actual disconnection. A 5-second wait and 1-second display delay absorb brief interruptions while limiting the wait when recovery fails. These values are initial policy choices, not optimal values measured on external networks.

## Impact

Retain the same app, draft, and transport during interruptions that can recover naturally. If `disconnected` persists, a new connection starts later than before. This does not change the policy to wait on permission revocation, expiration, or actual failure. The [remote access contract](../development/remote-access.md) owns current behavior, and the [shared UI contract](../development/ui-contracts.md) owns presentation. Application requires the user to build and deploy the Mewlink launcher.
