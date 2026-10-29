---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: Browser-based OAuth uses the shared internal server browser. Preserves the choices, rationale, and subsequent changes from that time; consult the Mew owning document for the current contract."
title: "0128 — Browser-based OAuth uses the shared internal server browser"
created: 2026-09-09
updated: 2026-09-09
---

- Date: 2026-09-09
- Status: Adopted
- Partially supersedes: [0110](0110-mew-declarative-agent-authentication-jobs.md), [0116](0116-mew-oauth-agent-logins-use-external-browser.md) — Opening an external device tab for browser authentication
- Partially supersedes: [0126](0126-mew-codex-auth-dom-remoting-pilot.md), [0127](0127-mew-browser-server-dom-runtime.md) — The scope in which only Codex authentication runs in a separate host-restricted temporary context
- Decision makers: Song Sanghoon (directed that all browser-based OAuth be unified in the internal browser), Codex (implementation)

## Decision

- Authentication methods marked `browser` in the registry use the shared internal server Chromium DOM browser. This currently applies to Codex, Kimi Code `.com` and `.ai`, and Cursor CLI. Apply the same rule to browser methods added in the future.
- Retain registered HTTPS host validation when obtaining the initial authorization URL from CLI output. Run subsequent login, SSO, callbacks, and popups in the same server profile as the regular internal browser. Do not arbitrarily guess and rewrite provider resource host lists or bypass this flow with an external device tab.
- Bind authentication tabs and their popups to the authentication job and separate them from the regular tab list. Clean up the job's tabs on completion, failure, cancellation, or expiration. Site login state remains in the regular browser profile for each account, and the official CLI continues to own CLI credentials and token exchange.
- ACP URL authentication requests also use the same internal browser when the user opens them. If browser creation fails, do not send an approval response; show a retry error.
- Display device authorization codes and SSO popups in the internal authentication screen. If a site requires surfaces outside the DOM or rejects automation, success is not guaranteed, and pixel streaming will not be introduced.
- Terminal authentication that selects providers, keys, and models in a TUI, and API key entry, retain their existing contracts. Do not reclassify terminal itself as a browser method.

## Scope

Retain manager and owner permissions and account ownership checks. Follow [0127](0127-mew-browser-server-dom-runtime.md) for the general server browser's network and profile boundaries. Do not reintroduce the former external-tab reservation approach for browser-based authentication.

The current functionality has been replaced with a standalone login video screen and localhost app access under [Decision 0023](../../decisions/0023-login-desktop-and-port-preview.md). This document is preserved as the rationale for the previous decision.
