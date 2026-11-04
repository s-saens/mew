---
title: "0133 — Synchronize account tabs in real time"
description: "Shares editor, agent, and terminal tab lists and selection across an account's devices while preserving device-local panel geometry. Supersedes the document-tab portion of historical ADR 0197."
created: "2026-11-04"
updated: "2026-11-04"
---

- Status: Accepted
- Partially supersedes: [ADR 0197](../history/decisions/0197-mew-device-local-workspace-layout.md), document-tab ownership and restoration priority only.

## Context

The same account could open different tabs on two devices. Editor tabs were restored from device-local layout before the account fallback, and agent/terminal ledgers had no live list subscription. The user requested one current tab state shared in real time.

## Decision

Make open tabs and selection authoritative per account and logical project. Store editor tabs separately from the whole-workspace layout snapshot. Use account-filtered presence invalidations and authenticated reads for delivery and recovery. Preserve existing server tab state during migration and prevent a fresh browser from overwriting established state.

Keep panel positions, sizes, visibility, and mobile foreground device-local. Preserve loaded document buffers and mounted execution sessions when applying remote metadata. Editor scope snapshots use last accepted save ordering; agent/terminal saves carry a base snapshot so concurrent metadata changes cannot accidentally remove another device's new session.

## Alternatives and rationale

Keeping local tabs with account fallback would retain the reported behavior. Broadcasting entire workspace layouts would also overwrite screen-specific geometry. A separate socket or a new collaboration service is unnecessary because the authenticated presence channel already supports account-scoped invalidation and reconnection.

## Consequences

Opening, selecting, reordering, and closing tabs affects the account's other connected devices. Closing an execution tab retains existing session termination semantics. Local drafts and files are not copied through tab metadata. A failed local document save can delay a remote close. Existing clients without the new synchronization path retain their prior behavior until refreshed. Current API, migration, and failure details belong to the [account tab contract](../development/account-tabs.md).
