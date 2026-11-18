---
id: "mew-agents-runtimes"
parent: "mew-agents"
title: "AI runtime installation, authentication, and execution settings"
status: "implemented"
created: "2026-09-18"
updated: "2026-11-18"
status_hash: "ce50d3fa70fce93520dfd200e419db9b718cebd2b370a52a9250e624fc80aed1"
files: ["src/components/RuntimeInstallProgress.tsx", "src/components/AgentPanel.tsx", "src/components/RuntimeSettingsModal.tsx", "src/components/agentRuntimes.tsx", "server/agentRuntimes.ts", "server/agentRuntimeInstall.ts", "server/agentDefaults.ts"]
commits: []
description: "Feature contract for background runtime installation, the picker’s installation and update terminal buttons, executable readiness, authentication, and model, effort, and permission defaults. Covers failed attempts, provider-specific installers, and runtime settings."
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

- The runtime picker renders before the separate update check completes. Installed rows offer available, automatically supported individual updates. Codex and Claude map to their host CLI updates. The update action becomes a terminal button when a session starts. It stays available after completion while the session exists. The [update contract](../appearance-accounts-operations/application-updates-and-operations.md) owns session access and execution.

- Installation starts a server-side command and replaces the install action with a terminal button. The read-only popup polls output approximately once per second, follows new output, and preserves the scroll position while the user reads earlier output. Closing it leaves the attempt running. The picker stays open after installation so the user can inspect the result or select the installed runtime. Failed attempts retain their output and offer a retry.
- The server acknowledges background starts independently of installer completion. Attempt-specific reads return the outcome of the accepted installation even if a client connection is interrupted. The server keeps the latest attempt and its last 12,000 characters per runtime in memory. A retry replaces that attempt. See [ADR 0188](../../decisions/0188-agent-runtime-installation-attempts.md).
- Presence checks follow the executable selected for launch. If an account’s saved executable is missing and the default is installed, the picker directs the user to the executable setting. Saving or resetting settings refreshes the open runtime list. The [runtime guide](../../../../docs/configuration/agent-runtimes.md) lists provider and host prerequisites.

- The management section makes execution-settings reset and runtime removal visible. Each requires confirmation; unsupported automatic removals remain disabled with manual-removal guidance. Reset clears account-scoped execution settings, not saved model defaults or provider login.
- Runtime settings separate installation and account controls from advanced execution settings, explain Claude and Codex connector scope, and support clearing command/argument overrides and removing individual saved environment variables. Other masked values are preserved.
- The runtime settings dialog appears above the list through the shared `DialogFrame` body portal, and interactions inside it do not close the dropdown behind it.

- The input field's Save icon is centered in a transparent container with the same height as the adjacent dropdown. It now manages [saved prompt drafts](agent-input-mentions-skills-and-attachments.md#saved-prompt-drafts). Existing runtime defaults and their API remain available to session initialization.

- The composer settings row saves the selected model, effort, permission, Build, and Deploy as one account- and runtime-specific default. New tabs use the saved execution choices; existing tab-local choices remain intact. Session initialization applies the saved model, effort, and permission. The separate prompt button manages saved drafts.
- `AgentPanel` groups Codex's composite model list by base model. `AgentSession` synchronizes supported effort levels and actual model IDs on model changes, Thinking changes, and ACP configuration updates ([display contract](agent-conversations-queue-and-restoration.md#model-and-effort-selection)).
- Claude ACP configuration options provide the model and permission lists and supported effort levels on new or restored sessions and on later updates. Model changes use the advertised configuration option; queued message settings use the same interface. Older adapters that provide legacy model state continue to use the legacy model request.

<!-- mew:implementation:end -->

<!-- mew:validation:start -->
## Verification

- Use isolated installation commands to test stdout/stderr visibility before installation completes, rejection of duplicate installations, retention of failure logs, reset on retry, and success detection. Do not run actual provider installations.
- Verify that logs do not overflow horizontally on small screens, retain position when reading earlier logs, and stop polling after completion.

- Verify that the runtime list's settings dialog is not obscured by the list and remains open when interacting with input, save, and delete/logout confirmation dialogs.

- Verify that the prompt Save icon matches the height and centerline of the model, effort, and permission dropdowns.

- The following items are user verification criteria, not results of tests run during this documentation cleanup:
  - Review whether supported runtime selection, authentication status, and model defaults match the actual selections and whether failure causes are available.
  - Verify that the Codex model list has no duplicates by effort level and that the Thinking list and selected value match the supported range after changing models. Changing effort must preserve the model name.

- 2026-09-29: Passed a total of 32 mock ACP connection, model grouping, and isolated Chromium UI tests. Verified model deduplication, search selection, separate Thinking selection, and disabling when only one model is available at 1100px in dark mode and 390px in light mode. Also verified effort retention on model changes, supported-range changes, preservation of previous values on errors, and ACP configuration updates. Lint had only existing warnings, and documentation checks passed. The full type check failed due to 2 existing `document` reference errors in `server/agent-guidance-ui.test.ts`. Actual provider requests, deployment builds, and server restarts were not performed.

<!-- mew:validation:end -->
