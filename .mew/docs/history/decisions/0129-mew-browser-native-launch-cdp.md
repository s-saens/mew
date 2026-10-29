---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Launch the general server browser directly, then connect via CDP. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0129 — Launch the general server browser directly, then connect via CDP"
created: 2026-09-10
updated: 2026-09-11
---

- Date: 2026-09-10
- Status: Adopted
- Subsequent decision: [0163](0163-mew-browser-virtual-display.md) — Linux/WSL windowed mode uses a dedicated virtual display by default; retain direct launch, CDP, and profiles
- Partially supersedes: [0127](0127-mew-browser-server-dom-runtime.md) — How Chromium is launched and connected for control with regular profiles
- Decision makers: Song Sanghoon (requested step-by-step login experiments and confirmed the results), Codex (DOM relay integration implementation)

## Background

The user wants to retain DOM relaying. Google login was rejected with the existing Playwright launch, but the user confirmed
successful login when Chromium was launched directly in WSL, when only a CDP connection was subsequently added, and when DOM recording
code was added as well. No specific launch flag is established as the cause of blocking.

## Decision

- For regular tabs and browser-based OAuth, launch Chromium processes directly with dedicated per-account profiles and connect via CDP.
- Do not apply Playwright's default launch option bundle. Retain the sandbox and do not override browser identifiers with scripts.
- Use only dynamic ports on server loopback for debugging connections. Connect only to the endpoint reported by the launched child process, and do not expose it to clients. Do not provide it through tunnels, web APIs, or public ports.
- Retain 0127 and [0128](0128-mew-browser-oauth-uses-internal-browser.md) for original-site DOM relay, account ownership, initial OAuth URL validation, and profile persistence. Do not introduce pixel streaming.
- Clean up the browser process and connection when the last user releases the profile or startup fails. Do not connect to existing personal browsers or manual-login profiles.
- The debugging port grants local processes control of the browser. Do not treat it as a means of isolation between server shell users.
- The legacy host-restricted authentication validation helper retains its existing execution and network boundaries, separate from regular profiles.

## Verification Boundaries

Google login at the direct launch, CDP connection, and DOM recording code stages is a user-confirmed
result. On 2026-09-11, the user also confirmed successful Google login in the actual DOM replay screen
inside Mew. Evidence for each stage, prior relay errors, and regression prevention criteria are kept in the [operations guide](../../operations/browser-dom-oauth.md).

A successful launch method was confirmed, but no single flag that caused blocking was identified. This is not
generalized to acceptance across all providers, accounts, and future environments, or to successful headless authentication.

The current functionality has been replaced with a standalone login video screen and localhost app access under [Decision 0023](../../decisions/0023-login-desktop-and-port-preview.md). This document is preserved as the rationale for the previous decision.
