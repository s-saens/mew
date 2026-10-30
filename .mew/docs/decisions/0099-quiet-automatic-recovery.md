---
title: "Quiet automatic recovery and explicit retry exhaustion"
description: "Replaces visible transient connection failures with loading indicators, bounds automatic agent and Mewlink recovery to eleven retries, and preserves app drafts behind a full-screen connection error. Supersedes the presentation and retry-limit portions of ADR 0086."
created: "2026-10-30"
updated: "2026-10-30"
---

## Status

Accepted. The user applies host and central frontend updates separately. Current contracts belong to [UI contracts](../development/ui-contracts.md#automatic-recovery-within-panels-and-menus) and [remote access](../development/remote-access.md#reattaching-the-same-rtc-after-a-brief-signaling-interruption); verification belongs to the [work record](../work/quiet-automatic-recovery.md).

## Context

Returning after inactivity can require reconnecting the app and its read subscriptions. Connection banners and red metadata errors make this automatic wait look like a failure that requires refreshing. The command menu also discarded its last successful list while its next poll could recover it.

## Decision

- Display only the existing shared loading dots while automatic recovery is active. Preserve known content and drafts, and expose a translated loading name to assistive technology.
- Allow an initial failure followed by 11 automatic retries for Mewlink reconnection or presence probes, agent connections, assistant connections, and command metadata reads. Reset on successful synchronization; passive waits and canceled Mewlink attempts do not consume retries. Keep memo and terminal retry lifetimes unchanged.
- After Mewlink exhaustion, stop automatic attempts and display a themed full-screen error with the retry count, useful cause, and manual reconnect action. Preserve the inert iframe and reconnect without refreshing or replaying writes. Restore title and focus after verified recovery.
- Keep component failures scoped to their panel or menu. Preserve real operation errors and immediate authentication, permission, revocation, and configuration failures. Disable command actions while their state is unverified.

This supersedes [ADR 0086](0086-mewlink-recovery-efficiency.md) only for visible cause-specific recovery messages and unlimited retries. Retain its backoff, visibility, presence, authentication, and lease rules, and the brief-interruption display delay from [ADR 0081](0081-mewlink-transient-recovery.md).

## Alternatives and rationale

Showing every transient failure gives early diagnostics but prompts unnecessary refreshing. Hiding failures indefinitely leaves users waiting when recovery cannot succeed. Loading feedback followed by a bounded, actionable failure state distinguishes these situations without discarding unsent work. A single panel's failure does not justify blocking the workspace.

## Consequences

An exhausted connection requires explicit retry even if the host later returns. Causes appear when recovery ends rather than during every retry. The central connection source remains private and Git-excluded; applying host UI changes alone does not update the central launcher. No transport protocol, authentication lease, save replay, or command execution contract changes.
