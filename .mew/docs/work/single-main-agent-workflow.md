---
title: "Remove automatic agent branch workflows"
description: "Records the November 7 removal of account-specific branch strategies and automatic Git workflows, source-preserving legacy compatibility, and verification and server-application boundaries."
created: "2026-11-07"
updated: "2026-11-07"
---

The user requested ordinary development on `main` and removal of branch-strategy settings across accounts. Removed the strategy, automation, and details UI, its generators and types, and branch writes from the settings API. Commit timing and language remain independent. Request context now omits old branch sections while retaining their saved source and supplies the same main workflow to every account.

The [guidance contract](../development/agent-guidance.md#git-working-behavior), [feature contract](../features/projects-files-search/project-documentation-guidance-and-initialization.md), and [ADR 0156](../decisions/0156-single-main-agent-workflow.md) own current behavior. Existing branches, worktrees, and unrelated edits are preserved.

## Verification and application

- Guidance, account, legacy-section, and retry regressions: 43 passed. Coverage includes all v1/v2/v3 strategy and automation combinations, source/revision preservation, independent commit preferences, and damaged-section rejection.
- Chromium settings test passed at 1100, 390, and 320px, including light/dark views, absent strategy and automation controls, independent commit controls, autosave, focus, and conflict recovery. Composer execution checks also passed, including six viewport/theme subtests.
- Extended context, project setup/API, and Git AI Commit checks: 34 passed and one existing CLI project-creation test failed with project folder not found. Reproduced the same failure from an unmodified HEAD source snapshot; unrelated CLI behavior was left unchanged.
- `npm run build` passed, including TypeScript and Vite. Vite reported its bundle-size warning.
- Targeted `oxlint` and `git diff --check` passed.
- `npm run check:docs`: 758 descriptions passed; the link phase reported 37 existing missing-target errors outside the changed documents. All eight changed documents passed scoped description and local-link checks. Existing section anchors were retained.

No Mew server lifecycle operations, deployment, or remote push were performed. The user must apply the server code and reopen existing agent tabs for supervisors to use the new guidance reader. Existing branches and worktrees are not bulk-merged or deleted by this change.
