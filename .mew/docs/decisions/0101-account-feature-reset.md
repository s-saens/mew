---
title: "Per-account feature-default reset"
description: "Accepts one reset control in each account feature header and one atomic owner-only operation to remove that account's feature overrides while preserving roles and file rules."
created: "2026-10-31"
updated: "2026-10-31"
---

## Status

Accepted. Implemented locally; user build and application remain pending.

## Context

Each overridden checkbox previously had its own reset icon, adding controls throughout the feature matrix. The requested interaction restores defaults per account from the top of its column.

## Decision

Replace individual feature reset buttons with one icon below each account photo in the sticky feature header, including guest. Enable it when any explicit override exists. Reset all feature overrides for that subject through an owner-only `POST /api/admin/access/features/reset` request. Delete the subject's feature entry in one policy save and return current settings. Preserve roles, other accounts, profile data, and file rules in every workspace. Keep file-permission headers free of this feature action and retain per-feature checkbox editing.

## Alternatives and rationale

- Move each individual reset into the header: still requires choosing one feature and does not provide a single account reset.
- Send separate reset requests for every feature: can partially apply and repeatedly notify clients. One policy write provides complete defaults in a single event.
- Reset file rules too: changes a separate permission scope beyond the feature-default controls being replaced.

## Consequences

The matrix has fewer repeated controls and centered checkboxes. Resetting clears all explicit feature overrides, including values matching today's default, so later role changes inherit cleanly. Failed requests retain the current matrix for retry. The demo follows the same account and guest defaults. The [feature contract](../features/appearance-accounts-operations/accounts-roles-feature-permissions-and-guest-sharing.md), [access contract](../development/access-control.md), [guide](../../../docs/configuration/accounts.md), and [work record](../work/account-feature-reset.md) own behavior and verification.
