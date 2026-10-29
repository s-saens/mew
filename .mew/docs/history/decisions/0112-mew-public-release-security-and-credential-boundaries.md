---
provenance: "Migrated copy of a Liiiiv central ADR, 2026-10-14"
description: "Migrated decision record: mew public distribution uses secure defaults without collecting provider credentials. Preserves the choices and rationale at the time; decision 0053 partially supersedes the choice to newly distribute Mew itself under MIT."
title: "0112 — mew public distribution uses secure defaults without collecting provider credentials"
created: 2026-09-04
updated: 2026-10-05
---

- Date: 2026-09-04
- Status: Adopted
- Follow-up decision: [0195](0195-mew-account-based-p2p-remote-access.md) — Adds an opt-in account-based P2P access design (not implemented); local defaults, provider credential boundaries, and existing public security boundaries remain in place
- Partially supersedes: [0109](0109-mew-agent-authentication-and-loopback-browser.md) — The scope in which the Mew UI accepted Claude Code OAuth tokens and stored them in server runtime settings
- Decision makers: Song Sanghun (public distribution directive), Codex (security review and implementation)

- Follow-up decision: [0053](../../decisions/0053-source-available-license.md) — Replace only the choice to make new releases of Mew itself under MIT with source-available terms. Existing MIT grants, third-party rights, and the remaining decisions stay in effect

## Background

The pre-release review found three misaligned boundaries. The repository had no LICENSE granting redistribution rights, and tracked
assets whose original author prohibited redistribution. Mew also accepted Claude Code OAuth tokens through the browser and stored them in server files,
while link previews that fetched external URLs on the server and 500 MiB in-memory uploads expanded the public server's attack
surface.

## Options

1. Keep existing convenience features and provide cautions only in operational documentation—the public defaults remain vulnerable, and this does not resolve distribution
   rights for credentials and assets.
2. Remove problematic features from public paths or switch to secure defaults, and separately verify only the necessary external agreements.

## Decision

Adopt option 2.

- Include the MIT LICENSE in the repository again, and remove original and modified Oreo Cat assets whose redistribution rights have not been confirmed from the public
  tree and execution paths. Do not reintroduce the same assets. Use only code-based vectors created directly by repository contributors
  for the new mascot.
- The Mew UI and runtime configuration API do not collect or store `CLAUDE_CODE_OAUTH_TOKEN` or inject it into the spawn environment. Remove that key
  from existing data files when the server starts. Users must use a provider-owned login flow or official
  API credentials they manage themselves.
- Discontinue link previews that have the server request arbitrary external URLs on the user's behalf. Do not reintroduce them without a separate design that includes
  egress isolation, DNS/IP and redirect validation, and tests.
- Uploads use temporary disk storage, strict request limits, and per-user rate limits. The default server binding is loopback; external
  access must be explicitly configured through an HTTPS proxy or tunnel only.

## Rationale

The public repository's defaults must enforce least privilege even when exposed to untrusted networks. Because the product gives managers and owners
server shell access, no convenience feature may become a bypass for internal network requests or memory exhaustion. Credential and
third-party asset contracts cannot be resolved through code masking or attribution alone, so eliminating collection itself is the minimum
boundary required for distribution.

## Results

- Removing link previews and external OAuth token input reduces functionality. Public releases prioritize safety, and reintroduction requires
  a new ADR and security tests.
- Provider CLI and SDK redistribution and hosting terms, and copyright ownership for all contributors, cannot be verified through code. Before tagging
  a public release, maintainers must verify those contracts and contribution rights.
