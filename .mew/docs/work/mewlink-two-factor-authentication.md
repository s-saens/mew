---
title: "Mewlink two-factor authentication implementation"
description: "Records local verification of central Mewlink passkey, TOTP, and recovery-code sign-in, including independent baseline failures and pending production and physical-device checks."
created: "2026-11-18"
---

# Mewlink two-factor authentication implementation

Added a second sign-in step for enrolled Mewlink accounts after email or OAuth verification. The private central repository contains enrollment, challenge verification, session handling, recovery codes, and the D1 migration. The [remote access contract](../development/remote-access.md#central-two-factor-sign-in) owns behavior and the [decision](../decisions/0211-mewlink-two-factor-authentication.md) records the design.

## Local verification

- The workspace and Mewlink builds passed. The Mewlink Worker and browser type checks passed. Workspace lint and focused central lint completed with existing warnings.
- The selected Worker suites passed 50 tests. These include signed WebAuthn assertions, both OAuth callback paths, D1 session and challenge expiry, and concurrent OTP and recovery-code submissions. The workspace remote authentication and access suites passed 34 tests.
- Three Chromium tests passed. The two-factor test uses a virtual authenticator and covers enrollment, OTP errors and completion, recovery, and returning to the original path.
- The full Worker suite passed 279 tests and failed two removed-port-route assertions in `startup-admission.test.ts`. Both failures reproduced from the pre-change central commit.
- Wiki descriptions passed. The link checker reported 39 errors. The committed baseline had 38 of them and an unrelated untracked task had the remaining error.

The checks used local fixtures. Production D1, provider sign-in, live deployment, and physical passkey devices remain unverified. The [central runbook](../operations/remote-central.md#state-keys-and-recovery) owns rollout and key retention.
