---
id: "mew-agents-account-usage"
parent: "mew-agents"
title: "View Connected Accounts, Subscriptions, and Usage"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-04"
status_hash: "1e4c050b97fab4559073b246c0c69f70ffdffecde6ba5a18e4cd996fd21bd2e0"
files: ["src/components/AgentAccountCard.tsx", "src/components/AgentQuotaBattery.tsx", "shared/agent-quota.ts", "server/agentAccount.ts", "server/agentUsage.ts"]
commits: []
description: "A feature contract covering the display of agent-connected accounts, plans, limits, session tokens, and API-equivalent costs. Describes the remaining-percentage battery, popups by period, differentiation between expired authentication and exhausted limits, and differences from subscription charges."
상위파일:
  - "MOC.md"
  - "_terminals-agents-automation.md"
---

## Requirements

- Check an agent's connected account and usage status.

### Scope

- Display accounts, plans, limits, session tokens, and API-equivalent costs for supported runtimes, and open official subscription pages.

- View the remaining percentage of the shortest aggregation-period limit for Codex, Claude, and Kimi Code directly in the rounded battery at the far right of the session toolbar.

- Click the battery number to view limits for all periods and models and reset times in a popup directly below it.
- Display each limit in the popup on one line in the order `기간 — 게이지 — 잔여율`.

### Boundaries and limitations

- Distinguish expired authentication from exhausted limits.
- Do not infer accounts or plans that the provider does not return, and do not treat API-equivalent costs as subscription charges.

### Detailed contracts

- [Runtime Settings](../../../../docs/configuration/agent-runtimes.md) · [Account and Limit Display Specification](agent-conversations-queue-and-restoration.md)

<!-- mew:implementation:start -->
## Implementation details

- Display accounts, plans, limits, session tokens, and API-equivalent costs for supported runtimes, and open official subscription pages.

- Normalize provider-published limits to a shared remaining percentage and select the shortest period. Display the battery with a number and background fill, distinguishing unavailable data from exhausted limits. Detailed refresh and display behavior follows the Account and Limit Display Specification.
- Use Claude's read-only SDK control queries; do not read the authentication store directly or send model prompts.

- Convert the battery into a keyboard-operable button and provide a popup for all limits, screen-boundary adjustment, and closing by outside press, Esc, or Back.

- Align the battery and surrounding icon buttons in the session toolbar on the same vertical centerline.
- The all-limits popup aligns the period, variable-width gauge, and remaining percentage on one line. Truncate long period and model names with an ellipsis and provide the full names in tooltips, keeping reset times below.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Verify that the connected account display and limit errors are distinguished, and that simply closing the subscription window does not trigger payment or resubmission of a task.
  - Verify that the period, gauge, and remaining percentage appear on the same line on desktop and mobile.

- 2026-10-04 automated verification: Passed 11 tests for selecting each provider's shortest period, remaining-percentage normalization, CLI read-only control, and desktop/mobile battery display, along with type, lint, document boundary, and link checks. Existing account popup regression tests also passed. A separate model/queue UI regression test failed while waiting for the Other model display after queue editing, and the same failure was reproduced with the code before the battery changes. An actual Claude subscription account could not be verified because this environment used an API key connection.

- 2026-10-04 all-limits popup: Passed automated verification for including additional buckets and per-model limits separately from summary selection, desktop/mobile screen boundaries, opening, and closing by pressing again, pressing outside, or pressing Esc.

<!-- mew:validation:end -->
