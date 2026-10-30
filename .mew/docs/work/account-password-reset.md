---
title: "Account password reset implementation"
description: "Records the 2026-10-31 owner password reset UI and API, explicit token revocation, isolated authentication and demo verification, and the boundary before user build and application."
created: "2026-10-31"
updated: "2026-10-31"
---

## Purpose and resulting behavior

Added **Reset password** to other password accounts' popups in both account management permission tables. Confirmation issues a temporary password that the owner can select or copy before closing the popup. Failure leaves confirmation available for retry. Closing discards the returned value. During issuance, dialog dismissal and permission/path navigation are disabled so the popup remains mounted to receive the password. The current account continues to change its password in Settings; guest and Mewlink-only accounts have no reset action.

The owner-only API hashes the generated value, requires password replacement at the next password login, removes all stored browser tokens for the target, and emits access revalidation. Roles, profiles, ACLs, files, Git credentials, and external approvals remain intact. Existing approved Mewlink identity connections remain independent, while stored trusted-browser tokens are revoked. Explicit token removal also handles resets in the same millisecond a token was created. The browser demo uses a fixed placeholder and tab-local state.

The [accounts feature](../features/appearance-accounts-operations/accounts-roles-feature-permissions-and-guest-sharing.md) and [access contract](../development/access-control.md#owner-issued-password-resets) own current behavior; [decision 0100](../decisions/0100-owner-password-reset.md) records the authentication boundaries. The [account guide](../../../docs/configuration/accounts.md) explains use and delivery.

## Verification and outcomes

- `node --test server/account-access-ui.test.ts server/admin-password-reset.test.ts server/admin-users.test.ts server/auth.test.ts server/mewlink-identities.test.ts src/demo/transport.test.ts src/demo/host.test.ts`: 43 passed, 0 failed, 0 skipped.
- API coverage includes unauthorized roles, missing and external-only accounts, self-reset rejection, another owner's reset, repeated resets, frozen-clock same-millisecond revocation, immediate temporary-password login, mandatory change before work access, successful replacement, and preservation of profile, permissions, Git credentials, and external approvals. Existing account deletion and authentication checks passed after extracting the session-only revocation helper.
- The isolated Chromium fixture checks confirmation/cancellation, pending dismissal and navigation guards, failed reset and retry, selectable/copyable passwords, and disposal on close across light, midnight, and dark themes at 1366px, 390px, and 320px. Both permission tables expose the action. A delayed reset in a nested file path checks that the parent-folder control cannot unmount the popup before the response. Existing avatar, role, file permission, and deletion checks also passed.
- Reviewed desktop light and mobile midnight password-result captures using synthetic accounts and placeholder passwords. No real account credentials or production data were used.
- Demo tests verify role and account restrictions, account/ACL preservation, newly created password accounts, and isolation/reset of tab-local state without real credentials.
- `npx tsc -b` passed. Targeted `npx oxlint` over the changed source and test files exited successfully with existing React warnings in the app, i18n, and account-loading effects. The Impeccable detector reported no findings for the three changed account components.
- `npm run check:docs` and `git diff --check` passed.

No app build, deployment, launcher execution, or actual server start/restart was performed. The user must build and apply the change. Actual-instance and physical-device verification remain pending.
