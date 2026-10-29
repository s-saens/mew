---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
title: "0208 — Link Mewlink identities as login methods for approved local users"
description: "Separate central identities from local users and define boundaries for access requests from signed Mewlink accounts, owner approval, passwordless users, and link revocation. Retain existing unauthenticated device connections and local password login. Linking one's own account and the immediate approval UI were extended in subsequent decision 0007."
created: 2026-10-12
updated: 2026-10-16
---

- Date: 2026-10-12
- Status: Adopted
- Application status: implementation and isolated automated verification complete · not applied to production
- Subsequent extension: [0007 — Mewlink Immediate Approval and Linking One's Own Email Account](../../decisions/0007-mewlink-self-service-linking.md). Preserve the original decision below as the rationale at the time.
- Partially supersedes: [0207](0207-mewlink-device-access-local-auth.md) — The scope that made local passwords the sole authentication method for device use. Retain unauthenticated device connections, final local authorization, and separation of central management accounts.
- Decision makers: user (requested mew access for specific OAuth accounts and implementation of identity separation), Codex (implementation contract)

## Decision

- Mewlink accounts and local mew users are separate. Even when central login proves identity, device ownership, addresses, or matching email addresses alone do not grant local permissions. The `accounts` mapping in previous registration settings does not replace new OAuth approval.
- Retain existing unauthenticated device connections and email and password login. Optionally, pass a signed identity containing the central origin, immutable account ID, provider, and display name for connections from browsers logged in centrally. Bind the identity to the one-time launch, central session, device, browser key, and negotiation ticket. The host trusts the identity only after verifying the ticket's signature and target.
- Unapproved identities may use only the static UI and authentication and access-request APIs. Link an owner-reviewed request to an existing local user, or create a passwordless local user with an explicitly specified role. The default role for new users is member; do not provide public signup, automatic merging, or automatic privilege elevation.
- Store local user profiles and permissions separately from password credentials and external identity links. Apply user creation and identity approval status in a single atomic save. Preserve existing email-based user IDs, file permissions, and personal data; use independent immutable IDs for new passwordless users. In the compatibility API, `email` means the existing internal account key and is not a basis for automatically linking actual contact information or external identities.
- For external authentication, apply password-change requirements only to the password login method. Profile changes must not clear an existing password's change requirement. OAuth-only users work without passwords, but the same role, feature, file-permission, and per-account storage boundaries apply.
- Recalculate external login permissions each time from the active connection and local identity link. Do not issue long-lived local password sessions through external login. Link revocation, account deletion, role or permission changes, and central authentication session expiration trigger revalidation of existing requests and WS connections. Do not immediately log in again with the central identity after logout.
- For navigation to central login or logout, request only the action through the MessagePort of the exact frame. The central launcher determines the target device path. The installed app does not receive central cookies, launches, or long-lived local session tokens.
- Retain exclusion of central source code from public Git, local owner recovery login, origin separation, direct DataChannel transport, and no TURN usage. The user performs the local update and central deployment for actual application.

## Rationale and current contract

Separating users from login methods allows email and password login and explicitly approved OAuth to coexist while keeping permissions and personal settings on the same local user. Email is not a stable external identity identifier, so links use the central issuer and immutable account ID. [OIDC Identity Identification Rules](https://openid.net/specs/openid-connect-core-1_0.html#ClaimStability).

The [Remote Access Contract](../../development/remote-access.md) and [Permissions Contract](../../development/access-control.md) own the current implementation, verification, and production application scope.
