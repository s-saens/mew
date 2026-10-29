---
title: "mew open-source release preparation implementation plan"
created: 2026-09-04
updated: "2026-10-29"
description: "Original text of the previous public release preparation plan. Preserves the licensing, asset, security hardening, and release gate proposals from that time; current licensing and contracts follow subsequent decisions and owning documents."
---

The governing decisions are [ADR 0112](../history/decisions/0112-mew-public-release-security-and-credential-boundaries.md) and [ADR 0111](../history/decisions/0111-mew-native-deployment-and-supervisor.md). The repository's
[README](../../../README.md) is the reference for installation and operations procedures, and
the [security document](../../../docs/operations/security.md) is the reference for permission boundaries.

This document is a record preserving the plan from that time. Current licensing follows [Decision 0053](../decisions/0053-source-available-license.md); do not apply the plan below as current execution instructions.

## Scope of this implementation

1. Restore the MIT LICENSE and package metadata, and exclude external images and original archives that prohibit redistribution from public
   release.
2. Replace Mewcat with an original code-based vector mark, and hide the existing asset names, sprite contract, and stored Oreo skin
   values for compatibility.
3. Prohibit and clean up server-stored OAuth tokens, and remove server-side fetching of external URLs.
4. Move uploads to temporary disk streams and limit their size and count. Block Git revert for guests, and apply
   CSP, HSTS, Permissions-Policy, and loopback binding by default.
5. Record unit test, build, documentation check, and dependency audit results in the release checklist.

## Release gates

- Pass `npm test`, `npm run lint`, `npm run build`, docs health, and the repository documentation allowlist check.
- Generate and review dependency audit and SBOM/third-party notice artifacts from the release commit. Check native and platform packages
  against the actual deployment OS.
- Verify a fresh server installation with a dedicated non-administrator user, `MEW_BIND=127.0.0.1`, an HTTPS proxy/tunnel, and separate workspace and data directories. Development
  servers and direct public port exposure are prohibited.

## Checks that code cannot replace

The following two items cannot be determined automatically through technical means, so the **maintainer who creates the public release tag** must verify them.

1. Whether all contributors have the right to distribute under MIT, including externally sourced code, fonts, designs, and company-owned contributions.
2. Whether the way Claude Code/Anthropic and other optional agent SDKs are bundled, hosted, or relayed in the product complies with the
   respective provider agreements. Until this is confirmed, Mew must not collect or store provider OAuth bearer tokens.

These two confirmations concern legal facts requiring human signatures and contractual authority, so automation must not replace them. If confirmation remains
incomplete, disable or exclude the relevant provider runtime from the public release.
