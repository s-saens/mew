---
title: "Owner-issued temporary password resets"
description: "Accepts in-app owner resets for other existing password accounts, explicit browser-token revocation, temporary-password delivery, and preservation of independent external identity approvals and account data."
created: "2026-10-31"
updated: "2026-10-31"
---

## Status

Accepted. Implemented locally; user build and application remain pending.

## Context

Owners could create password accounts and delete accounts in the app, while password recovery required the host administration CLI. The account popup already owns per-user actions. Recovery must retain account data and require the user to replace a temporary password before using work features.

## Decision

Add an owner-only reset action and `POST /api/admin/users/:accountId/reset-password` for another existing password account. Require confirmation, return a generated temporary password once with `Cache-Control: no-store`, store its hash and pending-change flag, and show a selectable/copyable value until the popup closes. The current account uses the existing Settings password-change flow; external-only accounts cannot acquire passwords through this endpoint.

Explicitly remove the target's stored browser tokens and trigger access revalidation. Keep password-change timestamps nondecreasing, without future timestamps. Preserve account metadata, roles, ACLs, Git credentials, and external approvals. Approved Mewlink identity connections remain independent; revoking them is a separate explicit action. The demo returns a fixed placeholder and changes only tab-local state.

## Alternatives and rationale

- Keep recovery CLI-only: avoids an endpoint but requires host access for routine account administration.
- Let owners choose permanent passwords: bypasses the existing temporary-password flow and leaves the administrator knowing a user's long-term password.
- Create credentials for external-only identities: changes their established login contract and needs a separate recovery design.
- Revoke by timestamp alone: a token created in the same millisecond can remain valid. Explicit token deletion prevents this without future clock values or changing token formats.
- Revoke external approvals and Git credentials too: changes unrelated authentication methods and integrations when only password recovery was requested.

## Consequences

Owners gain password recovery without deleting or recreating accounts. Temporary passwords must be delivered securely; the UI discards them on close and does not persist them. Existing stored browser sessions end, but active external identities require separate link revocation. Host-side CLI recovery remains available for an owner who cannot sign in. Actual running-instance behavior is checked after the user builds and applies the change.

The [accounts feature](../features/appearance-accounts-operations/accounts-roles-feature-permissions-and-guest-sharing.md), [access contract](../development/access-control.md#owner-issued-password-resets), and [user guide](../../../docs/configuration/accounts.md) own the current behavior. See the [implementation record](../work/account-password-reset.md) for verification.
