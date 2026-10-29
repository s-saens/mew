---
title: "Account-wide and project scopes for agent guidance"
description: "Decision to edit account-wide and current-project guidance together in the default guidance window, retain existing storage locations, permissions, and conflict preservation, and separate project operating rules from global defaults."
created: "2026-10-24"
updated: "2026-10-24"
---

## Status

Accepted. Retains the storage scopes from the [per-account settings decision](../history/decisions/0202-mew-account-agent-settings.md) and adds project editing to the window from the [default guidance settings decision](../history/decisions/0171-mew-agent-guidance-settings.md).

## Background

Account-wide guidance was edited in the agent panel and project guidance in Documents settings, making their scopes difficult to identify. Mistaking repository-specific rules, such as build or server restart restrictions, for global defaults could restrict work in other projects. Users must be able to select the scope and verify the save destination in the same window.

## Decision

Add **Mew global guidance** and **Current project** to the agent default guidance window. Mew global guidance applies to all projects of the signed-in account and does not apply to other accounts. Provide additional guidance editing alongside the existing presets and Git settings; for the current project, allow editing whether automatic guidance is enabled and the project's additional guidance.

Both scopes use their existing canonical sources. Store account-wide guidance in the dedicated settings section of the account-specific `agent-guidance.md`, and project guidance in `<프로젝트>/.mew/agent-context.json`. Do not move or overwrite other settings or free-form guidance. Retain existing global `serverFiles` permissions, the project owner boundary, and revision conflict checks. Preserve drafts if saving fails, and do not save a previous project's draft after switching projects.

Communicate that additional project guidance takes precedence over conflicting Mew global preferences in that project. Retain explicit user requests and the project's existing guidance. Read saved content starting with the next actual ACP request; if automatic project guidance is disabled, pass neither scope.

Each project determines its build, run, and restart restrictions. Do not place blanket prohibitions in the Mew global default template. Keep execution restrictions for the Mew source repository in this repository's `.mew/agent-context.json`, `AGENTS.md`, and development documentation. Do not bulk-search and delete existing user guidance or automatically move it to another scope.

The settings window follows the surface, navigation structure, and common dimensions of the overall Settings popup, with a compact title bar and close icon. Retain small headings and concise rows, using left navigation on desktop and horizontal navigation on mobile to select the scope. The [project settings guide](../../../docs/guides/project-setup.md#edit-the-shared-guidance-file) owns detailed usage, the [session contract](../development/agent-sessions.md#passing-project-context) owns storage and APIs, and the [owning feature document](../features/projects-files-search/project-documentation-guidance-and-initialization.md) owns UI and verification.

## Rationale and Impact

Users can verify the scope and save destination in one window without creating storage that duplicates existing Documents settings. Per-account settings do not become shared across the entire instance, and permissions to edit project settings do not expand. Guidance precedence is guidance passed to the agent; it does not change higher-level runtime instructions or server permissions. Saving alone does not build, run, or restart the app.
