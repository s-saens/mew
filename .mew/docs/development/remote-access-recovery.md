---
title: "Mewlink connection recovery"
description: "Defines same-RTC signaling reattachment, replacement RTC, foreground liveness, lease and retry limits, and preservation of application state. Covers suspended work, verified subscription and focus recovery, presence and authentication checks, and implementation ownership."
created: "2026-11-03"
updated: "2026-11-03"
상위파일: "remote-access.md"
---

# Mewlink connection recovery

[Remote access](remote-access.md) owns registration, authentication proofs, resource boundaries, and transport limits. This document owns recovery lifecycles; [signed replacement offers](remote-access.md#signed-replacement-rtc-offer) retain the same authentication requirements.

## Reattaching the same RTC after a brief signaling interruption

### Host signaling heartbeat

Host WSS handshake allows 30 seconds. Open sockets send JSON heartbeat every 20 seconds; the matching central response is checked before async message queuing. Monotonic response waits are 5 seconds, one retransmission, then 5 seconds before `terminate()` invokes abnormal-close/reconnect handling. No duplicates send while waiting. Detection is about 30 seconds worst-case with a running event loop; a late post-sleep deadline still allows 5 seconds to recheck. Send success/initial `pong` do not prove liveness; send failure terminates too. Close cleans listeners/timers. Heartbeats extend neither auth nor lease. [Investigation](../work/mewlink-host-heartbeat.md) · [Policy/checks](../work/mewlink-efficient-recovery.md).

### Same-RTC reattachment

[ADR 0033](../decisions/0033-mewlink-signaling-resume.md) preserves RTC/work across transient WSS loss only when central challenge, host nonce signature, browser request, and ticket all negotiate `signalResume`. Normal code 1000 closure, denial, revocation, logout, and expiry never reattach. Older versions fully reconnect.

The browser signs a new single-use socket nonce with its existing key. Central rechecks session instance, origin, connection, generation, SDP/key fingerprints, subject, optional identity, and revocation. Reattachment restores only the old lease: renewal request ID, monotonic start, and central remaining time minus 1-second margin bound expiry. Clock skew, latency, and retries add no lifetime.

DO SQLite `mew_signal_recovery` retains ≤8 disconnected browser states, cleaned by existing expiry, alarms, new connections, and revocation; open sockets restore attachments. New host WSS signs its nonce and actual authenticated-connection list with the registration key. Central compares current/retained state and resends existing leases only, rechecking host/browser/state after async identity lookup. An unprepared new host cannot revive old peers. Browser reattach/host-auth waiting slots remain available at 8 active peers.

Isolated Workers tests checked nonce, key, generation, and device mismatches, reuse, revocation, logout, expiration, hibernation, host replacement, and browser reattachment races. Stability tests with actual Workers, native RTC, and Chromium confirmed that HTTP succeeded in the same iframe and RTC without creating a new prepare when the browser and host WSS connections were disconnected separately. Uninterrupted operation is not guaranteed for forced termination in which the platform loses all socket state without a close callback. Reattachment failure or lease expiration leads to the full reconnection described below.

### Replacement RTC and natural recovery

| RTC state | Recovery behavior |
| --- | --- |
| Visible/authenticated `disconnected` | Fresh P2P probe below; unresponsive transmitted probe replaces RTC after 250–1000ms |
| Hidden or congestion-skipped probe | Up to **5 seconds** natural recovery; deadline is fixed despite repeated events |
| Recovery before deadline | Keep transport, iframe, and drafts; returning `connected` requests renewal |
| Fallback interruption <1 second | Omit indicator and duplicate `connected` notification; longer waits show recovery |
| Fallback deadline expired | Start a new connection; native helper cleanup remains separately **15 seconds** |
| `failed`·`closed`, DataChannel close, parent termination | Clean transport immediately |

WSS closes immediately without negotiated reattachment or on normal closure, denial, or revocation. The existing 60-second lease takes precedence; expired auth never revives. Visibility return/`pageshow`·`online` requests renewal immediately. Recovery/termination clear indicator/deadline timers. Writes/commands never replay; request checks, 10-second central alarms, and 20-second renewal remain. See [ADR 0081](../decisions/0081-mewlink-transient-recovery.md), its [work record](../work/mewlink-transient-recovery.md), [ADR 0111](../decisions/0111-fast-agent-recovery.md), and the recoverable [`disconnected` state](https://www.w3.org/TR/webrtc/#dom-rtcicetransportstate).

After final termination, sleep, or network change, recovery uses fresh WSS bootstrap, the same browser key, and stored session; HTTP launch is old-version compatibility only.

- **Retry timing:** first ordinary retry is immediate; repeated failures use jittered 250 ms → **30 seconds**. Explicit `offline` waits for presence before RTC, at 2·5·10·30 seconds capped at 30 including jitter.
- **Visibility/connectivity:** hidden/offline full recovery cancels timers, preparation, and lookups, resuming once on online/pageshow/visible. Live-RTC renewal/reattachment remains allowed without extending lease merely on resume. Natural recovery uses the grace and helper limits above.
- **App reuse:** keep iframe/unsaved input and replace transport only after new `/api/auth/me` confirms the same local account/auth method. Changed instance, central/app origin, or previewDomain destroys preparation/iframe, stops auto-retry, and requests refresh. Changed account/auth method also prevents app reuse.
- **Work:** terminated requests cancel; saves/commands do not replay. DOM browser/Mewpet reopen read subscriptions without resending input. The separate desktop video/input peer needs manual reconnect.
- **Authentication:** revocation, denial, or logout clears tokens/stops retries. Reauthenticate after 90 inactive days, password change, or approved-connection revocation.

Phone-sleep persistence and external-network recovery remain unguaranteed.

### Foreground liveness and lease expiry

Visibility/pageshow/online return or visible RTC disconnection coalesces one fresh-ID `HEAD /api/remote-ui/file?path=/favicon.ico` on the retained authenticated peer. Only its response/end/error proves a round trip, never queued old frames or signaling ACKs. Deadline starts at transmission: 250ms by default, or `max(250ms, min(1000ms, 3 × selected ICE RTT + 50ms))` with concurrent valid selected-path `getStats()`. Missing/late stats cannot postpone default. No response starts replacement immediately, bypassing native detection plus ordinary grace. Admission wait cancels at 250ms without declaring death; high backpressure skips probing, retaining ordinary recovery. Existing auth paths/stream caps apply; probes authorize nothing/replay no writes. [ADR 0105](../decisions/0105-mewlink-foreground-recovery.md) defines foreground checks; [ADR 0111](../decisions/0111-fast-agent-recovery.md) adds visible disconnection. Users must build/apply central frontend separately; host build cannot update it.

`src/utils/remote-foreground-probe.ts` owns the pending HEAD probe, RTT-based deadline, queue timer, cancellation, and response listener; `src/utils/remote-connection.ts` retains authorization, visibility, channel-state, and lease eligibility.

Connect, renew, and reattach expiry use monotonic and wall-clock transmission times. Foreground expiry immediately starts fresh recovery without waiting for frozen timers. Pre-sleep queued ACKs create no new lifetime, and reattach cannot extend the lease. This conservative wall bound supplements monotonic expiry; only verified renewal extends an unexpired lease.

### Suspended work and verified subscriptions

Suspension preserves the mounted app, conversations, rows, and drafts without reload/warning banners ([work record](../work/mewlink-background-recovery.md)).

| Work | Suspended/recovered behavior |
| --- | --- |
| New `GET`/`HEAD` | Wait for verified recovery; pre-header interruptions may restart on the new generation, while post-header bodies keep interrupted-read handling |
| Pending virtual socket | Stay `CONNECTING`; open once after recovery |
| Socket handshake timing | Monotonic `connectionStartedAt` begins after open-frame send, excluding admission/backpressure; native sockets still time from construction ([session contract](agent-sessions.md#messages-reconnection-and-queues)) |
| Waiters | Bounded, cancelable, settled on permanent close; waiting consumes neither request timeout nor panel retries, even through long hidden periods |
| Started socket | Close through existing subscription recovery |
| Mutation | Never replay; interruption or suspended submission fails |

After replacement identity verification, resumed transport emits one `mew:remote-reconnected` before compatibility `online`. Pending agent/presence/collaboration retries run immediately instead of waiting up to three seconds. Connecting/open subscriptions retain guards; foreground agent liveness follows the [session contract](agent-sessions.md#messages-reconnection-and-queues). Fatal agent, permanent read, terminal, and authorization errors never restart; agent recovery has no retry-count exhaustion. [Collaboration](collaboration.md#collaboration-rooms-yjs-relay) keeps Y.Doc, unsent edits, and undo. Parent/bridge retain eligible focus through inert recovery and restore it only after verification and continued parent permission; identity reload/disposal clears tracking. See [latency/checks](../work/mewlink-foreground-recovery.md).

### Recovery screen and retry allowance

Recovery follows the [shared UI contract](ui-contracts.md#mewlink-stay-signed-in-prompt) and [ADR 0099](../decisions/0099-quiet-automatic-recovery.md):

- Show loading dots only, including offline, auth timeout, and rate limits.
- After initial failure, allow 11 actual auto-retries/presence probes. Canceled preparation, hidden/offline-interrupted RTC/auth recovery, and passive waits do not count. Reset only after replacement authentication succeeds.
- Eleventh failed retry stops timers/automatic wakeups, retains inert iframe/drafts, and shows only themed “연결 실패했습니다” (“Connection failed”), manual reconnect, and device-list link. No retry count or `Failed to fetch` diagnostics.
- Manual reconnect resets the counter without app reload; same-frame reuse still requires normal identity checks, then restores title/focus.
- Initial bootstrap without established recovery, and explicit auth/config errors, retain immediate failure paths.

ADR 0099 supersedes ADR 0086 visible-cause/unlimited-retry behavior, retaining backoff, presence, auth, and lease rules.

### Presence and recovery authentication

`GET /central/presence?instance=<기기 ID>` returns only `{ online: boolean }` without login, for current/previous central origins, never app origins. It validates ID/registration/revocation, caps at 60/IP/minute (429 + `Retry-After: 60`), and returns 404/`code: instance-not-found` for removed/revoked devices. No cache, credentials, management lookup, launch, or RTC prep is involved. Costs remain rate recording/device/DO lookup. Initial connections skip this round trip; ordinary old-version 404 uses full recovery.

Recovery `/api/auth/me` allows 10 seconds from request start through JSON completion and discards old-generation/late results. With no initial verified auth, first recovered state establishes baseline. Account/auth-method change or explicit 401·403 clears session and asks login. Old-central HTTP launch and presence also enforce 10 seconds through body completion and support cancellation ([ADR 0086](../decisions/0086-mewlink-recovery-efficiency.md)).

### Admission and revocation boundaries

A destination tab closing during async DO authorization cleans only that tab's send failure, not host authentication. Actual host termination/revocation still closes dependents.

Central launches cap at 30/IP/minute and 60/device/minute; signaling also caps IP frequency, device-pending, and total connections.

[ADR 0048](../decisions/0048-mewlink-bootstrap-rate-batch.md) batches IP launch 30, device launch 60, and IP signal 30 in D1 `batch()` after device lookup. Valid HTML admission skips duplication; otherwise valid instance/path hints include lookup in the batch. SQL UPSERT checks preceding counters, retaining order, 60-second window, shared counters, and no later increments after rejection. Any statement failure rolls back/denies. Old HTTP and normal host/browser paths retain existing checks.

Role hints/key proof separate browser/host waiting slots and reserve host handshakes. Browser signal accepts central origins only. P2P connections lacking local login last ≤5 minutes, never extended by central renew. Queue/body/frame bounds follow the [transport contract](remote-access.md#protocol-and-resource-lifetimes).

Local account/session/permission changes revoke access. Local unregister closes work/removes keys, then sends signed central invalidation; no response instructs dashboard removal of the leftover registration. Already-downloaded material/started OS work follows existing revocation boundaries.
