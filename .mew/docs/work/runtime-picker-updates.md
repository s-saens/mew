---
title: "Runtime picker installation and update actions"
description: "Records lazy update discovery, live install and update output from the picker, provider executable discovery, the standalone Codex update fix, and local verification and rollout limits."
created: "2026-11-18"
updated: "2026-11-18"
---

The runtime picker now renders its installed runtimes before update discovery finishes. Available, automatically supported updates appear on installed rows and use the existing individual update jobs. Codex and Claude refer to their host CLIs. The [runtime contract](../features/terminals-agents-automation/ai-runtime-installation-authentication-and-settings.md) and [user guide](../../../docs/configuration/agent-runtimes.md) describe the behavior and permission boundary.

Local verification: `npm run build` passed, including TypeScript; `npm run lint` passed with warnings. An isolated browser test passed for deferred discovery, unavailable updates, CLI mapping, and execution errors. The existing `server/updates.test.ts` had eight passes and one failure: its release installer expectation still names the former npm package. `npm run check:docs` validated descriptions but reported 39 existing missing or invalid links, including the absent decisions README. No provider update or deployment was performed. The build updates client assets served from `dist`; server lifecycle operations were not performed. Real provider updates and device presentation remain unverified.

## Installation and update terminal follow-up

The investigation reproduced a remote request deadline before a slow installation could finish. It also found a saved executable path blocking the detected Kimi CLI and an incompatible Node being selected by OpenClaw's package installation. The picker now opens live and retained output from the terminal button. Installation uses the background attempt contract from [ADR 0188](../decisions/0188-agent-runtime-installation-attempts.md). New installs use provider-specific setup and executable search paths. Standard Unix Cursor updates use its public installer. See the [feature contract](../features/terminals-agents-automation/ai-runtime-installation-authentication-and-settings.md) and [runtime guide](../../../docs/configuration/agent-runtimes.md).

Local verification passed 65 tests for installation, provider fixtures, update jobs, release packaging, and client transport. Seven Chromium checks passed for the picker, settings, and update dialogs at desktop and mobile widths. `npm run build` passed, including type checking. `npm run lint` completed with warnings. The documentation check validated descriptions and reported the same 39 link errors as before. A broader agent tab test timed out in the pre-install swipe step on both the original and changed sources. Provider installations used fixtures. Actual provider installs, physical-device and native Windows or macOS acceptance, and running-server application remain pending.

## Standalone Codex update detection

On 2026-11-18, the host ran standalone Codex CLI 0.169.0. The picker hid its update action because the catalog had no update command for that installation. The [update contract](../features/appearance-accounts-operations/application-updates-and-operations.md#implementation-details) now covers how Mew discovers and updates official standalone installations.

A read-only check with the host CLI reported 0.170.0 as available and actionable. The catalog regression and update browser tests passed all 13 cases. The build and lint passed with warnings. The documentation checker validated descriptions and reported 39 existing broken links. Applying the server change and installing the Codex update remain pending.
