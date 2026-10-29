---
id: "mew-agents-scheduled-jobs"
parent: "mew-agents"
title: "Recurring Scheduled Tasks"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-14"
status_hash: "22df98974f68c23b059856338742901e4fe6b29962fd3ba08bfcaaee9009b0db"
files: ["src/components/ScheduleModal.tsx", "server/schedules.ts", "server/runAgentJob.ts"]
commits: []
description: "Feature contract for repeatedly running prompts using a folder and an agent set's runtime, model, and roles. Describes creation, editing, deletion, running immediately, dedicated-session output, and the execution, update, and verification boundaries of POSIX crontab and Windows per-user Task Scheduler."
상위파일:
  - "MOC.md"
  - "_terminals-agents-automation.md"
---

## Requirements

- Periodically run prompt tasks using the configured folder and the agent set's runtime, model, and roles.

### Scope

- Provides scheduled task creation, editing, deletion, Run Now, and output viewing in dedicated sessions.
- The popup can be closed with the X button in the upper-right corner.

### Boundaries and limitations

- This is separate from one-time scheduled messages in agent tabs.
- Follows the current limitation of sending input to the same session when the execution interval is shorter than the task duration, as well as the log management rules.

### Detailed contracts

- [Commands and Scheduled Tasks](../../../../docs/guides/commands.md)

<!-- mew:implementation:start -->
## Implementation details

- POSIX retains the existing user crontab. On Windows, a single per-user Task Scheduler entry running as the current user with standard privileges reads the 5-field cron expressions and PowerShell commands in `windows-schedules.cron` every minute. It prevents duplicate execution within the same minute and updates the registered runner path at server startup after the npx executable changes. Actual OS task registration and verification of logout, sleep, and long-running execution are application gates in the [Windows Execution Contract](../../development/windows-native.md).

- A shared X icon, translated accessible name, and tooltip appear to the right of the title, and the button is disabled during saving, like the existing close path.
- The list prominently displays the execution time to the left of the title, with the recurrence interval, agent set, project, and last run below the title. Schedules without a fixed time display the execution interval or cron expression on the left. Spacing between the popup, items, and edit fields remains compact.
- Execution interval, agent set, and project selections use shared custom dropdowns, and selections remain drafts until saved.
- Inputs, selectors, day-of-week controls, and bottom buttons use a height of 44px. The name and task content span the full width; the set and project use 2 columns on desktop and 1 column on mobile.
- Manual input mode for the execution interval is retained even when the current cron expression matches a standard interval.
- Saving a schedule stores a snapshot of the agent set on the server so that recurring execution and Run Now use the same model and roles. Changes to the set are applied when the schedule is saved again; existing snapshots of deleted sets and older runtime-only schedules are retained. New schedules require an agent set selection.

- Provides scheduled task creation, editing, deletion, Run Now, and output viewing in dedicated sessions.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- User verification criteria: Verify that the upper-right X closes the popup and is disabled during saving.
- User verification criteria: Verify on desktop and mobile that the execution time on the left and information below the title are readable, and that long project names and cron expressions do not overflow the screen.
- 2026-10-03: Checked the list and edit screens in isolated Chromium at 1100px in dark mode and 390/320px in light mode, and passed existing regression checks for dropdowns, drafts, disabling during saving, and mobile overflow. Targeted lint and design detection checks also passed.
- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Check agent set selection, saving, reopening, and the state with no sets; mobile layout for long project names; and input heights for all execution intervals.
  - Verify that scheduled and manual runs use the same settings and preserve unrelated user crontab entries.

- 2026-09-28: In isolated Chromium at 1100px in dark mode and 390/320px in light mode, verified field heights, keyboard and touch selection, drafts before saving, disabling during saving, manual input, new schedules without a set, and display of deleted sets. Server tests verified snapshot storage, file cleanup, preservation of existing schedules, passing models and roles, and stopping execution on model failure. Type, translation, and documentation checks passed; actual cron registration and provider calls were not performed.

<!-- mew:validation:end -->
