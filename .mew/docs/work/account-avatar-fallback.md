---
title: "Account avatar initial fallback"
description: "Records the 2026-10-31 correction of missing and failed account photos to display initials, regression coverage for both permission tables and account popups, and local verification before user build and application."
created: "2026-10-31"
updated: "2026-10-31"
---

## Purpose and result

Account management previously displayed a generic person icon when a profile photo was absent or could not load. Both permission table headers and their account popups now show the uppercase first Unicode code point of the trimmed display name, falling back to the account ID for a blank name. Valid photos remain visible and a changed photo URL can replace a failed image. Guests retain the group icon.

The [accounts feature contract](../features/appearance-accounts-operations/accounts-roles-feature-permissions-and-guest-sharing.md) owns current behavior. This is a presentation correction; account storage and permissions are unchanged.

## Verification and application

- Added assertions to `server/account-access-ui.test.ts` and reproduced the failure before the implementation change: the missing-photo account did not display its initial.
- `node --test server/account-access-ui.test.ts server/access-policy.test.ts`: 2 passed, 0 failed, 0 skipped. The isolated Chromium fixture checks missing/broken photos and popup initials in both permission tables across light, midnight, and dark themes at 1366px, 390px, and 320px. It also covers blank names, Korean and supplementary Unicode initials, valid photo replacement after failure, and the guest icon. The API test confirms profile image data remains present in access rows.
- Reviewed the desktop light and mobile midnight permission table captures from the isolated fixture. No real account data was used.
- `npx tsc -b` and targeted `npx oxlint src/components/account-column-headers.tsx server/account-access-ui.test.ts` passed. The Impeccable detector reported no findings for the changed component.
- `npm run check:docs` and `git diff --check` passed.

No app build, deployment, launcher execution, or server start/restart was performed. The user must build and apply the change; actual-instance and physical-device verification remain pending.
