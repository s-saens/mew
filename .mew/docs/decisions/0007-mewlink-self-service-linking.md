---
title: "Immediate Mewlink Approval and Linking Your Own Email Account"
description: "Decision allowing administrators to approve Mewlink access immediately and existing email users to link their own accounts using a verified Mewlink identity from the same connection and a password login. Distinguishes revocation of pre-linking sessions from the scope of account data preservation; deletion of merged former accounts follows subsequent decision 0041."
created: 2026-10-16
updated: 2026-10-22
---

# Immediate Mewlink Approval and Linking Your Own Account

Status: Approved. The scope that preserved former accounts is superseded by [0041 — Deleting Merged Former Accounts](0041-mewlink-merged-account-removal.md).

## Background

The previous approval screen required administrators to choose between creating a new user and linking an existing email user. The user requested a flow in which Mewlink users are approved immediately, and people with both login methods log in with email and link their accounts themselves.

## Decision

- The administrator's **Approve** action immediately registers a member without a password and displays them in the approved Mewlink list. Roles are changed through existing account management. The administrator API retains its existing explicit linking and role selection for compatibility.
- Existing email users link their accounts themselves under **Settings → Account → Link Mewlink Account**. This requires both a Mewlink identity verified by a central signature on the same active P2P connection and a completed local password login. The linking target is the user of the current password session.
- Linking your own account requires no additional administrator approval because you have already proven authorization to use the local account. An external login alone cannot link to another local account or create new accounts or roles.
- An existing Mewlink link can be transferred. The transfer is rejected if the previous link confirmed on screen differs from the actual state, and a retry for the same target returns the existing link. A transfer replaces the link ID so that previous external sessions do not inherit the target account's permissions.
- The existing local account and its personal data, settings, permissions, and password are preserved. This operation links login methods and does not merge the data of the two accounts.

## Rationale and Impact

Administrators manage external users' access and roles, while users prove ownership of both login methods to link them to their own accounts. Identity is not inferred from matching email strings or the person who registered the device. Linking your own account uses the email account's existing permissions and does not itself increase permissions.

This decision expands the administrator-centered linking UI and owner-only linking scope of the [previous approved identity decision](../history/decisions/0208-mewlink-approved-login-identities.md). The principles of central identity verification, local permissions, and external session binding remain in place. [Remote Access](../development/remote-access.md#approved-mewlink-account-login) owns the implementation contract, and [Account Settings](../../../docs/configuration/accounts.md#linking-mewlink-to-an-existing-email-account) owns the usage sequence. Applying this requires a local update by the user and a Mewlink central deployment that allows the new API routes.
