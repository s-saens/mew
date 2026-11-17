---
title: "First-run agent setup"
description: "Records the first-owner agent setup, installation-wide task defaults, local verification, and runtime application limits."
updated: "2026-11-17"
---

# First-run agent setup

## Purpose and result

Introduce agent configuration before remote-access setup after the first owner is created. The same popup is available from **Menu → Agent Set**. It shows ACP runtime installation status and supported installation and settings, manages agent sets, and assigns installation-wide defaults for the Mew assistant, AI Commit, scheduled tasks, and Create with AI. Individual tasks can use another set.

[ADR 0185](../decisions/0185-agent-setup-task-defaults.md) records the shared-default and onboarding decision. The current contracts are [agent sets and task defaults](../features/terminals-agents-automation/agent-sets-and-tab-creation.md), [runtime configuration](../../../docs/configuration/agent-runtimes.md), and [first-owner setup](../development/first-owner-setup.md).

## Verification and limits

- `npm run build` passed after fixing type errors in the new test. Vite reported its large-chunk warning. The build updates `dist/`, which a running server serves directly.
- The five targeted tests for first-run order, runtime installation and set creation, task bindings, Git and schedule defaults, and assistant and project creation passed. The existing `server/agentSets.test.ts` tests also passed. These use isolated browser fixtures and test doubles rather than a provider account.
- `npm run lint` passed with warnings. `npm run check:docs` checked 853 descriptions without errors but failed on 39 existing broken links; no new link errors were found. `git diff --check` passed.
- No deployment or server lifecycle operation was performed. Real provider authentication and installation on a clean host remain unverified.
