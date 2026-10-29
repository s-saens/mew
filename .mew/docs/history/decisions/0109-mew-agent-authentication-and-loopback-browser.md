---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Use device codes and server tokens for agent authentication, and restrict the browser window to loopback. Preserves the choices, rationale, and subsequent changes at the time; consult the Mew owning document for the current contract."
title: "0109 — Use device codes and server tokens for agent authentication, and restrict the browser window to loopback"
created: 2026-09-03
updated: 2026-09-11
---

- Date: 2026-09-03
- Status: Adopted
- Follow-up decision: [0110](0110-mew-declarative-agent-authentication-jobs.md) — Gemini device-code generalization and authentication jobs
- Follow-up decision: [0112](0112-mew-public-release-security-and-credential-boundaries.md) — Claude subscription token collection and storage
- Follow-up decision: [0121](0121-mew-codex-oauth-through-scoped-server-browser.md) — Codex device-code
- Follow-up decision: [0127](0127-mew-browser-server-dom-runtime.md) — general browser loopback restriction and prohibition on DOM relay
- Follow-up decision: [0128](0128-mew-browser-oauth-uses-internal-browser.md) — external tab for browser OAuth; the prohibition on general-purpose HTML rewriting proxies remains
- Supersedes: [0108](0108-mew-server-fetch-device-render-browser-proxy.md) — abolishes the browser window's arbitrary HTTP(S) proxy scope
- Partially supersedes: [0072](0072-mew-agent-gui-authentication.md) — specifies the server execution host, device codes, and Claude server token flow in the agent login UI
- Decision makers: Song Sanghun (request), Codex (design and implementation)

## Background

The Mew agent CLI runs on the server, but users open Mew on phones on other networks. If Google, Claude, and Gemini login is handled like
regular web browsing through a server-fetch, device-render browser proxy, the target sees the server IP, while TLS, browser fingerprints, and
iframe context are mixed with the phone's. This is not a general solution for passing Google's anti-bot checks or OAuth providers' embedded-browser policies,
and it unnecessarily expands the SSRF surface for requesting arbitrary URLs from the server.

## Options

1. Continue expanding the general-purpose proxy — exposes the server IP, but requires reimplementing each provider's browser policies and cannot guarantee compatibility.
2. Relay server Chromium's display again — provides a consistent fingerprint, but mobile interaction becomes remote screen control and incurs browser operating costs.
3. Relay the provider CLI's device-code, external URL, and server token contracts through the agent login screen, and restrict browser windows to local development servers.

## Decision

Adopt option 3.

- The agent authentication center opens provider-requested URLs only in **a regular new tab on the phone**. Mew's internal browser and iframes are not used
  for OAuth; the provider page owns URL approval and device code entry.
- The fixed terminal auth flows for Codex and Gemini CLI run on the Mew server and display a device code and URL. When the user approves in the phone browser, the CLI
  writes the authentication result to the server's existing credential store, and Mew opens a new ACP session.
- [ADR 0112](0112-mew-public-release-security-and-credential-boundaries.md) supersedes the scope that accepted Claude Code subscription tokens in the authentication center and stored them in server runtime settings.
- The Mew browser window and `/browser` popup relay only HTTP(S) and WebSocket traffic for `localhost`, `127.0.0.0/8`, and `::1` through the server. This is for previewing WSL/host
  development servers and the Android gateway. They do not provide a general-purpose proxy for the public internet, private networks,
  or OAuth callbacks.

## Rationale

The provider CLI already owns the token issuance, refresh, and storage contract. By mediating this flow, Mew can connect credentials to agents running on the server
without replicating each provider's OAuth callbacks and fingerprints. Retaining the loopback tool preserves the existing use case of
viewing WSL development servers from a phone.

## Results

- Mew does not attempt to solve proxy blocking by sites such as Google due to a mismatch between the server IP and mobile browser fingerprint. **Expanding
  the general-purpose web proxy or using a remote display is not a retry path for this authentication problem.** If a provider does not offer official
  device-code, manual-code, or server-token options, add that provider's supported server authentication method separately.
- Entering a non-loopback address in the browser window is explicitly rejected. Agent authentication URLs open in a regular top-level browser window instead
  of the internal browser.
