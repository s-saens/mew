---
title: "0053 — Allow internal business use and restrict Mew sales and paid hosting"
description: "Switch new distributions of Mew's own code from MIT to a source-available license. Allow internal business use, modification, and free redistribution while restricting sales and paid hosting, and distinguish the rights holder's commercial use, existing MIT grants, third-party rights, and the scope of contribution acceptance."
created: 2026-10-23
updated: 2026-10-23
---

- Status: Adopted
- Partially supersedes the choice of MIT for new distributions of Mew's own code in [earlier ADR 0023](../history/decisions/0023-mew-selfhost-packaging-repo.md) and [earlier ADR 0112](../history/decisions/0112-mew-public-release-security-and-credential-boundaries.md). Installation and security decisions remain unchanged.

## Background

The creator intends to allow personal and internal company business use while restricting sales and paid hosting of Mew itself and retaining their own rights to offer it commercially. MIT permits sales and paid hosting, so it does not meet this requirement. The [previous review](../work/open-source-cloud-license-review.md) recorded the requirements but did not actually change the license.

## Decision

Set [Mew Source Available License 1.0](../../../LICENSE) as the terms for new distributions of Mew's own code. Place the same full text in the root, CLI, and remote desktop host, and use `SEE LICENSE IN LICENSE` in each package.json and in lockfile entries for the project's own packages. Do not change license metadata for third-party dependencies.

Allow personal and internal company use, revenue-generating work, private modifications for internal purposes, and free redistribution that preserves the terms. Also allow sales of outputs such as documents and code created with Mew; Mew code included in those outputs remains subject to its license.

Prohibit sales of Mew or modified versions and paid hosting, managed services, or SaaS offerings for third parties without separate written permission. Renaming, bundling, subscription fees, or other indirect charges cannot be used to bypass this restriction. Compensation for employees or contractors for internal use and general-purpose infrastructure costs are not prohibited. Fees for independent advice or support are allowed when they do not include selling Mew or providing paid operation of it.

Project owner `s-saens` retains the right to sell, provide paid hosting, and offer separate commercial licenses within the scope of rights they own or have separately obtained permission to exercise. This must not be interpreted as automatically assigning contributors' copyrights or changing rights to third-party code. Under the [contribution acceptance criteria](../../../docs/development/contributing.md), rights to offer external contributions commercially are verified separately.

## Rationale and Impact

- The [MIT text](https://opensource.org/license/mit) permits sales. AGPL also does not prohibit competitors from providing paid hosting, so it does not serve this purpose.
- Because commercial redistribution is restricted, label it source-available rather than presenting it as open source under the [OSI definition](https://opensource.org/osd).
- Include the actual full text in accordance with npm's [custom license notation](https://docs.npmjs.com/cli/v11/configuring-npm/package-json/). Check the copies, metadata, and package inclusion in the [publishing procedure](../operations/cli-release.md).
- Do not retroactively revoke rights already granted for code or versions lawfully received under MIT. Preserve the full previous MIT notice at the end of LICENSE and state that this notice does not grant MIT terms to new code. Forks from earlier versions remain possible.
- Preserve existing terms, notices, corresponding source, and replacement rights for third-party materials such as fonts, libraries, and reference code. This decision does not mean a full dependency audit or consent from external contributors has been completed.
- Actual npm publishing and GitHub releases are not performed as part of this change. Professional legal review of the nonstandard license's enforceability and rights ownership is separate.
