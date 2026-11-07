---
title: "Account and runtime composer defaults"
description: "Saves composer model, effort, permission, Build, and Deploy choices together per account and runtime, while preserving tab-local execution choices and queued message snapshots."
created: "2026-11-07"
updated: "2026-11-07"
---

## Status

Accepted. Extends [ADR 0153](0153-agent-composer-execution.md) with saved initial Build and Deploy choices.

## Context and decision

Users need to reuse a set of composer settings for each agent without sharing them with other accounts. The composer saves the current model, effort, permission, Build, and Deploy choices in the existing account-scoped runtime defaults. New tabs with no local execution preference read the saved execution choices. Existing tab-local choices and queued message snapshots remain independent. The existing session initialization applies model, effort, and permission defaults.

Keeping execution choices only in tab-local storage would not carry them to new tabs or devices. Making every toggle change an account default would also overwrite a user's intended default during a temporary change. An explicit save action preserves both uses. Existing records without execution options retain the previous Build-on and Deploy-off defaults.

## Consequences

The default follows the account across projects and devices and is separate for each runtime. An existing tab keeps its local execution choices even after the default changes. A failed read leaves the previous fallback available; a failed save is reported. Provider availability and project execution restrictions remain authoritative. The [feature contract](../features/terminals-agents-automation/ai-runtime-installation-authentication-and-settings.md) describes the controls.
