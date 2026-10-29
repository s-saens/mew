---
title: "Remove footer guidance from notification settings"
description: "Records the removal of the monitoring-scope guidance paragraph and its text in four languages from notification settings on 2026-10-27, regression tests, and the scope not applied to production."
created: "2026-10-27"
updated: "2026-10-27"
---

Removed the long monitoring-scope guidance paragraph at the bottom of notification settings. Also deleted the unused text in four languages. The current display contract is owned by [Mewpet and notification features](../features/appearance-accounts-operations/mewpet-mascot-notifications-and-breaks.md). Permission status, the test button, the 3-second transition guidance, and actual notification behavior are retained.

All 13 checks in `node --test src/components/mewcat-notifications.test.ts src/utils/mewcat-notifications.test.ts` passed. The regression test verifies that the monitoring-scope paragraph is not displayed and that the test button and guidance remain.

`npx tsc -b` and `git diff --check` on the changed files passed, and the static UI review found no issues. `npm run check:docs` had no description errors but failed on 18 broken links created during existing documentation cleanup. The links in this work's document were checked directly.

The app was not built or deployed, and the server was not restarted. The user will apply the changes to the running UI.
