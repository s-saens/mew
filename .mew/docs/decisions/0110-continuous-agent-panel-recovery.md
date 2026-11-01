---
title: "Continuous quiet recovery for agent panels"
description: "Records replacement of the eleven-retry limit for agent-panel connections and safe command-status reads with continuous quiet recovery, preserved drafts, and scoped permanent errors. ADR 0111 supersedes its original retry delays and adds relay liveness probes, bounded reads, and faster cache startup."
created: "2026-11-01"
updated: "2026-11-02"
---

## Status

Accepted, with the original retry-delay policy superseded by [ADR 0111](0111-fast-agent-recovery.md). Continuous quiet recovery, retained drafts, permanent error boundaries, and the other components' retry limits remain in force. The original decision below preserves the initial rationale. Supersedes [ADR 0099](0099-quiet-automatic-recovery.md) only for agent-panel connection and command-status read retry exhaustion. Current behavior belongs to the [agent feature](../features/terminals-agents-automation/agent-conversations-queue-and-restoration.md#waiting-for-connection-and-reconnecting), [session contract](../development/agent-sessions.md#messages-reconnection-and-queues), and [UI contract](../development/ui-contracts.md#automatic-recovery-within-panels-and-menus). Earlier verification and application status belong to the [work record](../work/continuous-agent-panel-recovery.md); subsequent measurements belong to the [fast recovery work record](../work/fast-agent-recovery.md).

## Context

After eleven failed automatic attempts, an agent panel displayed `Could not reconnect.` or `Failed to fetch` with a manual retry action. A temporary interruption lasting longer than this allowance therefore required user intervention even when the connection later returned. The intended panel behavior is automatic recovery with only a loading indicator and retained input.

## Decision

- Continue retrying transient agent-panel connections and safe command-status reads while their scope remains active. Keep the first eleven intervals at their normal cadence, then increase the interval to a maximum of 30 seconds. Successful synchronization resets the delay.
- Advance a pending retry on online, visible foreground return, or verified `mew:remote-reconnected` signals. Preserve Mewlink readiness gates, coalesce signals, and prevent duplicate connecting sockets or overlapping reads.
- Show only the shared loading dots during transient recovery. Preserve conversation and composer DOM, drafts, and known command records. Recover in place without a full-page refresh, prompt replay, or command re-execution.
- Preserve fatal agent events as visible errors and stop reconnecting. Stop command-status polling on invalid JSON or permanent HTTP 4xx responses other than 408/429, retaining a scoped explicit retry action. Network and visibility events cannot revive these terminal failures.
- Retain the existing eleven-retry policies for top-level Mewlink, Mewpet assistant connections, and project command metadata. Keep mutation errors and authentication, permission, and revocation boundaries intact.

## Alternatives and rationale

Increasing the retry count only postpones the same manual-intervention state. Refreshing the page risks losing transient input state and reconstructs unrelated panels. Continuous read and connection recovery with capped backoff lets the panel recover when connectivity returns while bounding repeated traffic during a long interruption. Explicit fatal and permanent failures remain actionable.

## Consequences

A transient panel outage can show loading dots until recovery succeeds or the panel closes. The interval cap limits background retry frequency, and foreground or verified transport return avoids waiting for that full interval. This decision changes client recovery policy only; it adds no transport protocol, write replay, or server execution behavior. The required host build verifies implementation and updates local UI assets; deployment and server lifecycle operations remain user-owned.
