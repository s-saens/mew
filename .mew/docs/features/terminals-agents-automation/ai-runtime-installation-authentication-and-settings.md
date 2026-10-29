---
id: "mew-agents-runtimes"
parent: "mew-agents"
title: "AI runtime installation, authentication, and execution settings"
status: "implemented"
created: "2026-09-18"
updated: "2026-10-20"
status_hash: "ce50d3fa70fce93520dfd200e419db9b718cebd2b370a52a9250e624fc80aed1"
files: ["src/components/RuntimeInstallProgress.tsx", "src/components/AgentPanel.tsx", "src/components/RuntimeSettingsModal.tsx", "src/components/agentRuntimes.tsx", "server/agentRuntimes.ts", "server/agentRuntimeInstall.ts", "server/agentDefaults.ts"]
commits: []
description: "Feature contract covering supported agent runtime selection, installation progress logs, removal, authentication, and defaults for models, effort, and permissions. Describes ACP and official CLI interfaces, along with provider-specific settings and authentication support."
상위파일:
  - "MOC.md"
  - "_terminals-agents-automation.md"
---

## Requirements

- Select a supported agent runtime and manage the settings required to run it.
- Actual output and failure causes during installation are available in the selector and settings dialog.

### Scope

- Provides runtime selection, supported installation/removal, login/logout, execution settings, and defaults for models, reasoning, and permissions.
- The Codex panel lists each model once, with its effort level selected from the adjacent Thinking dropdown.

### Boundaries and limitations

- ACP chat and official CLI terminal interfaces, along with installation and authentication support, vary by runtime.
- Do not infer and display settings or authentication features that the provider does not offer.

### Detailed contracts

- [Runtime settings](../../../../docs/configuration/agent-runtimes.md) · [Panel and login display contract](agent-conversations-queue-and-restoration.md)

<!-- mew:implementation:start -->
## Implementation details

- Selector rows and the settings dialog display installation status and logs using the shared `RuntimeInstallProgress`. They poll approximately every 1 second and stop after completion. Height-limited logs follow new output while preserving the scroll position when reading earlier logs. Progress is queried again on refresh or reentry.
- The server keeps the latest installation status and the last 12,000 characters of output for each runtime in memory. It resets them on retry, and Antigravity also outputs download size and percentage, verification, and extraction stages.

- The runtime settings dialog appears above the list through the shared `DialogFrame` body portal, and interactions inside it do not close the dropdown behind it.

- The input field's save-default icon is centered in a transparent container with the same height as the adjacent dropdown.

- Provides runtime selection, supported installation/removal, login/logout, execution settings, and defaults for models, reasoning, and permissions.
- `AgentPanel` groups Codex's composite model list by base model. `AgentSession` synchronizes supported effort levels and actual model IDs on model changes, Thinking changes, and ACP configuration updates ([display contract](agent-conversations-queue-and-restoration.md#model-and-effort-selection)).

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- Use isolated installation commands to test stdout/stderr visibility before installation completes, rejection of duplicate installations, retention of failure logs, reset on retry, and success detection. Do not run actual provider installations.
- Verify that logs do not overflow horizontally on small screens, retain position when reading earlier logs, and stop polling after completion.

- Verify that the runtime list's settings dialog is not obscured by the list and remains open when interacting with input, save, and delete/logout confirmation dialogs.

- Verify that the save-default icon matches the height and centerline of the model, effort, and permission dropdowns.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Review whether supported runtime selection, authentication status, and model defaults match the actual selections and whether failure causes are available.
  - Verify that the Codex model list has no duplicates by effort level and that the Thinking list and selected value match the supported range after changing models. Changing effort must preserve the model name.

- 2026-09-29: Passed a total of 32 mock ACP connection, model grouping, and isolated Chromium UI tests. Verified model deduplication, search selection, separate Thinking selection, and disabling when only one model is available at 1100px in dark mode and 390px in light mode. Also verified effort retention on model changes, supported-range changes, preservation of previous values on errors, and ACP configuration updates. Lint had only existing warnings, and documentation checks passed. The full type check failed due to 2 existing `document` reference errors in `server/agent-guidance-ui.test.ts`. Actual provider requests, deployment builds, and server restarts were not performed.

<!-- mew:validation:end -->
