---
title: "0185: Configure shared agent task defaults during first-run setup"
description: "Accepts first-owner agent setup before remote-access onboarding and installation-wide Agent Set defaults for Mew assistant, AI Commit, scheduled tasks, and Create with AI, with owner-controlled writes and per-task selection."
status: accepted
date: "2026-11-17"
---

# 0185: Configure shared agent task defaults during first-run setup

## Context

First-owner onboarding previously moved directly to remote-access choices under [ADR 0179](0179-unattended-npm-installation.md). Agent-backed features need a runtime and an Agent Set, but their setup was scattered across individual task flows. A new owner needs to see the available runtimes and choose defaults before using those features.

## Decision

After first-owner creation, show agent setup before the existing remote-access popup. Owners can reopen it from **Menu → Agent Set**. Reuse the runtime installation and settings controls and the existing Agent Set editor.

Store task-to-set defaults once per installation for the Mew assistant, AI Commit, scheduled tasks, and Create with AI. Users with agent access can read them; changing them requires an owner with agent access. Each task retains its own selection flow and can use a different set. A missing or deleted set leaves the corresponding default unassigned.

This extends ADR 0179's onboarding order. It does not change the first-owner enrollment or remote provider authorization boundaries.

## Alternatives and rationale

Keeping setup only inside each task would require repeating discovery and configuration. Account-specific defaults would provide individual preferences but would not give the owner one shared starting configuration for the installation. Mandatory defaults would prevent users from entering the workspace before choosing a provider; unassigned tasks retain their existing selection flow.

## Consequences

Owners can prepare shared defaults without creating a project. A changed default affects subsequent task selection across accounts, so write access is restricted to owners. Runtime installation and provider authentication remain separate, and availability depends on the host and provider. Local verification and deployment limits are recorded in the [work record](../work/first-run-agent-setup.md); current behavior belongs to the [Agent Set contract](../features/terminals-agents-automation/agent-sets-and-tab-creation.md).
