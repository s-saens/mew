---
title: "Mewlink account two-factor sign-in"
description: "Adopts optional passkey and TOTP second factors with offline recovery codes for central Mewlink accounts. Records the D1 session gate, canonical origin, and signing-key and rollback consequences."
created: "2026-11-18"
---

# Mewlink account two-factor sign-in

## Status

Accepted.

## Context

Mewlink accounts administer device registrations and can identify users to hosts that have approved them. Existing email and OAuth entry points, including the legacy OAuth callback, complete central authentication automatically. Some accounts need another check before receiving a management session.

## Decision

Use an optional second step after the existing email or OAuth check. Each account can enroll one WebAuthn passkey, one TOTP authenticator, or both. Issue one-time recovery codes when requested. Use SimpleWebAuthn to validate the authenticator challenge, relying party, and user verification. Perform, in one D1 transaction, the transition from a pending login to a session and the update that prevents reuse. Keep these records separate from the trusted browser keys used for device access. [SimpleWebAuthn server reference](https://simplewebauthn.dev/docs/packages/server/) · [TOTP specification](https://www.rfc-editor.org/rfc/rfc6238) · [D1 transaction API](https://developers.cloudflare.com/d1/worker-api/d1-database/#batch)

## Alternatives and consequences

A passkey-only sign-in would replace the first step and require a different account discovery and recovery flow. An emailed second code would depend on the same mailbox for accounts already using email sign-in. WebAuthn and app-generated codes provide separate credentials while preserving first-step identity and provider state. Use the canonical Mewlink origin for WebAuthn and keep the legacy OAuth handoff before the second-step gate.

TOTP storage derives an encryption key from the existing central signing secret. Recovery requires backups of that secret and the corresponding D1 data. The rollback Worker must continue enforcing the gate once an account enrolls. See the [current central sign-in contract](../development/remote-access.md#central-two-factor-sign-in) and [central operations](../operations/remote-central.md#state-keys-and-recovery).
