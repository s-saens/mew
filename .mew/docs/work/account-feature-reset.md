---
title: "Account feature-default reset controls"
description: "Records the 2026-10-31 move from per-checkbox reset buttons to one account-header reset, atomic feature override removal, isolated UI/API/demo verification, and pending user application."
created: "2026-10-31"
updated: "2026-10-31"
---

## Purpose and resulting behavior

Replaced reset icons beside overridden feature checkboxes with one reset icon below each account's photo in the sticky feature-table header. The icon is enabled when the account has explicit overrides, including values matching its current role default. One click removes every feature override for that account and restores role inheritance. Checkboxes remain centered and individually editable. Guest has the same reset control; file-permission headers do not show it.

Added an owner-only bulk reset endpoint that applies the change in one atomic policy save and change notification. Other accounts, roles, profiles, and all workspace file rules are preserved. Failed requests retain the current matrix and permit retry. The demo mirrors the endpoint and includes guest defaults and feature restrictions.

The [accounts feature](../features/appearance-accounts-operations/accounts-roles-feature-permissions-and-guest-sharing.md), [access contract](../development/access-control.md), and [account guide](../../../docs/configuration/accounts.md) own current behavior. [Decision 0101](../decisions/0101-account-feature-reset.md) records atomic reset scope.

## Verification and outcomes

- `node --test server/account-access-ui.test.ts server/access-feature-reset.test.ts server/access-policy.test.ts src/demo/transport.test.ts src/demo/host.test.ts`: 27 passed, 0 failed, 0 skipped.
- The API test verifies owner/member/guest defaults, a single complete change notification, safe repeated reset, owner authorization, exact subject validation, and preservation of account data, other overrides, and file rules in multiple workspaces. Demo tests verify the same account and guest behavior and rejected requests.
- The isolated Chromium fixture checks one reset per account header, placement below its photo, disabled controls at defaults, absence of per-checkbox reset buttons, simultaneous restoration of multiple overrides, failure/retry, and no feature reset controls in the file table. Existing account photos, password reset, roles, deletion, and file controls also passed across light, midnight, and dark themes at 1366px, 390px, and 320px, including short-window popup checks.
- Reviewed desktop light and mobile midnight feature-table captures with synthetic accounts. The existing 64px account columns and centered checkboxes are preserved.
- `npx tsc -b` passed. Targeted `npx oxlint` over the changed source and test files succeeded with existing React warnings in i18n and the account-loading effect. The Impeccable detector reported no findings for the two changed account components.
- `npm run check:docs` and `git diff --check` passed.

No app build, deployment, launcher execution, or actual server start/restart was performed. The user must build and apply the change; actual-instance and physical-device verification remain pending.
