---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Codex OAuth proceeds through the loopback callback using a restricted server browser. Preserves the choices, rationale, and subsequent changes at the time; see the Mew owning document for the current contract."
title: "0121 — Codex OAuth proceeds through the loopback callback using a restricted server browser"
created: 2026-09-07
updated: 2026-09-11
---

- Date: 2026-09-07
- Status: Adopted
- Follow-up decision: [0126](0126-mew-codex-auth-dom-remoting-pilot.md) — Authentication through fetch, rewriting, and an iframe
- Follow-up decision: [0128](0128-mew-browser-oauth-uses-internal-browser.md) — Temporary context restricted to Codex-specific hosts; retain official codex login
- Partially supersedes: [0109](0109-mew-agent-authentication-and-loopback-browser.md) — The provision restricting Codex login to device-code and the connecting device's external browser
- Partially supersedes: [0110](0110-mew-declarative-agent-authentication-jobs.md) — Codex's `codex login --device-auth` execution contract
- Partially supersedes: [0116](0116-mew-oauth-agent-logins-use-external-browser.md) — The provision opening Codex OAuth in the connecting device's top-level browser
- Decision makers: Song Sang-hoon (direction and physical-device verification), Codex (design and implementation)

## Background

The default `codex login` run on the Mew server prints a browser OAuth URL and opens a `localhost` callback
listener. Approving in a regular browser on a remote phone fails because the callback goes to the phone's localhost, but testing
on a physical device confirmed that entering the callback URL in Mew's built-in browser forwards it to the
server loopback and completes login. The existing device-code flow requires additional configuration and
code entry, making it more cumbersome than regular OAuth.

Official OpenAI documentation also defines the default Codex CLI login as running `codex login` and then completing the browser flow. However,
the existing Mew browser allows only loopback destinations because of its SSRF boundary, so regular browser
tabs must not be opened up as general-purpose external proxies.

## Options

1. Keep Codex device-code — safe, but prevents use of the simple default OAuth flow verified by the user.
2. Allow all external addresses in the built-in browser — the flow is simple, but it creates a general-purpose SSRF and credential
   proxy surface outside manager and owner shell permissions.
3. Open only URLs issued by registered Codex login tasks in server browser sessions, limiting destinations
   to authentication hosts and loopback.

## Decision

Adopt option 3.

- The registered Codex login command is `codex login`. It uses the official default browser OAuth flow without
  passing `--device-auth`.
- After finding a URL in the browser-based authentication task's pane that passes the registry allowlist, the server
  issues a short browser capability URL tied to the account and authentication task.
- That browser session requests only the registry's HTTPS authentication hosts and `localhost`, 127/8, and `::1`. Even if
  a signed URL is tampered with to specify another origin, the server's session allowlist blocks it.
- The login page opens in a one-time built-in browser within the agent authentication screen. External
  addresses are not persisted in regular Browser panel tabs or localStorage.
- When OAuth invokes the loopback callback, the same server browser session sends the request to the Codex CLI's local listener.
  When the CLI exits with 0, Mew closes the authentication browser and retries ACP authentication in
  the same tab to return to the chat screen.
- The general-purpose Browser panel remains loopback-only. Other runtimes do not use this path without separate verification
  and registration.

## Rationale

The Codex CLI continues to own the OAuth client, PKCE, and token storage. Mew only handles browser forwarding between the registered
command's output and the server loopback, so it does not duplicate the token exchange contract. Using
task-specific allowlist capabilities instead of a general-purpose external proxy provides the server-side OAuth users requested
while preserving the default SSRF boundaries of 0109 and 0112.

## Results

- The task may fail if the authentication provider rejects the sandbox fetch proxy or moves to a new host. Hosts are added
  only in the registry after reviewing both the actual OAuth flow and security boundaries.
- Reintroducing device-code for environments where default OAuth is unavailable is not prohibited, but it will not return
  as the default button.
