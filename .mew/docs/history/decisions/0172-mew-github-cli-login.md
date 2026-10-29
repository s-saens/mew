---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: GitHub login in the Git panel shares official CLI credentials. Preserves the choices, rationale, and subsequent changes from that time; consult Mew's owning documents for the current contract."
title: "0172 — GitHub login in the Git panel shares official CLI credentials"
created: 2026-09-23
updated: 2026-09-23
---

- Date: 2026-09-23
- Status: Adopted
- Follow-up decision: [0179](0179-mew-account-git-connections.md) — per-account OAuth, token storage, authorship, and remote execution; replaces existing OS-shared authentication
- Decision makers: Song Sanghun (requested GitHub login in the Git panel), Codex (implementation)

## Background and options

The Git panel currently has no authentication entry point, so users must connect their accounts in a separate terminal. We considered creating a Mew-specific OAuth app and token store or integrating authentication through the official GitHub CLI. We choose the CLI approach because it uses the same authentication as existing server Git and requires no separate app registration or token management.

## Decision

- The Git panel provides device code authentication through the official `gh auth login`. Do not create a separate OAuth app or token store. After authentication, configure the github.com HTTPS Git credential helper with `gh auth setup-git`.
- Credentials are shared by the same server OS account used by existing Git and terminal operations. Explain the sharing scope in the UI and do not describe it as per-account Git isolation in Mew. Only the requesting Mew account can access the active code and approval browser, and only one login at a time is allowed across the server.
- Check Git permissions and access to all project files, and also check browser permissions when starting authentication or opening the browser. The initial URL is the fixed device approval address on github.com. Preserve the internal browser, account profile, and popup cleanup boundaries in [ADR 0128](0128-mew-browser-oauth-uses-internal-browser.md).
- The CLI owns token exchange and storage. Mew does not return raw CLI output or tokens to the client. Do not overwrite environment-variable authentication with browser login.
- Clean up the process and authentication tab on cancellation, failure, or expiration after 15 minutes. Closing the window or refreshing the browser does not cancel authentication. Authentication task restoration across server restarts is not provided.
- Do not change SSH keys, remote URLs, or Git authors. Enterprise, account switching, a logout UI, and adding push/pull are outside this scope.

## Rationale and current contract

In the current architecture, where Git operations run under the server OS account, storing only Mew-specific tokens would cause authentication state to differ from the terminal, clone operations, and other uses. Integrate the official CLI to handle authentication and storage, and show users when the CLI is not installed or the internal browser is restricted.

Detailed usage, APIs, and validation scope are documented in [Mew GitHub Login](../../../../docs/guides/projects.md#github-login). Official references are [gh auth login](https://cli.github.com/manual/gh_auth_login) and [gh auth setup-git](https://cli.github.com/manual/gh_auth_setup-git).
