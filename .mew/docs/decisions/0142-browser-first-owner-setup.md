---
title: "0142: Create the first administrator in the browser"
description: "Accepts locally armed, expiring browser bootstrap for the first owner with durable closure and serialized claims. Replaces default terminal email and temporary-password onboarding while preserving explicit local administration."
status: accepted
date: "2026-11-05"
---

# 0142: Create the first administrator in the browser

## Context

The source and prebuilt setup paths asked for an email in a terminal and issued a temporary password. A Windows installation wizard needs to lead directly into account creation without exposing internal setup commands. An empty or damaged account store must not silently turn an existing installation into open registration.

## Decision

Make browser creation of the first `owner` the default installation flow. Only trusted local CLI or installer code can arm a random, expiring capability before the server loads. Deliver it through a local URL fragment, remove it from the address immediately, and accept it only in a dedicated setup POST. The new owner chooses the permanent password and receives the ordinary session.

Use a durable pending/closed marker independent of account storage. Treat persisted installation state conservatively, migrate existing account stores to closed state, and close bootstrap before writing any new account. Serialize all account mutations across processes and recheck the complete account directory during claim. Remote Mewlink/P2P cannot enroll an owner.

Separate the public listener address from the private setup address in CLI IPC. A Windows controller can request a fresh link over private local process channels while its host is running. Preserve explicit `--owner-email` and host account administration for local automation and recovery.

The [first-administrator contract](../development/first-owner-setup.md) owns token handling, API responses, storage, locking, recovery, and UI behavior.

## Alternatives

- Keep terminal email and temporary passwords: complicates a graphical installation and adds a redundant password change.
- Enable registration whenever no owner exists: allows account loss, deliberate deletion, or a non-owner-only store to reopen enrollment.
- Use the first unauthenticated visitor as owner: exposes a race to anyone who can reach a new host.
- Persist a raw setup link: makes recovery easier but leaves an account-creation credential in files or logs.

## Consequences

Fresh installation requires no terminal account entry. Existing users and ordinary authentication remain authoritative. Setup becomes unavailable after closure even if account files disappear, so interrupted writes and damaged state require local account recovery. The wizard must retain its trusted control channel to reopen or refresh setup; public HTTP cannot mint a replacement token.

Implementation and isolated verification are recorded in the [work record](../work/guided-installation-and-first-owner.md). Public release and clean-Windows acceptance are separate gates.
