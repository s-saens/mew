---
title: "Configurable default agent build verification"
description: "Makes build verification a configurable, default-on Mew-wide instruction while preserving account guidance, project commands and restrictions, and honest failure reporting. Partially supersedes ADR 0104's project-only default scope; ADR 0153 later replaces the settings UI placement while preserving backend values and source files."
created: "2026-11-02"
updated: "2026-11-06"
---

## Status

Accepted at the user's explicit request. Supersedes only the prohibition on Mew-wide build verification guidance in [ADR 0104](0104-required-agent-build-verification.md). That decision's concrete Mew source build command and restrictions on deployment, launcher execution, and server lifecycle operations remain in force.

[ADR 0153](0153-agent-composer-execution.md) supersedes the Default Instructions build selector and details placement below, and defines per-message execution options. The metadata format, configurable command/scope/failure values, preservation rules, and project restrictions remain in effect.

## Context

ADR 0104 required agents working on Mew's source to build before reporting completion, but excluded that requirement from Mew's defaults. The user requested the same verification expectation across projects, with options for its details. A shared instruction must accommodate different package managers, build commands, documentation-only work, and projects with no build system without copying Mew's own operational restrictions into them.

## Decision

Add per-account **Build verification** to the General group in Default Instructions. Default to **Required**, use the project's documented build command, apply to implementation changes, and ask agents to repair failures and rerun the build. **Build details**, collapsed by default, configures a command, implementation or all-change scope, and repair/retry behavior. **Follow project instructions** adds no separate Mew requirement and retains the other selected values.

An empty command follows the project's documented build and package manager, including `npm run build` for an npm build script. If no build system exists, agents report verification as not applicable rather than installing or creating tooling. Failed or blocked builds must be reported with the actual failure and the work marked incomplete. Disabling automatic repair still requires reporting failures accurately. Applicable tests, lint, and documentation checks remain required.

Store the structured values and matching generated guidance in the account source's `buildVerification` section, using v1 metadata and the existing revision API. Save all build values together after the shared 400ms delay. Existing sources without a section receive effective defaults only when read for context, without source or revision changes. Preserve direct edits and damaged sections; unrelated setting changes must not replace them. An explicit mode selection can replace a custom section, while damaged markers require manual repair.

Explicit user requests, project instructions, and existing permissions remain authoritative. Shared build verification does not authorize deployment, launcher execution, or server lifecycle operations. Mew's source repository continues to specify `npm run build` and its own operational restrictions. Remove only the redundant build requirement from this repository's additional project instructions; do not migrate or rewrite other projects' settings.

## Alternatives and rationale

Keeping verification project-only would require every project to repeat the same completion rule and would not satisfy the request. Hard-coding `npm run build` globally would impose Mew's package manager on unrelated projects. A configurable shared default supplies the completion expectation while retaining project-specific commands and restrictions.

Rewriting existing account files on upgrade would change revisions and risk replacing user guidance. Effective defaults at read time match the existing testing and documentation settings and preserve the account source as the authority. Adding a runtime build gate would require execution and permission controls beyond the requested instruction setting; this decision provides guidance without claiming to enforce or guarantee execution.

## Consequences

New and existing accounts receive build verification guidance on the next request when automatic guidance is enabled. Users can defer to project rules or change details without editing the source file. Failures remain visible regardless of repair settings, and projects with no build system have an explicit outcome. Saving settings alone does not execute a command or verify a build.

The [session contract](../development/agent-sessions.md#passing-project-context) owns the API, metadata, validation, and preservation rules. [Project setup](../../../docs/guides/project-setup.md#build-verification) owns the user controls. The [repository execution rules](../development/getting-started.md) retain Mew's concrete build and operational requirements.
